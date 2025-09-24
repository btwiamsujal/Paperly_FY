const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: { type: String, required: true },
  attachments: [{ type: String }], // Cloudinary URLs for images/files
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);
