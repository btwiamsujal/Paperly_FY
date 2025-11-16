const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file to Cloudinary based on message type
const uploadToCloudinary = async (filePath, messageType, fileName) => {
  try {
    let uploadOptions = {
      folder: `paparly/messages/${messageType}`,
      resource_type: 'auto', // Automatically detect resource type
      use_filename: true,
      unique_filename: true,
    };

    // Specific configurations for different message types
    switch (messageType) {
      case 'voice':
        uploadOptions.resource_type = 'video'; // Audio files are uploaded as video type in Cloudinary
        uploadOptions.folder = 'paparly/messages/voice';
        break;

      case 'media':
        // For images and videos
        const ext = path.extname(filePath).toLowerCase();
        if (['.mp4', '.webm', '.mov'].includes(ext)) {
          uploadOptions.resource_type = 'video';
          uploadOptions.folder = 'paparly/messages/videos';
        } else {
          uploadOptions.resource_type = 'image';
          uploadOptions.folder = 'paparly/messages/images';
          // Image optimization
          uploadOptions.quality = 'auto';
          uploadOptions.fetch_format = 'auto';
        }
        break;

      case 'document':
        uploadOptions.resource_type = 'raw'; // For documents
        uploadOptions.folder = 'paparly/messages/documents';
        break;
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);

    // Delete local file after successful upload
    fs.unlinkSync(filePath);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes,
      duration: result.duration || null, // For audio/video files
      width: result.width || null,
      height: result.height || null
    };

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    
    // Delete local file even if upload failed
    try {
      fs.unlinkSync(filePath);
    } catch (deleteError) {
      console.error('Error deleting local file:', deleteError);
    }

    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

// Generate thumbnail for video files
const generateVideoThumbnail = async (publicId) => {
  try {
    const thumbnailUrl = cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: [
        { width: 300, height: 300, crop: 'fill', quality: 'auto' },
        { format: 'jpg' }
      ]
    });
    return thumbnailUrl;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return null;
  }
};

// Get file info from Cloudinary
const getFileInfo = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Get file info error:', error);
    throw new Error(`Failed to get file info: ${error.message}`);
  }
};

// Validate file before upload
const validateFile = (filePath, messageType) => {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const maxSizes = {
      voice: 25 * 1024 * 1024, // 25MB for voice
      media: 50 * 1024 * 1024, // 50MB for media
      document: 50 * 1024 * 1024 // 50MB for documents
    };

    if (fileSize > maxSizes[messageType]) {
      return {
        valid: false,
        error: `File size exceeds limit for ${messageType} messages`
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Failed to validate file'
    };
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  generateVideoThumbnail,
  getFileInfo,
  validateFile
};