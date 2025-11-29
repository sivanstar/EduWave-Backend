const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createSession,
  getSessions,
  getSession,
  updateSession,
  deleteSession,
  deleteAllSessions,
  getStatistics,
  updatePreferences,
  getPreferences,
} = require('../controllers/studyPlannerController');

// All routes require authentication
router.use(protect);

// Study sessions
router.post('/sessions', createSession);
router.get('/sessions', getSessions);
router.get('/sessions/:id', getSession);
router.put('/sessions/:id', updateSession);
router.delete('/sessions/:id', deleteSession);
router.delete('/sessions', deleteAllSessions);

// Statistics
router.get('/statistics', getStatistics);

// Preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;

