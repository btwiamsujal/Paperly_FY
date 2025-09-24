const mongoose = require('mongoose');

const classroomContentSchema = new mongoose.Schema(
  {
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classroom',
      required: false, // ✅ allow uploads without classroom
    },
    type: {
      type: String,
      enum: ['post', 'note', 'resource'],
      required: true,
      default: 'resource', // ✅ default type
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    fileUrl: {
      type: String,
      required: true, // ✅ Cloudinary always gives us this
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // ✅ GridFS fallback (optional)
    },
    fileName: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClassroomContent', classroomContentSchema);
