const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register Controller
const register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Check if user already exists (case-insensitive for legacy records)
    let user = await User.findOne({ email: emailRegex });
    if (user) return res.status(400).json({ message: 'User already exists' });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user without role
    user = new User({ name, email: normalizedEmail, password: hashedPassword });
    await user.save();

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// Login Controller
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const emailRegex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const user = await User.findOne({ email: emailRegex });
    if (!user) {
      return res.status(400).json({ message: 'User does not exist' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Change Password Controller
const changePassword = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during password change' });
  }
};

// Delete Account Controller
const deleteAccount = async (req, res) => {
  const userId = req.user.id || req.user._id;

  try {
    await User.findByIdAndDelete(userId);
    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during account deletion' });
  }
};

module.exports = { register, login, changePassword, deleteAccount };
