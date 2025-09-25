const Classroom = require('../models/Classroom');

// Middleware to check if user is admin of a classroom
exports.checkClassroomAdmin = async (req, res, next) => {
  try {
    const classroomId = req.params.classroomId || req.params.id;
    const userId = req.user.id;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Check if user is creator (always admin)
    if (classroom.createdBy.toString() === userId) {
      req.isClassroomCreator = true;
      return next();
    }

    // Check if user is admin member
    const member = classroom.members.find(
      member => member.user.toString() === userId && member.role === 'admin'
    );

    if (!member) {
      return res.status(403).json({ 
        message: 'Admin permissions required for this action' 
      });
    }

    req.isClassroomCreator = false;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check if user is member of a classroom
exports.checkClassroomMember = async (req, res, next) => {
  try {
    const classroomId = req.params.classroomId || req.params.id;
    const userId = req.user.id;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    // Check if user is creator
    if (classroom.createdBy.toString() === userId) {
      req.userRole = 'admin';
      req.isClassroomCreator = true;
      return next();
    }

    // Check if user is member
    const member = classroom.members.find(
      member => member.user.toString() === userId
    );

    if (!member) {
      return res.status(403).json({ 
        message: 'You must be a member of this classroom' 
      });
    }

    req.userRole = member.role;
    req.isClassroomCreator = false;
    next();
  } catch (error) {
    console.error('Member check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};