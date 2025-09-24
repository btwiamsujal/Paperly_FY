const Classroom = require('../models/Classroom');
const User = require('../models/User');
const ClassroomContent = require('../models/ClassroomContent');
const crypto = require('crypto');

const generateCode = () => crypto.randomBytes(3).toString('hex');

// ✅ Create a classroom
exports.createClassroom = async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  try {
    const code = generateCode();
    const classroom = await Classroom.create({
      name,
      description,
      code,
      createdBy: userId,
      members: [userId]
    });

    await User.findByIdAndUpdate(userId, {
      $addToSet: { classrooms: classroom._id }
    });

    res.status(201).json({
      message: 'Classroom created',
      classroom: {
        _id: classroom._id,
        name: classroom.name,
        description: classroom.description,
        code: classroom.code
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Join a classroom
exports.joinClassroom = async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;

  try {
    const classroom = await Classroom.findOne({ code });
    if (!classroom) return res.status(404).json({ error: 'Invalid code' });

    if (!classroom.members.includes(userId)) {
      classroom.members.push(userId);
      await classroom.save();

      await User.findByIdAndUpdate(userId, {
        $addToSet: { classrooms: classroom._id }
      });
    }

    res.json({
      message: 'Joined classroom',
      classroom: {
        _id: classroom._id,
        name: classroom.name,
        description: classroom.description,
        code: classroom.code
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get all classrooms for the user
exports.getMyClassrooms = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).populate('classrooms');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ classrooms: user.classrooms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ DELETE a classroom
exports.deleteClassroom = async (req, res) => {
  const classroomId = req.params.id;
  const userId = req.user.id;

  try {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }

    if (classroom.createdBy.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized to delete this classroom' });
    }

    // Delete classroom content (posts/notes/resources)
    await ClassroomContent.deleteMany({ classroom: classroomId });

    // Remove classroom reference from all users
    await User.updateMany(
      { classrooms: classroomId },
      { $pull: { classrooms: classroomId } }
    );

    // Finally, delete the classroom
    await Classroom.findByIdAndDelete(classroomId);

    res.json({ message: 'Classroom deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
