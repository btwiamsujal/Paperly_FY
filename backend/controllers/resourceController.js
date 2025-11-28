const Resource = require('../models/Resource');
const Classroom = require('../models/Classroom');
const path = require('path');
const fs = require('fs');
const { cloudinary } = require('../config/cloudinary');

// Create a new resource
exports.createResource = async (req, res) => {
  try {
    console.log('📥 createResource called');
    console.log('📝 Body:', req.body);
    console.log('📁 File:', req.file);

    const { classroomId } = req.params;
    const { title, description } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Check if user is a member
    const isMember = classroom.members.some(member => member.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this classroom' });
    }

    // Handle Cloudinary or Local file
    const fileUrl = req.file.path || req.file.location; // Cloudinary uses 'path' or 'secure_url'
    const filename = req.file.filename; // Cloudinary public_id

    const resource = new Resource({
      classroom: classroomId,
      title,
      description,
      filename: filename,
      originalName: req.file.originalname,
      fileUrl: fileUrl,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: userId
    });

    await resource.save();

    // Populate uploader details for immediate display
    await resource.populate('uploadedBy', 'name');

    res.status(201).json(resource);
  } catch (error) {
    console.error('Error creating resource:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all resources for a classroom
exports.getResources = async (req, res) => {
  try {
    const { classroomId } = req.params;
    const userId = req.user.id;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Check if user is a member
    const isMember = classroom.members.some(member => member.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this classroom' });
    }

    const resources = await Resource.find({ classroom: classroomId })
      .populate('uploadedBy', 'name')
      .sort({ uploadedAt: -1 });

    res.json({ resources });
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a resource
exports.updateResource = async (req, res) => {
  try {
    const { classroomId, resourceId } = req.params;
    const { title, description } = req.body;
    const userId = req.user.id;

    const resource = await Resource.findOne({ _id: resourceId, classroom: classroomId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    // Check permissions: Owner or Admin
    const classroom = await Classroom.findById(classroomId);
    const member = classroom.members.find(m => m.user.toString() === userId);
    const isOwner = resource.uploadedBy.toString() === userId;
    const isAdmin = member && (member.role === 'admin' || member.role === 'sub-admin');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to update this resource' });
    }

    resource.title = title || resource.title;
    resource.description = description || resource.description;

    await resource.save();
    res.json(resource);
  } catch (error) {
    console.error('Error updating resource:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a resource
exports.deleteResource = async (req, res) => {
  try {
    const { classroomId, resourceId } = req.params;
    const userId = req.user.id;

    const resource = await Resource.findOne({ _id: resourceId, classroom: classroomId });
    if (!resource) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    // Check permissions: Owner or Admin
    const classroom = await Classroom.findById(classroomId);
    const member = classroom.members.find(m => m.user.toString() === userId);
    const isOwner = resource.uploadedBy.toString() === userId;
    const isAdmin = member && (member.role === 'admin' || member.role === 'sub-admin');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this resource' });
    }

    // Delete file from Cloudinary or Filesystem
    if (resource.filename) {
        // Check if it looks like a Cloudinary public ID (usually doesn't have extension in ID, but let's try destroy)
        // Or if it was a local file (check if file exists locally)
        const localPath = path.join(__dirname, '../uploads', resource.filename);
        if (fs.existsSync(localPath)) {
             fs.unlinkSync(localPath);
        } else {
            // Assume Cloudinary
            // Cloudinary public_id usually doesn't include the folder if not specified, but here we used 'classroom_resources'
            // We need to pass the public_id. If filename is the public_id, we are good.
            // Note: multer-storage-cloudinary usually sets filename to the public_id
            await cloudinary.uploader.destroy(resource.filename);
        }
    }

    await Resource.deleteOne({ _id: resourceId });
    res.json({ message: 'Resource deleted successfully' });
  } catch (error) {
    console.error('Error deleting resource:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
