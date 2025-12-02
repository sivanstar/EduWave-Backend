const CourseProgress = require('../models/CourseProgress');
const Course = require('../models/Course');
const User = require('../models/User');

// Get or create course progress
async function getOrCreateProgress(userId, courseId) {
  let progress = await CourseProgress.findOne({ user: userId, courseId });

  if (!progress) {
    const course = await Course.findOne({ courseId });
    if (!course) {
      throw new Error('Course not found');
    }

    // Initialize lesson progress array
    const totalLessons = course.lessons?.length || 1;
    const lessons = Array.from({ length: totalLessons }, (_, i) => ({
      lessonId: i + 1,
      completed: false,
    }));

    progress = await CourseProgress.create({
      user: userId,
      course: course._id,
      courseId,
      lessons,
      progress: 0,
    });
  }

  return progress;
}

// Get course progress
exports.getProgress = async (req, res) => {
  try {
    const { courseId } = req.params;

    const progress = await getOrCreateProgress(req.user._id, courseId);
    const course = await Course.findOne({ courseId }).select('title lessons');

    res.status(200).json({
      success: true,
      data: {
        courseId: progress.courseId,
        progress: progress.progress,
        completed: progress.completed,
        lessons: progress.lessons,
        totalWatchTime: progress.totalWatchTime,
        course: course ? {
          title: course.title,
          totalLessons: course.lessons?.length || 0,
        } : null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Complete a lesson
exports.completeLesson = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonId } = req.body;

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: 'Lesson ID is required',
      });
    }

    const progress = await getOrCreateProgress(req.user._id, courseId);
    const course = await Course.findOne({ courseId });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const totalLessons = course.lessons?.length || 1;
    const lessonIndex = parseInt(lessonId) - 1;

    if (lessonIndex < 0 || lessonIndex >= totalLessons) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
      });
    }

    // Find or create lesson progress
    let lessonProgress = progress.lessons.find(l => l.lessonId === parseInt(lessonId));
    if (!lessonProgress) {
      lessonProgress = { lessonId: parseInt(lessonId), completed: false };
      progress.lessons.push(lessonProgress);
    }

    // Mark lesson as completed if not already
    let pointsAwarded = 0;
    if (!lessonProgress.completed) {
      lessonProgress.completed = true;
      lessonProgress.completedAt = new Date();
      
      // Award points for lesson completion
      const user = await User.findById(req.user._id);
      if (user) {
        user.points = (user.points || 0) + 5; // Lesson completion points
        await user.save();
        pointsAwarded = 5;
        
        // Check badges
        const badgeService = require('../utils/badgeService');
        await badgeService.checkPointBadges(user._id);
        await badgeService.checkFirstStep(user._id);
      }
    }

    // Calculate overall progress
    const completedLessons = progress.lessons.filter(l => l.completed).length;
    progress.progress = Math.round((completedLessons / totalLessons) * 100);

    // Check if course is completed
    if (progress.progress >= 100 && !progress.completed) {
      progress.completed = true;
      progress.completedAt = new Date();

      // Award points for course completion
      const user = await User.findById(req.user._id);
      if (user) {
        user.points = (user.points || 0) + 20; // Course completion points
        
        // Check if completed within 1 day (Quick Learner badge)
        const courseStartTime = progress.createdAt || new Date();
        const completionTime = Date.now() - courseStartTime.getTime();
        const oneDay = 24 * 60 * 60 * 1000;
        
        if (completionTime < oneDay) {
          const badgeService = require('../utils/badgeService');
          await badgeService.awardBadge(user._id, 'quick_learner');
        }
        
        await user.save();
        
        // Check expert badge (5 courses completed)
        const badgeService = require('../utils/badgeService');
        await badgeService.checkExpert(user._id);
        await badgeService.checkPointBadges(user._id);
      }
    }

    progress.lastAccessedAt = new Date();
    await progress.save();

    res.status(200).json({
      success: true,
      data: {
        progress: progress.progress,
        completed: progress.completed,
        lessonCompleted: lessonProgress.completed,
        pointsAwarded,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Update watch time
exports.updateWatchTime = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { lessonId, watchTime } = req.body;

    if (!lessonId || watchTime === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Lesson ID and watch time are required',
      });
    }

    const progress = await getOrCreateProgress(req.user._id, courseId);

    // Find or create lesson progress
    let lessonProgress = progress.lessons.find(l => l.lessonId === parseInt(lessonId));
    if (!lessonProgress) {
      lessonProgress = { lessonId: parseInt(lessonId), completed: false };
      progress.lessons.push(lessonProgress);
    }

    // Update watch time
    lessonProgress.watchTime = parseInt(watchTime);
    lessonProgress.lastWatchedAt = new Date();

    // Update total watch time
    progress.totalWatchTime = progress.lessons.reduce((sum, l) => sum + (l.watchTime || 0), 0);
    progress.lastAccessedAt = new Date();

    await progress.save();

    res.status(200).json({
      success: true,
      data: {
        watchTime: lessonProgress.watchTime,
        totalWatchTime: progress.totalWatchTime,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user's course progress list
exports.getUserProgress = async (req, res) => {
  try {
    const progressList = await CourseProgress.find({ user: req.user._id })
      .populate('course', 'title courseId category')
      .sort({ lastAccessedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: progressList.length,
      data: progressList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

