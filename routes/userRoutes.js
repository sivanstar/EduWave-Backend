const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// GET current user profile - All authenticated users
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -refreshToken -emailVerificationToken');
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
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// GET all users - Admin and Instructor can view all users
router.get('/', protect, authorize('admin', 'instructor'), async (req, res) => {
  try {
    const users = await User.find().select('-password -refreshToken -emailVerificationToken');
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
    const user = await User.findById(req.params.id).select('-password -refreshToken -emailVerificationToken');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
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
    
    if (user) {
      const today = new Date().toDateString();
      const lastToolDate = user.lastToolUseDate ? new Date(user.lastToolUseDate).toDateString() : null;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Update consecutive tool days
      if (!lastToolDate) {
        user.consecutiveToolDays = 1;
      } else if (lastToolDate === yesterday.toDateString()) {
        user.consecutiveToolDays = (user.consecutiveToolDays || 0) + 1;
      } else if (lastToolDate !== today) {
        user.consecutiveToolDays = 1;
      }

      user.lastToolUsed = {
        toolId: toolId || 'unknown',
        toolName: toolName || 'Unknown Tool',
        usedAt: new Date(),
      };
      user.lastToolUseDate = new Date();
      user.toolsUsedCount = (user.toolsUsedCount || 0) + 1;
      await user.save({ validateBeforeSave: false });
      
      // Check badges
      const badgeService = require('../utils/badgeService');
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
    }

    res.status(200).json({
      success: true,
      message: 'Tool usage tracked',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;

