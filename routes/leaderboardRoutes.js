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

// Get leaderboard (public, but can use optional auth to mark current user)
router.get('/', getLeaderboard);

// Protected routes
router.get('/rank', protect, getUserRank);
router.get('/badges', protect, getUserBadges);
router.put('/badges', protect, updateUserBadges);
router.put('/points', protect, updateUserPoints);

module.exports = router;

