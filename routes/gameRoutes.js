const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createDuel,
  joinDuel,
  getDuelStatus,
  startDuel,
  submitGameResult,
  getGameStats,
  cancelDuel,
  generateQuestions,
} = require('../controllers/gameController');

// All routes require authentication
router.use(protect);

// Game statistics
router.get('/stats', getGameStats);

// Duel management
router.post('/duel/create', createDuel);
router.post('/duel/join', joinDuel);
router.get('/duel/:duelKey', getDuelStatus);
router.post('/duel/start', startDuel);
router.post('/duel/cancel', cancelDuel);

// Submit game results
router.post('/result', submitGameResult);

// Generate questions
router.get('/generate-questions', generateQuestions);

module.exports = router;

