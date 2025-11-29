const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { protect } = require('../middleware/auth');
const {
  uploadPDF,
  downloadPDF,
  getPDFInfo,
} = require('../controllers/pdfToLinkController');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/pdfs');
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
})();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Upload PDF (optional auth - can be public)
router.post('/upload', upload.single('pdf'), uploadPDF);

// Get PDF info by shareable link (public)
router.get('/info/:shareableLink', getPDFInfo);

// Download PDF by shareable link (public)
router.get('/files/:shareableLink', downloadPDF);

module.exports = router;

