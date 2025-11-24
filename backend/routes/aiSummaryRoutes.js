const express = require('express');
const router = express.Router();
const aiSummaryController = require('../controllers/aiSummaryController');
const auth = require('../middleware/auth');

// New async endpoints
router.post('/create', auth, aiSummaryController.createSummary);
router.get('/my', auth, aiSummaryController.getMySummaries);
router.get('/:id', auth, aiSummaryController.getSummary);
router.put('/:id', auth, aiSummaryController.updateSummary);
router.delete('/:id', auth, aiSummaryController.deleteSummary);
router.post('/:id/regenerate', auth, aiSummaryController.regenerateSummary);

// Legacy endpoint for backward compatibility
router.post('/', auth, aiSummaryController.saveSummary);

module.exports = router;

