const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  filename: { type: String, required: true },
  originalName: { type: String },
  fileUrl: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Resource', resourceSchema);
