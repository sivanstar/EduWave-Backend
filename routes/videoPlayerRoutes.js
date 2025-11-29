const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getProgress,
  completeLesson,
  updateWatchTime,
  getUserProgress,
} = require('../controllers/videoPlayerController');

// All routes require authentication
router.use(protect);

// Get user's all course progress
router.get('/progress', getUserProgress);

// Get specific course progress
router.get('/progress/:courseId', getProgress);

// Complete a lesson
router.post('/progress/:courseId/complete', completeLesson);

// Update watch time
router.post('/progress/:courseId/watch-time', updateWatchTime);

module.exports = router;

