const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Store online users
const onlineUsers = new Map();
const typingUsers = new Map(); // userId -> { roomId, timeout }

// Socket.io authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
                  (socket.handshake.headers?.authorization || '').replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name avatar');
    
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.userId = decoded.id;
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication error: Invalid token'));
  }
};

// Initialize Socket.io chat functionality
const initializeChatSocket = (io) => {
  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    console.log(`🟢 User connected: ${socket.user.name} (${socket.userId})`);

    // Add user to online users
    onlineUsers.set(socket.userId, {
      id: socket.userId,
      name: socket.user.name,
      avatar: socket.user.avatar,
      socketId: socket.id,
      status: 'online',
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Broadcast user online status
    socket.broadcast.emit('userOnline', {
      userId: socket.userId,
      user: socket.user
    });

    // Send current online users to the newly connected user
    socket.emit('onlineUsers', Array.from(onlineUsers.values()));

    // Handle joining conversation rooms
    socket.on('joinConversation', async ({ otherUserId }) => {
      try {
        const roomId = [socket.userId, otherUserId].sort().join('_');
        socket.join(roomId);
        
        console.log(`User ${socket.userId} joined conversation room: ${roomId}`);
        
        // Mark messages as delivered
        await Message.updateMany(
          {
            senderId: otherUserId,
            receiverId: socket.userId,
            status: 'sent'
          },
          { status: 'delivered' }
        );

        // Notify sender that messages were delivered
        socket.to(`user_${otherUserId}`).emit('messagesDelivered', {
          conversationId: roomId,
          deliveredTo: socket.userId
        });

      } catch (error) {
        console.error('Join conversation error:', error);
      }
    });

    // Handle leaving conversation rooms
    socket.on('leaveConversation', ({ otherUserId }) => {
      const roomId = [socket.userId, otherUserId].sort().join('_');
      socket.leave(roomId);
      console.log(`User ${socket.userId} left conversation room: ${roomId}`);
    });

    // Handle real-time message sending (backup for HTTP API)
    socket.on('sendMessage', async (data) => {
      try {
        const { receiverId, messageType, content, replyTo } = data;

        // Basic validation
        if (!receiverId || !messageType) {
          socket.emit('error', { message: 'Missing required fields' });
          return;
        }

        if (messageType === 'text' && !content) {
          socket.emit('error', { message: 'Content required for text messages' });
          return;
        }

        // Create message (simplified version, file uploads should use HTTP API)
        const messageData = {
          senderId: socket.userId,
          receiverId,
          messageType,
          content: messageType === 'text' ? content : undefined,
          replyTo,
          status: 'sent'
        };

        const message = await Message.create(messageData);
        await message.populate('senderId', 'name avatar');
        await message.populate('receiverId', 'name avatar');
        if (message.replyTo) {
          await message.populate('replyTo');
        }

        // Update conversation
        const conversation = await Conversation.findOrCreate(socket.userId, receiverId);
        conversation.lastMessage = message._id;
        conversation.lastActivity = new Date();
        await conversation.incrementUnreadCount(receiverId);

        // Check if receiver is online and update status
        if (onlineUsers.has(receiverId)) {
          message.status = 'delivered';
          await message.save();
        }

        // Emit to receiver
        socket.to(`user_${receiverId}`).emit('newMessage', {
          message,
          conversation: {
            id: conversation._id,
            participants: conversation.participants,
            unreadCount: conversation.getUnreadCountForUser(receiverId)
          }
        });

        // Confirm to sender
        socket.emit('messageSent', {
          tempId: data.tempId, // For frontend message mapping
          message
        });

      } catch (error) {
        console.error('Send message socket error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('startTyping', ({ receiverId }) => {
      if (!receiverId) return;

      const conversationId = [socket.userId, receiverId].sort().join('_');
      
      // Clear existing typing timeout
      if (typingUsers.has(socket.userId)) {
        clearTimeout(typingUsers.get(socket.userId).timeout);
      }

      // Set typing status
      const timeout = setTimeout(() => {
        socket.to(`user_${receiverId}`).emit('stopTyping', {
          userId: socket.userId,
          conversationId
        });
        typingUsers.delete(socket.userId);
      }, 3000); // Stop typing after 3 seconds

      typingUsers.set(socket.userId, { receiverId, timeout });

      // Emit typing event to receiver
      socket.to(`user_${receiverId}`).emit('startTyping', {
        userId: socket.userId,
        user: socket.user,
        conversationId
      });
    });

    socket.on('stopTyping', ({ receiverId }) => {
      if (!receiverId) return;

      const conversationId = [socket.userId, receiverId].sort().join('_');

      // Clear typing timeout
      if (typingUsers.has(socket.userId)) {
        clearTimeout(typingUsers.get(socket.userId).timeout);
        typingUsers.delete(socket.userId);
      }

      // Emit stop typing event
      socket.to(`user_${receiverId}`).emit('stopTyping', {
        userId: socket.userId,
        conversationId
      });
    });

    // Handle message seen events
    socket.on('markAsSeen', async ({ senderId, conversationId }) => {
      try {
        // Mark messages as seen
        await Message.updateMany(
          {
            senderId,
            receiverId: socket.userId,
            status: { $ne: 'seen' }
          },
          { status: 'seen' }
        );

        // Update conversation
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.resetUnreadCount(socket.userId);
        }

        // Notify sender
        socket.to(`user_${senderId}`).emit('messagesSeen', {
          seenBy: socket.userId,
          conversationId,
          seenAt: new Date()
        });

      } catch (error) {
        console.error('Mark as seen error:', error);
      }
    });

    // Handle user status updates
    socket.on('updateStatus', ({ status }) => {
      if (['online', 'away', 'busy'].includes(status)) {
        const user = onlineUsers.get(socket.userId);
        if (user) {
          user.status = status;
          onlineUsers.set(socket.userId, user);
          
          // Broadcast status update
          socket.broadcast.emit('userStatusUpdate', {
            userId: socket.userId,
            status
          });
        }
      }
    });

    // Handle message deletion
    socket.on('deleteMessage', async ({ messageId, receiverId }) => {
      try {
        const message = await Message.findById(messageId);
        
        if (!message || message.senderId.toString() !== socket.userId) {
          socket.emit('error', { message: 'Unauthorized or message not found' });
          return;
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();

        // Notify receiver
        socket.to(`user_${receiverId}`).emit('messageDeleted', {
          messageId,
          senderId: socket.userId
        });

        // Confirm to sender
        socket.emit('messageDeletedConfirm', { messageId });

      } catch (error) {
        console.error('Delete message socket error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle voice call events (for future implementation)
    socket.on('initiateCall', ({ receiverId, callType }) => {
      socket.to(`user_${receiverId}`).emit('incomingCall', {
        callerId: socket.userId,
        caller: socket.user,
        callType, // 'voice' or 'video'
        timestamp: new Date()
      });
    });

    socket.on('callResponse', ({ callerId, accepted }) => {
      socket.to(`user_${callerId}`).emit('callResponse', {
        responderId: socket.userId,
        accepted,
        timestamp: new Date()
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`🔴 User disconnected: ${socket.user.name} (${socket.userId})`);

      // Clear typing timeout
      if (typingUsers.has(socket.userId)) {
        clearTimeout(typingUsers.get(socket.userId).timeout);
        typingUsers.delete(socket.userId);
      }

      // Update user's last seen
      const user = onlineUsers.get(socket.userId);
      if (user) {
        user.lastSeen = new Date();
        user.status = 'offline';
      }

      // Remove from online users
      onlineUsers.delete(socket.userId);

      // Broadcast user offline status
      socket.broadcast.emit('userOffline', {
        userId: socket.userId,
        lastSeen: new Date()
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Store references for access from HTTP controllers
  io.onlineUsers = onlineUsers;
  io.typingUsers = typingUsers;

  return io;
};

module.exports = {
  initializeChatSocket,
  onlineUsers,
  typingUsers
};