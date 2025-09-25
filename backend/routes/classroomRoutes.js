const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkClassroomAdmin, checkClassroomMember } = require('../middleware/classroomAuth');
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
router.delete('/:id', auth, classroomController.deleteClassroom);

// ✅ Get classroom members with roles
router.get('/:classroomId/members', auth, checkClassroomMember, classroomController.getClassroomMembers);

// ✅ Promote user to admin (admin only)
router.patch('/:classroomId/members/:userId/promote', auth, checkClassroomAdmin, classroomController.promoteUser);

// ✅ Demote user from admin to user (admin only)
router.patch('/:classroomId/members/:userId/demote', auth, checkClassroomAdmin, classroomController.demoteUser);

// ✅ Remove user from classroom (admin only)
router.delete('/:classroomId/members/:userId', auth, checkClassroomAdmin, classroomController.removeUser);

module.exports = router;
