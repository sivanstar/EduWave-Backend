const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const CourseProgress = require('../models/CourseProgress');
const { protect, authorize } = require('../middleware/auth');

// GET all courses
router.get('/', async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET a single course by ID
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create a new course - Instructor and Admin only
router.post('/', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const { title, desc, lessons, courseduration } = req.body;

    // Validate required fields
    if (!title || !desc || !courseduration) {
      return res.status(400).json({ 
        message: 'Title, description, and course duration are required' 
      });
    }

    // Validate lessons if provided
    if (lessons && Array.isArray(lessons)) {
      for (const lesson of lessons) {
        if (!lesson.title || !lesson.duration || !lesson.totallesson || !lesson.videoUrl) {
          return res.status(400).json({ 
            message: 'Each lesson must have title, duration, totallesson, and videoUrl' 
          });
        }
      }
    }

    const course = new Course({
      title,
      desc,
      lessons: lessons || [],
      courseduration,
    });

    const newCourse = await course.save();
    res.status(201).json(newCourse);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update a course - Instructor and Admin only
router.put('/:id', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const { title, desc, lessons, courseduration } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (desc) updateData.desc = desc;
    if (courseduration !== undefined) updateData.courseduration = courseduration;
    if (lessons !== undefined) {
      // Validate lessons if provided
      if (Array.isArray(lessons)) {
        for (const lesson of lessons) {
          if (!lesson.title || !lesson.duration || !lesson.totallesson || !lesson.videoUrl) {
            return res.status(400).json({ 
              message: 'Each lesson must have title, duration, totallesson, and videoUrl' 
            });
          }
        }
      }
      updateData.lessons = lessons;
    }

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE a course - Instructor and Admin only
router.delete('/:id', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Also delete all progress records for this course
    await CourseProgress.deleteMany({ courseId: req.params.id });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET user progress on a course
router.get('/:id/progress/:userId', async (req, res) => {
  try {
    const { id: courseId, userId } = req.params;

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get or create progress
    let progress = await CourseProgress.findOne({ 
      userId, 
      courseId 
    }).populate('courseId', 'title desc lessons courseduration');

    if (!progress) {
      // Create initial progress record
      progress = new CourseProgress({
        userId,
        courseId,
        progress: 0,
        completedLessons: [],
        currentLesson: 0,
      });
      await progress.save();
      await progress.populate('courseId', 'title desc lessons courseduration');
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST update user progress on a course
router.post('/:id/progress/:userId', async (req, res) => {
  try {
    const { id: courseId, userId } = req.params;
    const { completedLessons, currentLesson } = req.body;

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get or create progress
    let progress = await CourseProgress.findOne({ userId, courseId });

    if (!progress) {
      progress = new CourseProgress({
        userId,
        courseId,
        completedLessons: completedLessons || [],
        currentLesson: currentLesson || 0,
      });
    } else {
      if (completedLessons !== undefined) {
        progress.completedLessons = completedLessons;
      }
      if (currentLesson !== undefined) {
        progress.currentLesson = currentLesson;
      }
    }

    // Calculate progress percentage
    const totalLessons = course.lessons.length;
    const completedCount = progress.completedLessons.length;
    progress.progress = totalLessons > 0 
      ? Math.round((completedCount / totalLessons) * 100) 
      : 0;
    
    progress.lastAccessedAt = Date.now();

    // Mark as completed if progress is 100%
    if (progress.progress === 100 && !progress.completedAt) {
      progress.completedAt = Date.now();
    }

    await progress.save();
    await progress.populate('courseId', 'title desc lessons courseduration');

    res.json(progress);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// GET all courses with user progress
router.get('/user/:userId/progress', async (req, res) => {
  try {
    const { userId } = req.params;

    const progressRecords = await CourseProgress.find({ userId })
      .populate('courseId', 'title desc lessons courseduration')
      .sort({ lastAccessedAt: -1 });

    res.json(progressRecords);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

