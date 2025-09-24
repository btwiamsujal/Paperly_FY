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
    type: String, // Cloudinary URL
    default: "https://res.cloudinary.com/demo/image/upload/v1690000000/default-avatar.png"
  },
  classrooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Classroom',
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
