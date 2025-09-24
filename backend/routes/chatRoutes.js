const express = require('express');
const multer = require('multer');
const { getChats, sendChat } = require('../controllers/chatController');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// GET all chat messages (protected)
router.get('/', auth, getChats);

// POST new chat message (with optional file upload) (protected)
router.post('/', auth, upload.array('attachments', 5), sendChat);

module.exports = router;
