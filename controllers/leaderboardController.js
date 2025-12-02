const User = require('../models/User');

// Get leaderboard (top users by points)
exports.getLeaderboard = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const currentUserEmail = req.user ? req.user.email : null;

    const users = await User.find()
      .select('fullName email points createdAt')
      .sort({ points: -1 })
      .limit(parseInt(limit))
      .lean();

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      name: user.fullName,
      email: user.email,
      points: user.points || 0,
      isCurrentUser: currentUserEmail && user.email === currentUserEmail,
    }));

    // Get current user's rank if authenticated
    let currentUserRank = null;
    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('points');
      if (currentUser) {
        const usersAbove = await User.countDocuments({
          points: { $gt: currentUser.points || 0 },
        });
        currentUserRank = usersAbove + 1;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        currentUserRank,
        totalUsers: await User.countDocuments(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user badges
exports.getUserBadges = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('badges points');
    const badgeService = require('../utils/badgeService');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check all badges before returning
    await badgeService.checkAllBadges(user._id);
    
    // Reload user to get updated badges
    const updatedUser = await User.findById(req.user._id).select('badges points');

    res.status(200).json({
      success: true,
      data: {
        badges: updatedUser.badges || { achievement: [], point: [] },
        points: updatedUser.points || 0,
        badgeDefinitions: {
          achievement: badgeService.ACHIEVEMENT_BADGES,
          point: badgeService.POINT_BADGES,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update user badges
exports.updateUserBadges = async (req, res) => {
  try {
    const { badges } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (badges) {
      user.badges = badges;
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: user.badges,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Update user points
exports.updateUserPoints = async (req, res) => {
  try {
    const { points } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (points !== undefined) {
      user.points = (user.points || 0) + parseInt(points);
      await user.save();
      
      // Check badges when points change
      const badgeService = require('../utils/badgeService');
      await badgeService.checkPointBadges(user._id);
      await badgeService.checkWaveChampion(user._id);
    }

    res.status(200).json({
      success: true,
      data: {
        points: user.points,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get current user's leaderboard position
exports.getUserRank = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('points');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const usersAbove = await User.countDocuments({
      points: { $gt: user.points || 0 },
    });
    const rank = usersAbove + 1;
    const totalUsers = await User.countDocuments();

    // Check wave champion badge (top 3)
    const badgeService = require('../utils/badgeService');
    await badgeService.checkWaveChampion(user._id);

    res.status(200).json({
      success: true,
      data: {
        rank,
        points: user.points || 0,
        totalUsers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

