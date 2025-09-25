const express = require('express');
const router = express.Router();
const { register, login, changePassword, deleteAccount, me, logout, updateProfile } = require('../controllers/authController');
const auth = require('../middleware/auth');

// Route for signup
router.post('/register', register);

// Route for login
router.post('/login', login);

// Logout (clears auth cookie)
router.post('/logout', logout);

// Current user info
router.get('/me', auth, me);

// Route for updating profile
router.put('/update-profile', auth, updateProfile);

// Route for changing password
router.put('/change-password', auth, changePassword);

// Route for deleting account
router.delete('/delete-account', auth, deleteAccount);

module.exports = router;
