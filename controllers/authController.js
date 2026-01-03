const User = require('../models/User');
const { generateTokens } = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const generateVerificationToken = require('../utils/generateVerificationToken');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

exports.register = async (req, res) => {
  try {
    const { fullName, email, password, passwordConfirm } = req.body;

    // Validation
    if (!fullName || !email || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    // Check if passwords match
    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email',
      });
    }

    // Prevent role assignment during registration (roles can only be set by admins)
    // Users always register as 'user' role by default
    if (req.body.role && req.body.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'You cannot assign roles during registration. All users register with the default "user" role.',
      });
    }

    // Generate email verification token
    const { verificationToken, hashedToken } = generateVerificationToken();

    // Create user with default 'user' role
    const user = await User.create({
      fullName,
      email,
      password,
      role: 'user', // Always set to 'user' during registration
      emailVerificationToken: hashedToken,
      emailVerificationExpire: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    // Create verification URL - use backend URL since we're serving the page
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const verificationUrl = `${backendUrl}/verify-email.html?token=${verificationToken}`;

    // Send verification email (non-blocking - don't fail registration if email fails)
    try {
      await sendEmail({
        email: user.email,
        subject: 'Email Verification - EduWave',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .button-container { text-align: center; margin: 30px 0; }
              .verify-button {
                display: inline-block;
                padding: 15px 40px;
                background-color: #4A6CF7;
                color: white !important;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .verify-button:hover {
                background-color: #8B5CF6;
              }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Welcome to EduWave!</h1>
              <p>Thank you for signing up! To complete your registration, please verify your email address.</p>
              <p>Click the button below to open the verification page where you can verify your email:</p>
              
              <div class="button-container">
                <a href="${verificationUrl}" class="verify-button">Verify My Email Address</a>
              </div>
              
              <p><strong>What happens next?</strong></p>
              <ol>
                <li>Click the button above (or the link below)</li>
                <li>You'll be taken to our verification page</li>
                <li>Click the "Verify Email" button on that page</li>
                <li>Your account will be activated!</li>
              </ol>
              
              <p>Or copy and paste this URL into your browser:</p>
              <p style="word-break: break-all; color: #4A6CF7;">${verificationUrl}</p>
              
              <p><strong>Important:</strong> This verification link will expire in 24 hours.</p>
              
              <div class="footer">
                <p>If you did not create an account with EduWave, please ignore this email.</p>
                <p>&copy; ${new Date().getFullYear()} EduWave. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      console.log('Verification email sent successfully to:', user.email);
    } catch (error) {
      // Log email error but don't block registration
      console.error('Email sending failed (non-blocking):', error.message || error);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Check if user exists and include password field
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
      });
    }

    // Check if password matches
    const isPasswordMatch = await user.matchPassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Update login streak (day-based, not 24-hour window)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastLoginDate = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
    const lastLoginDay = lastLoginDate ? new Date(lastLoginDate.getFullYear(), lastLoginDate.getMonth(), lastLoginDate.getDate()) : null;

    if (!lastLoginDate || !lastLoginDay) {
      // First login
      user.loginStreak = 1;
    } else {
      // Calculate days difference
      const daysDiff = Math.floor((today - lastLoginDay) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) {
        // Logged in on the same day - don't increment streak (already counted today)
        // Keep current streak
      } else if (daysDiff === 1) {
        // Logged in on consecutive day - increment streak
        user.loginStreak = (user.loginStreak || 0) + 1;
      } else {
        // More than 1 day passed - streak broken, reset to 1
        user.loginStreak = 1;
      }
    }

    user.lastLoginDate = now;

    // Check consistent badge (30 day streak)
    const badgeService = require('../utils/badgeService');
    await badgeService.checkConsistent(user._id);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Remove password and refreshToken from response
    user.password = undefined;
    user.refreshToken = undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          emailVerified: user.emailVerified,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login',
    });
  }
};


