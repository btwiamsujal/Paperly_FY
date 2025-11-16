const multer = require('multer');
const path = require('path');

// File type validation
const fileFilter = (req, file, cb) => {
  // Define allowed file types for each message type
  const allowedTypes = {
    voice: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm'],
    media: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
    document: ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  };

  const messageType = req.body.messageType || req.query.messageType;

  if (!messageType || messageType === 'text') {
    return cb(new Error('No file upload required for text messages'));
  }

  if (!allowedTypes[messageType]) {
    return cb(new Error('Invalid message type'));
  }

  if (!allowedTypes[messageType].includes(file.mimetype)) {
    return cb(new Error(`Invalid file type for ${messageType} message. Allowed types: ${allowedTypes[messageType].join(', ')}`));
  }

  cb(null, true);
};

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// Create multer instances for different use cases
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// Middleware for single file upload (for messages)
const uploadSingle = upload.single('file');

// Error handling middleware for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size allowed is 50MB.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Use "file" as the field name.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

// Validation middleware for message data
const validateMessageData = (req, res, next) => {
  const { messageType, receiverId } = req.body;

  // Check required fields
  if (!receiverId) {
    return res.status(400).json({
      success: false,
      message: 'Receiver ID is required'
    });
  }

  if (!messageType) {
    return res.status(400).json({
      success: false,
      message: 'Message type is required'
    });
  }

  // Validate message type
  const validTypes = ['text', 'voice', 'media', 'document'];
  if (!validTypes.includes(messageType)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid message type. Allowed types: ' + validTypes.join(', ')
    });
  }

  // For text messages, content is required
  if (messageType === 'text' && !req.body.content) {
    return res.status(400).json({
      success: false,
      message: 'Content is required for text messages'
    });
  }

  // For non-text messages, file is required
  if (messageType !== 'text' && !req.file) {
    return res.status(400).json({
      success: false,
      message: `File is required for ${messageType} messages`
    });
  }

  next();
};

// Get file category based on MIME type
const getFileCategory = (mimetype) => {
  if (mimetype.startsWith('audio/')) return 'voice';
  if (mimetype.startsWith('image/') || mimetype.startsWith('video/')) return 'media';
  if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('presentation') || mimetype.includes('text/')) return 'document';
  return 'unknown';
};

module.exports = {
  uploadSingle,
  handleUploadError,
  validateMessageData,
  getFileCategory
};