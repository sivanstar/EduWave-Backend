const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  saveCalculation,
  getCalculation,
  calculate,
  deleteCalculation,
} = require('../controllers/cgpaCalculatorController');

// All routes require authentication
router.use(protect);

// Calculate CGPA (without saving)
router.post('/calculate', calculate);

// Save/update calculation
router.post('/save', saveCalculation);

// Get saved calculation
router.get('/', getCalculation);

// Delete calculation
router.delete('/', deleteCalculation);

module.exports = router;