exports.verifyEmail = async (req, res) => {
  try {
    // Get token from params (remove any query string if present)
    let token = req.params.token;
    
    // Remove query string if accidentally included
    if (token && token.includes('?')) {
      token = token.split('?')[0];
    }
    
    // Validate token exists
    if (!token || token.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
    }

    // Get hashed token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token.trim())
      .digest('hex');

    // Find user with matching token
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token. The token may be incorrect or already used.',
      });
    }

    // Check if token has expired
    if (user.emailVerificationExpire && user.emailVerificationExpire < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired. Please request a new verification email.',
      });
    }

    // Check if email is already verified
    if (user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: 'Email is already verified',
      });
    }

    // Update user
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during email verification',
    });
  }
};


exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a verification email has been sent.',
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified',
      });
    }

    // Generate new verification token
    const { verificationToken, hashedToken } = generateVerificationToken();

    // Update user with new token
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save({ validateBeforeSave: false });

    // Create verification URL - use backend URL since we're serving the page
    const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const verificationUrl = `${backendUrl}/verify-email.html?token=${verificationToken}`;

    // Send verification email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Email Verification - EduWave',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .button-container { text-align: center; margin: 30px 0; }
              .verify-button {
                display: inline-block;
                padding: 15px 40px;
                background-color: #4A6CF7;
                color: white !important;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .verify-button:hover {
                background-color: #8B5CF6;
              }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Email Verification Request</h1>
              <p>You requested a new verification email. Please verify your email address to activate your account.</p>
              <p>Click the button below to open the verification page where you can verify your email:</p>
              
              <div class="button-container">
                <a href="${verificationUrl}" class="verify-button">Verify My Email Address</a>
              </div>
              
              <p><strong>What happens next?</strong></p>
              <ol>
                <li>Click the button above (or the link below)</li>
                <li>You'll be taken to our verification page</li>
                <li>Click the "Verify Email" button on that page</li>
                <li>Your account will be activated!</li>
              </ol>
              
              <p>Or copy and paste this URL into your browser:</p>
              <p style="word-break: break-all; color: #4A6CF7;">${verificationUrl}</p>
              
              <p><strong>Important:</strong> This verification link will expire in 24 hours.</p>
              
              <div class="footer">
                <p>If you did not request this verification email, please ignore it.</p>
                <p>&copy; ${new Date().getFullYear()} EduWave. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      res.status(200).json({
        success: true,
        message: 'Verification email sent successfully. Please check your email.',
      });
    } catch (error) {
      console.error('Email sending failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.',
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during resend verification',
    });
  }
};

// Refresh access token using refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key');
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
    }

    // Find user and verify refresh token matches
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during token refresh',
    });
  }
};

// Logout - invalidate refresh token
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.refreshToken = undefined;
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during logout',
    });
  }
};

// Forgot Password - Generate reset token and send email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    // Don't reveal if user exists or not for security
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Save hashed token and expiration (1 hour)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpire = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save({ validateBeforeSave: false });

    // Create reset URL - use FRONTEND_URL env variable if available, otherwise construct from request
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host').replace(':3000', '')}`;
    const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}`;

    // Send reset email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request - EduWise',
        html: `
          <h1>Password Reset Request</h1>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>Or copy and paste this URL into your browser:</p>
          <p>${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
        `,
      });

      res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    } catch (error) {
      console.error('Email sending failed:', error);
      // Clear the reset token if email fails
      user.passwordResetToken = undefined;
      user.passwordResetExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again later.',
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during password reset request',
    });
  }
};

// Reset Password - Validate token and update password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password, passwordConfirm } = req.body;

    // Validation
    if (!token || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide token, password, and password confirmation',
      });
    }

    // Check if passwords match
    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    // Check password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Get hashed token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token.trim())
      .digest('hex');

    // Find user with matching token and check expiration
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    // Update password and clear reset token
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during password reset',
    });
  }
};


