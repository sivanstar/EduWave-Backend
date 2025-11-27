const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyEmail,
  resendVerification,
} = require('../controllers/authController');

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', register);

// @route   POST /auth/login
// @desc    Login user
// @access  Public
router.post('/login', login);

// @route   GET /auth/verify-email/:token
// @desc    Verify email address
// @access  Public
router.get('/verify-email/:token', verifyEmail);

// @route   POST /auth/resend-verification
// @desc    Resend verification email
// @access  Public
router.post('/resend-verification', resendVerification);

module.exports = router;


