const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// GET current user profile - All authenticated users
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -refreshToken -emailVerificationToken').lean();
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    // Ensure points are always whole numbers
    if (user.points !== undefined && user.points !== null) {
      user.points = Math.round(user.points);
    }
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// GET all users - Admin and Instructor can view all users
router.get('/', protect, authorize('admin', 'instructor'), async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshToken -emailVerificationToken').lean();
    // Ensure points are always whole numbers
    users.forEach(user => {
      if (user.points !== undefined && user.points !== null) {
        user.points = Math.round(user.points);
      }
    });
    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// GET a single user by ID - Users can view their own profile, admins and instructors can view any
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -refreshToken -emailVerificationToken').lean();
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    // Ensure points are always whole numbers
    if (user.points !== undefined && user.points !== null) {
      user.points = Math.round(user.points);
    }
    
    // Users can only view their own profile unless they're admin or instructor
    if (req.user.role !== 'admin' && req.user.role !== 'instructor' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view this user profile' 
      });
    }
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// POST create a new user - Admin only
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fullName, email, and password',
      });
    }
    
    // Validate role if provided
    if (role && !['user', 'instructor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: user, instructor, admin',
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
    
    const userData = {
      fullName,
      email,
      password,
      role: role || 'user',
      emailVerified: true, // Admin-created users are auto-verified
    };
    
    const newUser = await User.create(userData);
    
    // Remove sensitive fields from response
    newUser.password = undefined;
    newUser.refreshToken = undefined;
    newUser.emailVerificationToken = undefined;
    
    res.status(201).json({
      success: true,
      data: newUser,
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// PUT update a user - Users can update their own profile, admins can update any
router.put('/:id', protect, async (req, res) => {
  try {
    // Users can only update their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this user profile' 
      });
    }
    
    // Only admins can change roles
    const updateData = {
      fullName: req.body.fullName,
      email: req.body.email,
    };
    
    // Only admins can change roles
    if (req.user.role === 'admin' && req.body.role) {
      if (!['user', 'instructor', 'admin'].includes(req.body.role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be one of: user, instructor, admin',
        });
      }
      updateData.role = req.body.role;
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshToken -emailVerificationToken');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// PUT update user role - Admin only
router.put('/:id/role', protect, authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!role || !['user', 'instructor', 'admin'].includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: 'Valid role (user, instructor, admin) is required' 
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password -refreshToken -emailVerificationToken');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
});

// DELETE a user - Admin only
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
      });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'User deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Dashboard routes
const {
  getDashboardStats,
  getRecentActivities,
  getQuickAccess,
} = require('../controllers/dashboardController');

router.get('/dashboard/stats', protect, getDashboardStats);
router.get('/dashboard/activities', protect, getRecentActivities);
router.get('/dashboard/quick-access', protect, getQuickAccess);

// Track tool usage
router.post('/track-tool', protect, async (req, res) => {
  try {
    const { toolId, toolName } = req.body;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const now = new Date();
    const today = new Date().toDateString();
    const lastToolDate = user.lastToolUseDate ? new Date(user.lastToolUseDate).toDateString() : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Track unique tools used (not total count)
    if (!user.toolsUsed) {
      user.toolsUsed = [];
    }
    
    // Find existing tool entry
    const existingTool = user.toolsUsed.find(t => t.toolId === toolId);
    
    // Check if 24 hours have passed since last points award for THIS specific tool
    let pointsAwarded = 0;
    let canAwardPoints = false;
    
    if (!existingTool) {
      // First time using this tool - award points
      canAwardPoints = true;
      user.toolsUsed.push({
        toolId: toolId || 'unknown',
        toolName: toolName || 'Unknown Tool',
        firstUsedAt: now,
        lastUsedAt: now,
        lastPointsAwardedAt: now,
      });
    } else {
      // Tool was used before - check if 24 hours have passed since last points award
      const lastPointsAwarded = existingTool.lastPointsAwardedAt 
        ? new Date(existingTool.lastPointsAwardedAt) 
        : null;
      
      if (!lastPointsAwarded) {
        // No record of when points were awarded - award now (backward compatibility)
        canAwardPoints = true;
      } else {
        // Check if 24 hours (86400000 ms) have passed
        const timeSinceLastAward = now.getTime() - lastPointsAwarded.getTime();
        const hoursSinceLastAward = timeSinceLastAward / (1000 * 60 * 60);
        
        if (hoursSinceLastAward >= 24) {
          canAwardPoints = true;
        }
      }
      
      // Always update last used date
      existingTool.lastUsedAt = now;
      
      // Update lastPointsAwardedAt only if we're awarding points
      if (canAwardPoints) {
        existingTool.lastPointsAwardedAt = now;
      }
    }

    // Update consecutive tool days (any tool usage counts)
    if (!lastToolDate) {
      user.consecutiveToolDays = 1;
    } else if (lastToolDate === yesterday.toDateString()) {
      user.consecutiveToolDays = (user.consecutiveToolDays || 0) + 1;
    } else if (lastToolDate !== today) {
      user.consecutiveToolDays = 1;
    }

    // Update last tool used (for consecutive days tracking)
    user.lastToolUsed = {
      toolId: toolId || 'unknown',
      toolName: toolName || 'Unknown Tool',
      usedAt: now,
    };
    user.lastToolUseDate = now;
    
    user.toolsUsedCount = user.toolsUsed.length;

    // Award points only if 24 hours have passed since last award for this tool
    if (canAwardPoints) {
      user.points = Math.round((user.points || 0) + 1);
      pointsAwarded = 1;
    }

    await user.save({ validateBeforeSave: false });
    
    // Check badges
    const badgeService = require('../utils/badgeService');
    if (pointsAwarded > 0) {
      await badgeService.checkPointBadges(user._id);
    }
    await badgeService.checkFirstStep(user._id);
    await badgeService.checkDailyGrinder(user._id);
    
    // Track study planner or analytics usage
    if (toolId === 'study-planner' || toolName === 'Study Planner') {
      const lastPlannerDate = user.lastStudyPlannerDate ? new Date(user.lastStudyPlannerDate).toDateString() : null;
      if (!lastPlannerDate) {
        user.studyPlannerDays = 1;
      } else if (lastPlannerDate === yesterday.toDateString()) {
        user.studyPlannerDays = (user.studyPlannerDays || 0) + 1;
      } else if (lastPlannerDate !== today) {
        user.studyPlannerDays = 1;
      }
      user.lastStudyPlannerDate = new Date();
      await user.save({ validateBeforeSave: false });
      await badgeService.checkGoalSetter(user._id);
    }
    
    if (toolId === 'progress-analytics' || toolName === 'Progress Analytics') {
      const lastAnalyticsDate = user.lastAnalyticsDate ? new Date(user.lastAnalyticsDate).toDateString() : null;
      if (!lastAnalyticsDate) {
        user.analyticsDays = 1;
      } else if (lastAnalyticsDate === yesterday.toDateString()) {
        user.analyticsDays = (user.analyticsDays || 0) + 1;
      } else if (lastAnalyticsDate !== today) {
        user.analyticsDays = 1;
      }
      user.lastAnalyticsDate = new Date();
      await user.save({ validateBeforeSave: false });
      await badgeService.checkGoalSetter(user._id);
    }

    res.status(200).json({
      success: true,
      message: 'Tool usage tracked',
      data: {
        pointsAwarded,
        totalPoints: user.points || 0,
        alreadyUsedToday: !canAwardPoints && existingTool !== undefined,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// PUT update password - Users can update their own password
router.put('/me/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, passwordConfirm } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password, new password, and password confirmation',
      });
    }

    // Check if passwords match
    if (newPassword !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    // Check password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Find user with password field
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Verify current password
    const isPasswordMatch = await user.matchPassword(currentPassword);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during password update',
    });
  }
});

module.exports = router;

