const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Notification types
const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'NEW_MESSAGE',
  MESSAGE_SEEN: 'MESSAGE_SEEN',
  USER_ONLINE: 'USER_ONLINE',
  USER_OFFLINE: 'USER_OFFLINE',
  TYPING_START: 'TYPING_START',
  TYPING_STOP: 'TYPING_STOP'
};

// Create a notification object
const createNotification = (type, data, recipientId) => {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    recipientId,
    createdAt: new Date(),
    isRead: false
  };
};

// Send push notification (placeholder for future implementation)
const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // This would integrate with a push notification service like:
    // - Firebase Cloud Messaging (FCM)
    // - Apple Push Notification Service (APNs)
    // - OneSignal
    // - Pusher Beams
    
    console.log(`📱 Push notification for user ${userId}:`, {
      title,
      body,
      data
    });

    // Placeholder implementation
    return {
      success: true,
      messageId: `push_${Date.now()}`
    };
  } catch (error) {
    console.error('Push notification error:', error);
    return { success: false, error: error.message };
  }
};

// Send email notification (placeholder for future implementation)
const sendEmailNotification = async (userEmail, subject, htmlContent) => {
  try {
    // This would integrate with email services like:
    // - SendGrid
    // - Mailgun
    // - AWS SES
    // - Nodemailer
    
    console.log(`📧 Email notification to ${userEmail}:`, {
      subject,
      preview: htmlContent.substring(0, 100) + '...'
    });

    // Placeholder implementation
    return {
      success: true,
      messageId: `email_${Date.now()}`
    };
  } catch (error) {
    console.error('Email notification error:', error);
    return { success: false, error: error.message };
  }
};

// Format message for notification display
const formatMessageForNotification = (message) => {
  const sender = message.senderId;
  let content = '';

  switch (message.messageType) {
    case 'text':
      content = message.content;
      break;
    case 'voice':
      content = '🎵 Voice message';
      break;
    case 'media':
      content = message.mimeType?.startsWith('image/') ? '📷 Image' : '🎥 Video';
      break;
    case 'document':
      content = `📄 ${message.fileName || 'Document'}`;
      break;
    default:
      content = 'New message';
  }

  return {
    title: sender.name,
    body: content,
    avatar: sender.avatar,
    messageId: message._id,
    conversationId: message.conversationId
  };
};

// Get unread conversations count for a user
const getUnreadConversationsCount = async (userId) => {
  try {
    const count = await Conversation.countDocuments({
      participants: userId,
      [`unreadCount.${userId}`]: { $gt: 0 }
    });
    return count;
  } catch (error) {
    console.error('Get unread conversations count error:', error);
    return 0;
  }
};

// Mark conversation as read
const markConversationAsRead = async (userId, conversationId) => {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (conversation && conversation.participants.includes(userId)) {
      await conversation.resetUnreadCount(userId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Mark conversation as read error:', error);
    return false;
  }
};

// Get conversation preview (last few messages)
const getConversationPreview = async (conversationId, limit = 5) => {
  try {
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'name avatar')
      .populate('lastMessage');

    if (!conversation) return null;

    const recentMessages = await Message.find({
      $or: [
        { senderId: conversation.participants[0]._id, receiverId: conversation.participants[1]._id },
        { senderId: conversation.participants[1]._id, receiverId: conversation.participants[0]._id }
      ],
      isDeleted: false
    })
    .populate('senderId', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit);

    return {
      conversation,
      recentMessages: recentMessages.reverse()
    };
  } catch (error) {
    console.error('Get conversation preview error:', error);
    return null;
  }
};

// Generate conversation summary for notifications
const generateConversationSummary = async (userId, otherUserId) => {
  try {
    const otherUser = await User.findById(otherUserId).select('name avatar');
    const unreadCount = await Message.countDocuments({
      senderId: otherUserId,
      receiverId: userId,
      status: { $ne: 'seen' },
      isDeleted: false
    });

    return {
      user: otherUser,
      unreadCount,
      hasUnread: unreadCount > 0
    };
  } catch (error) {
    console.error('Generate conversation summary error:', error);
    return null;
  }
};

// Batch update message statuses
const batchUpdateMessageStatus = async (messageIds, status) => {
  try {
    const result = await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { status } }
    );
    return result;
  } catch (error) {
    console.error('Batch update message status error:', error);
    throw error;
  }
};

// Clean up old deleted messages (utility for background jobs)
const cleanupDeletedMessages = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Message.deleteMany({
      isDeleted: true,
      deletedAt: { $lt: cutoffDate }
    });

    console.log(`🗑️ Cleaned up ${result.deletedCount} old deleted messages`);
    return result;
  } catch (error) {
    console.error('Cleanup deleted messages error:', error);
    throw error;
  }
};

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  sendPushNotification,
  sendEmailNotification,
  formatMessageForNotification,
  getUnreadConversationsCount,
  markConversationAsRead,
  getConversationPreview,
  generateConversationSummary,
  batchUpdateMessageStatus,
  cleanupDeletedMessages
};