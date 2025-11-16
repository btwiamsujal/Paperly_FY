const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { uploadToCloudinary } = require('../utils/cloudStorage');
const mongoose = require('mongoose');

// @desc Send a new message
// @route POST /api/messages/send
// @access Private
const sendMessage = async (req, res) => {
  try {
    const { receiverId, messageType, content, replyTo } = req.body;
    const senderId = req.user.id;

    // Validate receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Prepare message data
    const messageData = {
      senderId,
      receiverId,
      messageType,
      status: 'sent'
    };

    // Handle different message types
    if (messageType === 'text') {
      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required for text messages'
        });
      }
      messageData.content = content;
    } else {
      // Handle file upload for non-text messages
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: `File is required for ${messageType} messages`
        });
      }

      try {
        // Upload file to Cloudinary
        const uploadResult = await uploadToCloudinary(
          req.file.path,
          messageType,
          req.file.originalname
        );

        messageData.fileUrl = uploadResult.url;
        messageData.fileName = req.file.originalname;
        messageData.fileSize = uploadResult.bytes;
        messageData.mimeType = req.file.mimetype;

        // Add duration for voice messages
        if (messageType === 'voice' && uploadResult.duration) {
          messageData.duration = uploadResult.duration;
        }

      } catch (uploadError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to upload file'
        });
      }
    }

    // Add reply reference if provided
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo);
      if (replyMessage) {
        messageData.replyTo = replyTo;
      }
    }

    // Create the message
    const message = await Message.create(messageData);

    // Populate sender and receiver info
    await message.populate('senderId', 'name avatar');
    await message.populate('receiverId', 'name avatar');
    if (message.replyTo) {
      await message.populate('replyTo');
    }

    // Update or create conversation
    const conversation = await Conversation.findOrCreate(senderId, receiverId);
    conversation.lastMessage = message._id;
    conversation.lastActivity = new Date();
    await conversation.incrementUnreadCount(receiverId);

    // Emit real-time event (will be handled by Socket.io)
    const io = req.app.get('io');
    if (io) {
      // Emit to specific user
      io.to(`user_${receiverId}`).emit('newMessage', {
        message,
        conversation: {
          id: conversation._id,
          participants: conversation.participants,
          unreadCount: conversation.getUnreadCountForUser(receiverId)
        }
      });

      // Update message status to delivered if receiver is online
      const onlineUsers = req.app.get('onlineUsers') || new Map();
      if (onlineUsers.has(receiverId.toString())) {
        message.status = 'delivered';
        await message.save();
      }
    }

    res.status(201).json({
      success: true,
      data: message
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

// @desc Get conversation messages between two users
// @route GET /api/messages/:userId
// @access Private
const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { page = 1, limit = 50, before } = req.query;

    // Validate the other user exists
    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const options = {
      limit: parseInt(limit),
      skip: (page - 1) * limit,
    };

    if (before) {
      options.before = new Date(before);
    }

    // Get messages between the two users
    const messages = await Message.getConversation(currentUserId, userId, options);

    // Reverse to show oldest first (for chat display)
    messages.reverse();

    // Get conversation info
    const conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, userId] }
    });

    // Mark messages as delivered for current user
    await Message.updateMany(
      {
        senderId: userId,
        receiverId: currentUserId,
        status: 'sent'
      },
      { status: 'delivered' }
    );

    res.json({
      success: true,
      data: {
        messages,
        conversation: conversation ? {
          id: conversation._id,
          participants: conversation.participants,
          unreadCount: conversation.getUnreadCountForUser(currentUserId),
          lastActivity: conversation.lastActivity
        } : null,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: messages.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

// @desc Mark messages as seen
// @route PATCH /api/messages/:userId/seen
// @access Private
const markMessagesAsSeen = async (req, res) => {
  try {
    const { userId } = req.params; // sender's ID
    const currentUserId = req.user.id; // receiver's ID (current user)

    // Mark all messages from userId to currentUserId as seen
    const result = await Message.updateMany(
      {
        senderId: userId,
        receiverId: currentUserId,
        status: { $ne: 'seen' }
      },
      { status: 'seen' }
    );

    // Update conversation unread count
    const conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, userId] }
    });

    if (conversation) {
      await conversation.resetUnreadCount(currentUserId);
    }

    // Emit real-time event to sender
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('messagesSeen', {
        seenBy: currentUserId,
        conversationId: conversation?._id
      });
    }

    res.json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        conversationId: conversation?._id
      }
    });

  } catch (error) {
    console.error('Mark messages as seen error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as seen'
    });
  }
};

// @desc Get all conversations for current user
// @route GET /api/messages/conversations
// @access Private
const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const conversations = await Conversation.find({
      participants: currentUserId,
      lastMessage: { $exists: true }
    })
    .populate('participants', 'name avatar')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    // Format conversations for frontend
    const formattedConversations = conversations.map(conv => {
      const otherUser = conv.participants.find(p => p._id.toString() !== currentUserId);
      return {
        id: conv._id,
        user: otherUser,
        lastMessage: conv.lastMessage,
        unreadCount: conv.getUnreadCountForUser(currentUserId),
        lastActivity: conv.lastActivity
      };
    });

    res.json({
      success: true,
      data: formattedConversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: conversations.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
};

// @desc Delete a message
// @route DELETE /api/messages/:messageId
// @access Private
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only sender can delete the message
    if (message.senderId.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.receiverId}`).emit('messageDeleted', {
        messageId,
        senderId: currentUserId
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
};

// @desc Get unread message count
// @route GET /api/messages/unread/count
// @access Private
const getUnreadCount = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    
    const count = await Message.getUnreadCount(currentUserId);
    
    res.json({
      success: true,
      data: { unreadCount: count }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count'
    });
  }
};

// @desc Search messages
// @route GET /api/messages/search
// @access Private
const searchMessages = async (req, res) => {
  try {
    const { query, userId, messageType, limit = 20 } = req.query;
    const currentUserId = req.user.id;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchFilter = {
      $or: [
        { senderId: currentUserId },
        { receiverId: currentUserId }
      ],
      content: { $regex: query, $options: 'i' },
      isDeleted: false
    };

    // Filter by specific user if provided
    if (userId) {
      searchFilter.$or = [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ];
    }

    // Filter by message type if provided
    if (messageType) {
      searchFilter.messageType = messageType;
    }

    const messages = await Message.find(searchFilter)
      .populate('senderId', 'name avatar')
      .populate('receiverId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search messages'
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markMessagesAsSeen,
  getConversations,
  deleteMessage,
  getUnreadCount,
  searchMessages
};