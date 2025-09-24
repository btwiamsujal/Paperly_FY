const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const classroomController = require('../controllers/classroomController');
const postController = require('../controllers/postController');

// ✅ Create a new classroom
router.post('/create', auth, classroomController.createClassroom);

// ✅ Join an existing classroom
router.post('/join', auth, classroomController.joinClassroom);

// ✅ Get all classrooms joined/created by the user
router.get('/my', auth, classroomController.getMyClassrooms);

// ✅ Add content (post/note/resource) to a classroom
router.post('/:id/add', auth, postController.addContent);

// ✅ Delete a classroom (and its content)
router.delete('/:id', auth, classroomController.deleteClassroom);  // <-- New route added

module.exports = router;
