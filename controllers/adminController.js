const User = require('../models/User');
const Course = require('../models/Course');
const { StudySession } = require('../models/StudyPlan');
const { ProgressData } = require('../models/ProgressData');
const PdfFile = require('../models/PdfFile');
const Announcement = require('../models/Announcement');
const AdminSettings = require('../models/AdminSettings');
const ForumPost = require('../models/Forum');

// Get overview statistics
exports.getOverview = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCourses = await Course.countDocuments();
    const premiumUsers = await User.countDocuments({ role: { $in: ['instructor', 'admin'] } });
    
    // Count tool usage (approximate from various models)
    const studySessions = await StudySession.countDocuments();
    const progressData = await ProgressData.countDocuments();
    const pdfFiles = await PdfFile.countDocuments();
    const toolUsage = studySessions + progressData + pdfFiles;
    
    // Count forum posts
    const totalForumPosts = await ForumPost.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalCourses,
        totalForumPosts,
        toolUsage,
        premiumUsers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get course statistics
exports.getCourseStats = async (req, res) => {
  try {
    const courses = await Course.find().select('category totalLessons').lean();
    
    const stats = {
      programming: 0,
      design: 0,
      data: 0,
      marketing: 0,
    };

    courses.forEach(course => {
      const cat = course.category.toLowerCase();
      if (stats.hasOwnProperty(cat)) {
        stats[cat]++;
      }
    });

    const recentCourses = await Course.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title category totalLessons createdAt')
      .populate('instructor', 'fullName');

    res.status(200).json({
      success: true,
      data: {
        byCategory: stats,
        recentCourses,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const proUsers = await User.countDocuments({ role: { $in: ['instructor', 'admin'] } });
    const newUsers = await User.countDocuments({
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });

    const users = await User.find()
      .select('fullName email role createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        proUsers,
        newUsers,
        users,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get forum statistics
exports.getForumStats = async (req, res) => {
  try {
    // Use parallel queries for better performance
    const [totalPosts, flaggedPosts, totalRepliesResult, allPosts] = await Promise.all([
      ForumPost.countDocuments(),
      ForumPost.countDocuments({ flagged: true }),
      // Use aggregation to count replies efficiently instead of fetching all posts
      ForumPost.aggregate([
        { $project: { repliesCount: { $size: { $ifNull: ['$replies', []] } } } },
        { $group: { _id: null, total: { $sum: '$repliesCount' } } }
      ]),
      ForumPost.find()
        .populate('author', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ]);
    
    const totalReplies = totalRepliesResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: {
        totalReplies,
        flaggedPosts,
        totalPosts,
        topics: allPosts.map(post => ({
          _id: post._id,
          id: post._id.toString(),
          title: post.title,
          author: post.authorName || (post.author?.fullName || 'Unknown'),
          authorId: post.author?._id || post.author,
          category: post.category,
          replies: post.replies || [],
          flagged: post.flagged || false,
          helpfulVotes: post.helpfulVotes || 0,
          createdAt: post.createdAt,
          timestamp: post.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get tools usage statistics
exports.getToolsStats = async (req, res) => {
  try {
    const studySessions = await StudySession.countDocuments();
    const progressData = await ProgressData.countDocuments();
    const pdfFiles = await PdfFile.countDocuments();

    const tools = [
      { name: 'Study Planner', category: 'Planning', uses: studySessions, status: 'active' },
      { name: 'Progress Analytics', category: 'Analytics', uses: progressData, status: 'active' },
      { name: 'PDF to Link', category: 'File Sharing', uses: pdfFiles, status: 'active' },
      { name: 'CGPA Calculator', category: 'Academic', uses: 0, status: 'active' },
      { name: 'Text to PDF', category: 'Document', uses: 0, status: 'active' },
      { name: 'Course Creator', category: 'Academic', uses: 0, status: 'active' },
      { name: 'Course Access', category: 'Academic', uses: 0, status: 'active' },
      { name: 'Course Manager', category: 'Academic', uses: 0, status: 'active' },
    ];

    res.status(200).json({
      success: true,
      data: tools,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Announcements CRUD
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, category, message } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required',
      });
    }

    const announcement = await Announcement.create({
      title,
      category: category || 'General',
      message,
      createdBy: req.user._id,
    });

    // Notify all users about the new announcement
    const { createNotificationForAllUsers } = require('./notificationController');
    await createNotificationForAllUsers(
      `New Announcement: ${title}`,
      message,
      'info',
      '/dashboard' // Link to dashboard where announcements are shown
    );

    res.status(201).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Premium settings
exports.getPremiumSettings = async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();

    // Get premium user stats
    const totalPremium = await User.countDocuments({ role: { $in: ['instructor', 'admin'] } });
    const freeUsers = await User.countDocuments({ role: 'user' });

    res.status(200).json({
      success: true,
      data: {
        settings,
        stats: {
          totalPremium,
          trialUsers: 0, // Not implemented yet
          freeUsers,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updatePremiumSettings = async (req, res) => {
  try {
    const { premiumEnabled, trialDuration, courseLimitFree, courseLimit } = req.body;

    const settings = await AdminSettings.getSettings();

    if (premiumEnabled !== undefined) settings.premiumEnabled = premiumEnabled;
    if (trialDuration !== undefined) settings.trialDuration = trialDuration;
    if (courseLimitFree !== undefined) settings.courseLimitFree = courseLimitFree;
    if (courseLimit !== undefined) settings.courseLimitFree = courseLimit; // Backward compatibility
    settings.updatedAt = new Date();

    await settings.save();

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

