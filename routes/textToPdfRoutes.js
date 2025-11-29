const express = require('express');
const router = express.Router();
const { generatePDF } = require('../controllers/textToPdfController');

// Generate PDF from text
router.post('/generate', generatePDF);

module.exports = router;

