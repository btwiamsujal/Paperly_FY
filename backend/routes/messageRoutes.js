const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  uploadSingle, 
  handleUploadError, 
  validateMessageData 
} = require('../middleware/upload');
const {
  sendMessage,
  getConversations,
  getUnreadCount,
  searchMessages,
  getMessages,
  markMessagesAsSeen,
  deleteMessage,
  acceptRequest,
  deleteRequest
} = require('../controllers/messageController');

// All routes require authentication
router.use(auth);

// @route POST /api/messages/send
// @desc Send a new message
// @access Private
router.post('/send', uploadSingle, handleUploadError, validateMessageData, sendMessage);

// @route GET /api/messages/conversations
// @desc Get all conversations for current user
// @access Private
router.get('/conversations', getConversations);

// @route GET /api/messages/unread/count
// @desc Get unread message count
// @access Private
router.get('/unread/count', getUnreadCount);

// @route GET /api/messages/search
// @desc Search messages
// @access Private
router.get('/search', searchMessages);

// @route GET /api/messages/:userId
// @desc Get conversation messages between current user and specified user
// @access Private
router.get('/:userId', getMessages);

// @route PATCH /api/messages/:userId/seen
// @desc Mark all messages from userId as seen
// @access Private
router.patch('/:userId/seen', markMessagesAsSeen);

// @route DELETE /api/messages/:messageId
// @desc Delete a message (soft delete)
// @access Private
router.delete('/:messageId', deleteMessage);

// @route PATCH /api/messages/requests/:id/accept
// @desc Accept a message request
// @access Private
router.patch('/requests/:id/accept', acceptRequest);

// @route DELETE /api/messages/requests/:id
// @desc Decline/Delete a message request
// @access Private
router.delete('/requests/:id', deleteRequest);

module.exports = router;