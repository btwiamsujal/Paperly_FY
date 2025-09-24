const mongoose = require("mongoose");

const NoteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["text", "image", "pdf"],
    required: true,
  },
  content: {
    type: String,
    default: "",
  },
  fileUrl: {
    type: String, // ✅ Cloudinary link for image/pdf
    default: null,
  },
  tags: {
    type: [String],
    default: [],
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Note", NoteSchema);
