const Classroom = require('../models/Classroom');
const User = require('../models/User');
const ClassroomContent = require('../models/ClassroomContent');
const crypto = require('crypto');

const generateCode = () => crypto.randomBytes(3).toString('hex');

// ✅ Create a classroom
exports.createClassroom = async (req, res) => {
  const { name, subject, description } = req.body;
  const userId = req.user.id;

  try {
    const code = generateCode();
    const classroom = await Classroom.create({
      name,
      subject,
      description,
      code,
      createdBy: userId,
      members: [{
        user: userId,
        role: 'admin', // Creator is automatically admin
        joinedAt: new Date()
      }]
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: { classrooms: classroom._id }
    });

    res.status(201).json({
      message: 'Classroom created',
      classroom: {
        _id: classroom._id,
        name: classroom.name,
        subject: classroom.subject,
        description: classroom.description,
        code: classroom.code
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Join a classroom
exports.joinClassroom = async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;

  try {
    const classroom = await Classroom.findOne({ code });
    if (!classroom) return res.status(404).json({ error: 'Invalid code' });

    // Check if user is already a member
    const existingMember = classroom.members.find(member => 
      member.user.toString() === userId
    );

    if (!existingMember) {
      classroom.members.push({
        user: userId,
        role: 'user', // Joiners get user role by default
        joinedAt: new Date()
      });
      await classroom.save();

      await User.findByIdAndUpdate(userId, {
        $addToSet: { classrooms: classroom._id }
      });
    }

    res.json({
      message: 'Joined classroom',
      classroom: {
        _id: classroom._id,
        name: classroom.name,
        description: classroom.description,
        code: classroom.code
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get all classrooms for the user
exports.getMyClassrooms = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).populate({
      path: 'classrooms',
      populate: { path: 'createdBy', select: 'name email' } // Optional: populate creator details if needed
    });
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Transform classrooms to include the user's role
    const classroomsWithRole = user.classrooms.map(classroom => {
      // Find the member entry for this user
      const member = classroom.members.find(m => m.user.toString() === userId);
      
      return {
        _id: classroom._id,
        name: classroom.name,
        subject: classroom.subject || 'General', // Fallback if subject is missing in model
        code: classroom.code,
        description: classroom.description,
        createdBy: classroom.createdBy,
        createdAt: classroom.createdAt,
        role: member ? member.role : 'user', // Default to user if not found (shouldn't happen)
        joinedAt: member ? member.joinedAt : classroom.createdAt,
        membersCount: classroom.members.length
      };
    });

    res.json({ classrooms: classroomsWithRole });
  } catch (err) {
    console.error("Error in getMyClassrooms:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ DELETE a classroom
exports.deleteClassroom = async (req, res) => {
  const classroomId = req.params.id;
  const userId = req.user.id;

  try {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    if (classroom.createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized to delete this classroom' });
    }

    // Delete classroom content (posts/notes/resources)
    await ClassroomContent.deleteMany({ classroom: classroomId });

    // Remove classroom reference from all users
    await User.updateMany(
      { classrooms: classroomId },
      { $pull: { classrooms: classroomId } }
    );

    // Finally, delete the classroom
    await Classroom.findByIdAndDelete(classroomId);

    res.json({ message: 'Classroom deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Promote user to admin
// ✅ Promote user to sub-admin
exports.promoteUser = async (req, res) => {
  const { classroomId, userId: targetUserId } = req.params;
  const currentUserId = req.user.id;

  try {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Only creator (admin) can promote
    if (classroom.createdBy.toString() !== currentUserId) {
        return res.status(403).json({ message: 'Only the classroom creator can promote members' });
    }

    const member = classroom.members.find(member => 
      member.user.toString() === targetUserId
    );

    if (!member) {
      return res.status(404).json({ message: 'User is not a member of this classroom' });
    }

    if (member.role === 'admin') {
      return res.status(400).json({ message: 'User is already an admin' });
    }
    
    if (member.role === 'sub-admin') {
        return res.status(400).json({ message: 'User is already a sub-admin' });
    }

    member.role = 'sub-admin';
    await classroom.save();

    res.json({ 
      message: 'User promoted to sub-admin successfully',
      member: {
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Demote admin to user
// ✅ Demote sub-admin to user
exports.demoteUser = async (req, res) => {
  const { classroomId, userId: targetUserId } = req.params;
  const currentUserId = req.user.id;

  try {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Only creator (admin) can demote
    if (classroom.createdBy.toString() !== currentUserId) {
        return res.status(403).json({ message: 'Only the classroom creator can demote members' });
    }

    const member = classroom.members.find(member => 
      member.user.toString() === targetUserId
    );

    if (!member) {
      return res.status(404).json({ message: 'User is not a member of this classroom' });
    }

    if (member.role === 'user') {
      return res.status(400).json({ message: 'User is already a regular user' });
    }
    
    if (member.role === 'admin') {
        return res.status(403).json({ message: 'Cannot demote an admin (creator)' });
    }

    member.role = 'user';
    await classroom.save();

    res.json({ 
      message: 'User demoted to regular user successfully',
      member: {
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Remove user from classroom
exports.removeUser = async (req, res) => {
  const { classroomId, userId: targetUserId } = req.params;
  const currentUserId = req.user.id;

  try {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Prevent creator from being removed
    if (classroom.createdBy.toString() === targetUserId) {
      return res.status(403).json({ message: 'Cannot remove the classroom creator' });
    }

    const memberIndex = classroom.members.findIndex(member => 
      member.user.toString() === targetUserId
    );

    if (memberIndex === -1) {
      return res.status(404).json({ message: 'User is not a member of this classroom' });
    }

    classroom.members.splice(memberIndex, 1);
    await classroom.save();

    // Remove classroom from user's classrooms list
    await User.findByIdAndUpdate(targetUserId, {
      $pull: { classrooms: classroomId }
    });

    res.json({ message: 'User removed from classroom successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get classroom members with roles
exports.getClassroomMembers = async (req, res) => {
  const { classroomId } = req.params;

  try {
    const classroom = await Classroom.findById(classroomId)
      .populate('members.user', 'name email')
      .populate('createdBy', 'name email');

    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    const members = classroom.members.map(member => ({
      _id: member.user._id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.joinedAt,
      isCreator: member.user._id.toString() === classroom.createdBy._id.toString()
    }));

    res.json({ 
      members,
      createdBy: {
        _id: classroom.createdBy._id,
        name: classroom.createdBy.name,
        email: classroom.createdBy.email
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
