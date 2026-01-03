const User = require('../models/User');

// Get leaderboard (top users by points)
exports.getLeaderboard = async (req, res) => {
  try {
    const { limit = 20, offset = 0, includeBadges = false } = req.query;
    const currentUserEmail = req.user ? req.user.email : null;
    const currentUserId = req.user ? req.user._id.toString() : null;

    // Validate limit
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 users
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    // Build query with optimized select (only needed fields)
    let query = User.find().select('fullName email points createdAt badges').lean();
    
    // Sort by points descending, then by createdAt ascending (earlier users rank higher if tied)
    // Using lean() for better performance (returns plain JS objects)
    query = query.sort({ points: -1, createdAt: 1 });
    
    // Apply pagination
    query = query.skip(offsetNum).limit(limitNum);
    
    const users = await query;

    // Calculate total users for pagination
    const totalUsers = await User.countDocuments();

    // Build leaderboard with simple, deterministic ranking
    const leaderboard = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const userPoints = Math.round(user.points || 0);
      const rank = offsetNum + i + 1;

      const leaderboardEntry = {
        rank,
        name: user.fullName,
        email: user.email,
        points: userPoints,
        isCurrentUser: currentUserId && user._id.toString() === currentUserId,
      };

      // Include badges if requested
      if (includeBadges === 'true' && user.badges) {
        const earnedBadges = {
          achievement: (user.badges.achievement || []).filter(b => b.earned).map(b => b.id),
          point: (user.badges.point || []).filter(b => b.earned).map(b => b.id),
        };
        leaderboardEntry.badges = earnedBadges;
        leaderboardEntry.badgeCount = earnedBadges.achievement.length + earnedBadges.point.length;
      }

      leaderboard.push(leaderboardEntry);
    }

    // Get current user's rank if authenticated
    let currentUserRank = null;
    let currentUserPoints = null;
    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('points');
      if (currentUser) {
        currentUserPoints = Math.round(currentUser.points || 0);
        const usersAbove = await User.countDocuments({
          $or: [
            { points: { $gt: currentUserPoints } },
            { 
              points: currentUserPoints,
              createdAt: { $lt: currentUser.createdAt }
            }
          ],
        });
        currentUserRank = usersAbove + 1;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        currentUserRank,
        currentUserPoints,
        totalUsers,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < totalUsers,
      },
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch leaderboard',
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
        points: Math.round(updatedUser.points || 0),
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
      const delta = parseInt(points, 10);
      if (!Number.isNaN(delta) && delta !== 0) {
        user.points = Math.round((user.points || 0) + delta);
        await user.save();
        
        // Check badges when points change
        const badgeService = require('../utils/badgeService');
        await badgeService.checkPointBadges(user._id);
        await badgeService.checkWaveChampion(user._id);
      }
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
    const user = await User.findById(req.user._id).select('points createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const userPoints = Math.round(user.points || 0);
    
    // Count users above (higher points OR same points but earlier registration)
    const usersAbove = await User.countDocuments({
      $or: [
        { points: { $gt: userPoints } },
        { 
          points: userPoints,
          createdAt: { $lt: user.createdAt }
        }
      ],
    });
    
    const rank = usersAbove + 1;
    const totalUsers = await User.countDocuments();

    // Calculate percentile
    const percentile = totalUsers > 0 
      ? Math.round(((totalUsers - rank) / totalUsers) * 100)
      : 0;

    // Check wave champion badge (top 3)
    const badgeService = require('../utils/badgeService');
    await badgeService.checkWaveChampion(user._id);

    res.status(200).json({
      success: true,
      data: {
        rank,
        points: userPoints,
        totalUsers,
        percentile,
        isTopThree: rank <= 3,
      },
    });
  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user rank',
    });
  }
};

