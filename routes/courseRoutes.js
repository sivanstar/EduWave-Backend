const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { protect } = require('../middleware/auth');
const {
  createCourse,
  getMyCourses,
  getCourseById,
  getCourseByAccessCode,
  enrollInCourse,
  getEnrolledCourses,
  downloadFile,
  updateCourse,
  deleteCourse,
  getAllCourses,
  seedDefaultCourses,
} = require('../controllers/courseController');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/courses');
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
})();

// Configure multer for file uploads
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
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
    }
  },
});

// Upload files endpoint
router.post('/upload', protect, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    const files = req.files.map(file => ({
      name: file.originalname,
      path: `/uploads/courses/${file.filename}`,
      size: file.size,
      type: path.extname(file.originalname).substring(1),
    }));

    res.status(200).json({
      success: true,
      files: files,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Public route - Get course by access code
router.get('/access/:accessCode', getCourseByAccessCode);

// Public route - Download course file (must come before /:courseId)
router.get('/:courseId/files/:fileName', downloadFile);

// Public route - Get course by ID
router.get('/:courseId', getCourseById);

// Protected routes
router.post('/', protect, createCourse);
router.post('/seed-default', protect, seedDefaultCourses);
router.get('/my-courses', protect, getMyCourses);
router.get('/all', protect, getAllCourses);
router.get('/enrolled/my-courses', protect, getEnrolledCourses);
router.put('/:courseId', protect, updateCourse);
router.delete('/:courseId', protect, deleteCourse);
router.post('/:courseId/enroll', protect, enrollInCourse);

module.exports = router;

