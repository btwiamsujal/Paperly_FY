const AISummary = require('../models/AISummary');
const { processSummaryRequest } = require('../services/summarizationService');

// Create a new summary (returns immediately with PENDING status)
exports.createSummary = async (req, res) => {
  try {
    const { fileUrl, title, originalFileName } = req.body;
    const userId = req.user.id;

    if (!fileUrl || !title) {
      return res.status(400).json({ message: 'fileUrl and title are required' });
    }

    // Create summary record with PENDING status
    const summary = await AISummary.create({
      userId,
      title,
      fileUrl,
      originalFileName: originalFileName || title,
      status: 'PENDING'
    });

    // Start async processing (don't await)
    processSummaryRequest(summary._id, fileUrl, userId).catch(err => {
      console.error('Background summarization error:', err);
    });

    // Return immediately with summary ID
    res.status(201).json({
      message: 'Summary creation started',
      summary: {
        _id: summary._id,
        title: summary.title,
        status: summary.status,
        createdAt: summary.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating summary:', error);
    res.status(500).json({ message: 'Server error creating summary' });
  }
};

// Get a specific summary by ID (with ownership check)
exports.getSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const summary = await AISummary.findOne({ _id: id, userId });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found or unauthorized' });
    }

    res.json(summary);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: 'Server error fetching summary' });
  }
};

// Get all summaries for the current user (with pagination)
exports.getMySummaries = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [summaries, total] = await Promise.all([
      AISummary.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      AISummary.countDocuments({ userId })
    ]);

    res.json({
      summaries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching summaries:', error);
    res.status(500).json({ message: 'Server error fetching summaries' });
  }
};

// Update a summary (ownership check)
exports.updateSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title } = req.body;

    const summary = await AISummary.findOneAndUpdate(
      { _id: id, userId },
      { title, updatedAt: Date.now() },
      { new: true }
    );

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found or unauthorized' });
    }

    res.json(summary);
  } catch (error) {
    console.error('Error updating summary:', error);
    res.status(500).json({ message: 'Server error updating summary' });
  }
};

// Delete a summary (ownership check)
exports.deleteSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const summary = await AISummary.findOneAndDelete({ _id: id, userId });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found or unauthorized' });
    }

    res.json({ message: 'Summary deleted successfully' });
  } catch (error) {
    console.error('Error deleting summary:', error);
    res.status(500).json({ message: 'Server error deleting summary' });
  }
};

// Regenerate a failed summary
exports.regenerateSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const summary = await AISummary.findOne({ _id: id, userId });

    if (!summary) {
      return res.status(404).json({ message: 'Summary not found or unauthorized' });
    }

    // Reset to PENDING status
    summary.status = 'PENDING';
    summary.errorMessage = '';
    summary.updatedAt = Date.now();
    await summary.save();

    // Start async processing (don't await)
    processSummaryRequest(summary._id, summary.fileUrl, userId).catch(err => {
      console.error('Background regeneration error:', err);
    });

    res.json({
      message: 'Summary regeneration started',
      summary: {
        _id: summary._id,
        title: summary.title,
        status: summary.status,
        updatedAt: summary.updatedAt
      }
    });
  } catch (error) {
    console.error('Error regenerating summary:', error);
    res.status(500).json({ message: 'Server error regenerating summary' });
  }
};

// Legacy endpoint for backward compatibility
exports.saveSummary = async (req, res) => {
  try {
    const { title, content, originalFileId } = req.body;
    const userId = req.user.id;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const summary = await AISummary.create({
      userId,
      title,
      content,
      originalFileId,
      status: 'COMPLETED' // Legacy summaries are already completed
    });

    res.status(201).json(summary);
  } catch (error) {
    console.error('Error saving summary:', error);
    res.status(500).json({ message: 'Server error saving summary' });
  }
};

