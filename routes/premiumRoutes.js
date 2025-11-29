const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPremiumSettings,
  getPremiumStatus,
  startTrial,
  checkCourseAccess,
  enrollInCourse,
  getMonthlyCoursesStatus,
} = require('../controllers/premiumController');

// Public route
router.get('/settings', getPremiumSettings);

// Protected routes
router.use(protect);

router.get('/status', getPremiumStatus);
router.post('/trial/start', startTrial);
router.get('/course-access/:courseId', checkCourseAccess);
router.post('/enroll', enrollInCourse);
router.get('/monthly-status', getMonthlyCoursesStatus);

module.exports = router;

