const express = require('express');
const router = express.Router();
const { addContent, getClassroomContent, summarizeContent } = require('../controllers/postController');
const auth = require('../middleware/auth');

// ✅ Add content to a specific classroom (POST)
router.post('/:classroomId/add', auth, addContent);

// ✅ Get all content for a classroom (GET)
router.get('/:classroomId', auth, getClassroomContent);

// ✅ Summarize a specific content item (POST)
router.post('/summarize/:contentId', auth, summarizeContent);

module.exports = router;
