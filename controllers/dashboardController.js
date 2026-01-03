const User = require('../models/User');
const CourseProgress = require('../models/CourseProgress');
const ForumPost = require('../models/Forum');

// Get dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    // Only select needed fields for better performance
    const user = await User.findById(req.user._id)
      .select('badges toolsUsed toolsUsedCount forumStats')
      .lean();
    
    // Count completed lessons (optimized with lean and select)
    const progressRecords = await CourseProgress.find({ user: req.user._id })
      .select('lessons')
      .lean();
    const lessonsCompleted = progressRecords.reduce((total, progress) => {
      return total + (progress.lessons?.filter(l => l.completed).length || 0);
    }, 0);

    // Count badges earned
    const achievementBadges = user.badges?.achievement?.filter(b => b.earned).length || 0;
    const pointBadges = user.badges?.point?.filter(b => b.earned).length || 0;
    const badgesEarned = achievementBadges + pointBadges;

    // Tools used count (unique tools)
    // Use toolsUsed array length if available, otherwise fallback to toolsUsedCount
    const toolsUsed = user.toolsUsed && Array.isArray(user.toolsUsed) 
      ? user.toolsUsed.length 
      : (user.toolsUsedCount || 0);

    // Forum posts count
    const forumPosts = user.forumStats?.posts || 0;

    res.status(200).json({
      success: true,
      data: {
        lessonsCompleted,
        badgesEarned,
        toolsUsed,
        forumPosts,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get recent activities
exports.getRecentActivities = async (req, res) => {
  try {
    // Only select needed fields for better performance
    const user = await User.findById(req.user._id)
      .select('lastToolUsed lastCourseOpened lastPostCreated')
      .lean();
    const activities = [];

    // Last tool used
    if (user.lastToolUsed && user.lastToolUsed.usedAt) {
      activities.push({
        type: 'tool',
        title: `Used ${user.lastToolUsed.toolName}`,
        date: user.lastToolUsed.usedAt,
      });
    }

    // Last course opened
    if (user.lastCourseOpened && user.lastCourseOpened.openedAt) {
      activities.push({
        type: 'course',
        title: `Opened ${user.lastCourseOpened.courseName}`,
        date: user.lastCourseOpened.openedAt,
      });
    }

    // Last post created
    if (user.lastPostCreated && user.lastPostCreated.createdAt) {
      activities.push({
        type: 'forum',
        title: `Created post: ${user.lastPostCreated.title}`,
        date: user.lastPostCreated.createdAt,
      });
    }

    // Get recent forum posts (optimized with lean)
    const recentPosts = await ForumPost.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .limit(2)
      .select('title createdAt')
      .lean();

    recentPosts.forEach(post => {
      activities.push({
        type: 'forum',
        title: `Created post: ${post.title}`,
        date: post.createdAt,
      });
    });

    // Sort by date and return top 5
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    const top5 = activities.slice(0, 5);

    res.status(200).json({
      success: true,
      data: top5,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get quick access (last tool, course, post)
exports.getQuickAccess = async (req, res) => {
  try {
    // Only select needed fields for better performance
    const user = await User.findById(req.user._id)
      .select('lastToolUsed lastCourseOpened lastPostCreated')
      .lean();
    
    const quickAccess = {
      lastTool: user.lastToolUsed || null,
      lastCourse: user.lastCourseOpened || null,
      lastPost: user.lastPostCreated || null,
    };

    res.status(200).json({
      success: true,
      data: quickAccess,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

