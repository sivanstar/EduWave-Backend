const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getLeaderboard,
  getUserBadges,
  updateUserBadges,
  updateUserPoints,
  getUserRank,
} = require('../controllers/leaderboardController');
const badgeService = require('../utils/badgeService');

// Get leaderboard (public, but can use optional auth to mark current user)
router.get('/', getLeaderboard);

// Get badge definitions
router.get('/badge-definitions', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      achievement: badgeService.ACHIEVEMENT_BADGES,
      point: badgeService.POINT_BADGES,
    },
  });
});

// Protected routes
router.get('/rank', protect, getUserRank);
router.get('/badges', protect, getUserBadges);
router.put('/badges', protect, updateUserBadges);
router.put('/points', protect, updateUserPoints);
router.post('/check-badges', protect, async (req, res) => {
  try {
    await badgeService.checkAllBadges(req.user._id);
    res.status(200).json({
      success: true,
      message: 'Badges checked successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;

