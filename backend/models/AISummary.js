const mongoose = require('mongoose');

const aiSummarySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index for fast per-user queries
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true // Index for filtering by status
  },
  // Summary content (populated when status is COMPLETED)
  summary: {
    overview: {
      type: String,
      default: ''
    },
    key_points: {
      type: [String],
      default: []
    },
    highlights: {
      type: [String],
      default: []
    }
  },
  // Legacy field for backward compatibility
  content: {
    type: String,
    default: ''
  },
  originalFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  },
  originalFileName: {
    type: String,
    default: ''
  },
  // Processing metadata
  processingTime: {
    type: Number, // milliseconds
    default: 0
  },
  errorMessage: {
    type: String,
    default: ''
  },
  metadata: {
    chunkCount: {
      type: Number,
      default: 0
    },
    modelUsed: {
      type: String,
      default: ''
    },
    totalChars: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
aiSummarySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index for efficient user + status queries
aiSummarySchema.index({ userId: 1, status: 1 });
aiSummarySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AISummary', aiSummarySchema);
