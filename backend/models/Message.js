const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'voice', 'media', 'document'],
    required: true
  },
  content: {
    type: String,
    required: function() {
      return this.messageType === 'text';
    }
  },
  fileUrl: {
    type: String,
    required: function() {
      return this.messageType !== 'text';
    }
  },
  fileName: {
    type: String, // Original filename for documents
    required: function() {
      return this.messageType === 'document';
    }
  },
  fileSize: {
    type: Number, // File size in bytes
  },
  mimeType: {
    type: String, // MIME type of the file
  },
  duration: {
    type: Number, // Duration in seconds for voice messages
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  editedAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true // Creates createdAt and updatedAt automatically
});

// Compound index for efficient chat history queries
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

// Index for status updates
messageSchema.index({ receiverId: 1, status: 1 });

// Virtual for conversation participants (useful for queries)
messageSchema.virtual('participants').get(function() {
  return [this.senderId, this.receiverId].sort();
});

// Static method to get conversation between two users
messageSchema.statics.getConversation = function(user1Id, user2Id, options = {}) {
  const { limit = 50, skip = 0, before } = options;
  
  const query = {
    $or: [
      { senderId: user1Id, receiverId: user2Id },
      { senderId: user2Id, receiverId: user1Id }
    ],
    isDeleted: false
  };

  if (before) {
    query.createdAt = { $lt: before };
  }

  return this.find(query)
    .populate('senderId', 'name avatar')
    .populate('receiverId', 'name avatar')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to mark messages as seen
messageSchema.statics.markAsSeen = function(senderId, receiverId) {
  return this.updateMany(
    {
      senderId: senderId,
      receiverId: receiverId,
      status: { $ne: 'seen' }
    },
    {
      $set: { status: 'seen' }
    }
  );
};

// Static method to get unread message count
messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    receiverId: userId,
    status: { $ne: 'seen' },
    isDeleted: false
  });
};

module.exports = mongoose.model('Message', messageSchema);