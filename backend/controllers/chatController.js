const Chat = require('../models/chat');
const cloudinary = require('cloudinary').v2;

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// @desc Get all chat messages
// @route GET /api/chat
exports.getChats = async (req, res) => {
  try {
    const chats = await Chat.find()
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 }); // oldest → newest
    res.json(chats);
  } catch (err) {
    console.error("❌ Error fetching chats:", err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Send new chat message
// @route POST /api/chat
exports.sendChat = async (req, res) => {
  try {
    const { message } = req.body;
    const senderId = req.user?.id || req.user?._id; // from auth middleware
    if (!senderId) return res.status(401).json({ message: 'Unauthorized' });
    let attachments = [];

    // If files were uploaded → push Cloudinary URLs
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await cloudinary.uploader.upload(file.path, {
          folder: "chat_attachments"
        });
        attachments.push(uploaded.secure_url);
      }
    }

    const chat = await Chat.create({ sender: senderId, message, attachments });
    const populatedChat = await chat.populate('sender', 'name avatar');

    res.status(201).json(populatedChat);
  } catch (err) {
    console.error("❌ Error sending chat:", err.message);
    res.status(500).json({ message: 'Server error' });
  }
};
