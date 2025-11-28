const express = require('express');
const router = express.Router();
const aiSummaryController = require('../controllers/aiSummaryController');
const auth = require('../middleware/auth');

// POST /api/summarize - Direct summarization endpoint
router.post('/', auth, aiSummaryController.summarize);

module.exports = router;
