const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createCourse,
  getCourses,
  deleteCourse,
  deleteAllCourses,
  getStatistics,
  createSemester,
  getSemesters,
  updateSemester,
  deleteSemester,
  createGoal,
  getGoals,
  updateGoal,
  deleteGoal,
} = require('../controllers/progressAnalyticsController');

// All routes require authentication
router.use(protect);

// Courses
router.post('/courses', createCourse);
router.get('/courses', getCourses);
router.delete('/courses/:id', deleteCourse);
router.delete('/courses', deleteAllCourses);

// Statistics
router.get('/statistics', getStatistics);

// Semesters
router.post('/semesters', createSemester);
router.get('/semesters', getSemesters);
router.put('/semesters/:id', updateSemester);
router.delete('/semesters/:id', deleteSemester);

// Goals
router.post('/goals', createGoal);
router.get('/goals', getGoals);
router.put('/goals/:id', updateGoal);
router.delete('/goals/:id', deleteGoal);

module.exports = router;

