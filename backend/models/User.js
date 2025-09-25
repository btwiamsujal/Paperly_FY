const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  avatar: {
    type: String // Cloudinary URL - no default
  },
  classrooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
