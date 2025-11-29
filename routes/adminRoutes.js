const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getOverview,
  getCourseStats,
  getUserStats,
  getForumStats,
  getToolsStats,
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
  getPremiumSettings,
  updatePremiumSettings,
} = require('../controllers/adminController');

// All routes require admin role
router.use(protect);
router.use(authorize('admin'));

// Statistics
router.get('/overview', getOverview);
router.get('/courses/stats', getCourseStats);
router.get('/users/stats', getUserStats);
router.get('/forum/stats', getForumStats);
router.get('/tools/stats', getToolsStats);

// Announcements
router.post('/announcements', createAnnouncement);
router.get('/announcements', getAnnouncements);
router.delete('/announcements/:id', deleteAnnouncement);

// Premium settings
router.get('/premium/settings', getPremiumSettings);
router.put('/premium/settings', updatePremiumSettings);

module.exports = router;

