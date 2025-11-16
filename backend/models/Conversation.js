const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Ensure participants array is always sorted for consistency
conversationSchema.pre('save', function(next) {
  if (this.participants && this.participants.length === 2) {
    this.participants.sort();
  }
  next();
});

// Compound index for finding conversations by participants
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });

// Static method to find or create conversation between two users
conversationSchema.statics.findOrCreate = async function(user1Id, user2Id) {
  const participants = [user1Id, user2Id].sort();
  
  let conversation = await this.findOne({ participants });
  
  if (!conversation) {
    conversation = await this.create({
      participants,
      unreadCount: new Map([
        [user1Id.toString(), 0],
        [user2Id.toString(), 0]
      ])
    });
  }
  
  return conversation;
};

// Instance method to get unread count for a specific user
conversationSchema.methods.getUnreadCountForUser = function(userId) {
  return this.unreadCount.get(userId.toString()) || 0;
};

// Instance method to increment unread count for a user
conversationSchema.methods.incrementUnreadCount = function(userId) {
  const currentCount = this.unreadCount.get(userId.toString()) || 0;
  this.unreadCount.set(userId.toString(), currentCount + 1);
  return this.save();
};

// Instance method to reset unread count for a user
conversationSchema.methods.resetUnreadCount = function(userId) {
  this.unreadCount.set(userId.toString(), 0);
  return this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);