const Course = require('../models/Course');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

// Generate unique access code
function generateAccessCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Generate unique course ID
function generateCourseId() {
  return `COURSE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new course
exports.createCourse = async (req, res) => {
  try {
    const { title, instructorName, category, description, duration, videoUrl, notes } = req.body;

    if (!title || !instructorName || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, instructorName, category, and description',
      });
    }

    // Check if user is instructor or admin
    if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only instructors and admins can create courses',
      });
    }

    // Generate unique IDs
    let courseId = generateCourseId();
    
    // Ensure uniqueness
    while (await Course.findOne({ courseId })) {
      courseId = generateCourseId();
    }

    // Generate access code only if not provided (for course-creator)
    let accessCode = req.body.accessCode;
    if (!accessCode && req.body.generateAccessCode !== false) {
      accessCode = generateAccessCode();
      while (await Course.findOne({ accessCode })) {
        accessCode = generateAccessCode();
      }
    }

    const courseData = {
      courseId,
      title,
      instructorName,
      instructor: req.user._id,
      category,
      description,
      duration: duration || '',
      videoUrl: videoUrl || '',
      notes: notes || '',
      files: req.body.files || [],
    };

    // Add access code only if provided (for course-creator)
    if (accessCode) {
      courseData.accessCode = accessCode;
    }

    // Add course-manager fields if provided
    if (req.body.icon) courseData.icon = req.body.icon;
    if (req.body.difficulty) courseData.difficulty = req.body.difficulty;
    if (req.body.lessons) courseData.lessons = req.body.lessons;
    if (req.body.totalLessons !== undefined) courseData.totalLessons = req.body.totalLessons;
    if (req.body.objectives) courseData.objectives = req.body.objectives;
    if (req.body.prerequisites) courseData.prerequisites = req.body.prerequisites;
    if (req.body.contentType) courseData.contentType = req.body.contentType;
    if (req.body.attribution) courseData.attribution = req.body.attribution;
    if (req.body.licenseType) courseData.licenseType = req.body.licenseType;

    const course = await Course.create(courseData);

    res.status(201).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all courses for the instructor
exports.getMyCourses = async (req, res) => {
  try {
    const courses = await Course.find({ instructor: req.user._id })
      .sort({ createdAt: -1 })
      .populate('instructor', 'fullName email');

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get course by ID
exports.getCourseById = async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId })
      .populate('instructor', 'fullName email')
      .populate('enrolledStudents.userId', 'fullName email');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Track last course opened (if authenticated)
    if (req.user) {
      const User = require('../models/User');
      const user = await User.findById(req.user._id);
      if (user) {
        user.lastCourseOpened = {
          courseId: course.courseId,
          courseName: course.title,
          openedAt: new Date(),
        };
        await user.save({ validateBeforeSave: false });
        
        // Check first step badge
        const badgeService = require('../utils/badgeService');
        await badgeService.checkFirstStep(user._id);
      }
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get course by access code
exports.getCourseByAccessCode = async (req, res) => {
  try {
    const course = await Course.findOne({ accessCode: req.params.accessCode.toUpperCase() })
      .populate('instructor', 'fullName email');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Invalid access code. Course not found.',
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Enroll in a course
exports.enrollInCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if already enrolled
    const isEnrolled = course.enrolledStudents.some(
      student => student.userId.toString() === req.user._id.toString()
    );

    if (isEnrolled) {
      return res.status(400).json({
        success: false,
        message: 'You are already enrolled in this course',
      });
    }

    course.enrolledStudents.push({
      userId: req.user._id,
      enrolledAt: new Date(),
      progress: 0,
    });

    await course.save();

    res.status(200).json({
      success: true,
      message: 'Successfully enrolled in course',
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get enrolled courses for a student
exports.getEnrolledCourses = async (req, res) => {
  try {
    const courses = await Course.find({
      'enrolledStudents.userId': req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate('instructor', 'fullName email');

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Download course file
exports.downloadFile = async (req, res) => {
  try {
    const { courseId, fileName } = req.params;
    
    const course = await Course.findOne({ courseId });
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const file = course.files.find(f => f.name === fileName || f.path.includes(fileName));
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    const filePath = path.join(__dirname, '..', file.path);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server',
      });
    }

    res.download(filePath, file.name);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a course
exports.updateCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if user owns the course or is admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course',
      });
    }

    // Update fields
    const {
      title,
      description,
      category,
      icon,
      difficulty,
      duration,
      videoUrl,
      notes,
      lessons,
      totalLessons,
      objectives,
      prerequisites,
      contentType,
      attribution,
      licenseType,
    } = req.body;

    if (title) course.title = title;
    if (description) course.description = description;
    if (category) course.category = category;
    if (icon !== undefined) course.icon = icon;
    if (difficulty) course.difficulty = difficulty;
    if (duration !== undefined) course.duration = duration;
    if (videoUrl !== undefined) course.videoUrl = videoUrl;
    if (notes !== undefined) course.notes = notes;
    if (lessons) course.lessons = lessons;
    if (totalLessons !== undefined) course.totalLessons = totalLessons;
    if (objectives) course.objectives = objectives;
    if (prerequisites !== undefined) course.prerequisites = prerequisites;
    if (contentType) course.contentType = contentType;
    if (attribution !== undefined) course.attribution = attribution;
    if (licenseType) course.licenseType = licenseType;

    await course.save();

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a course
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findOne({ courseId: req.params.courseId });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if user owns the course or is admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this course',
      });
    }

    // Delete associated files
    if (course.files && course.files.length > 0) {
      for (const file of course.files) {
        try {
          const filePath = path.join(__dirname, '..', file.path);
          await fs.unlink(filePath);
        } catch (error) {
          console.error(`Error deleting file ${file.path}:`, error);
        }
      }
    }

    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all courses (for course manager grid)
exports.getAllCourses = async (req, res) => {
  try {
    const { category, difficulty, search } = req.query;
    const query = {};

    // For instructors, show only their courses. For students/admins, show all published courses
    if (req.user.role === 'instructor') {
      query.instructor = req.user._id;
    } else {
      // For students and admins, show all published courses
      query.isPublished = true;
    }

    if (category) {
      query.category = category;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // For students, include enrollment data. For instructors/admins, exclude it
    const selectFields = req.user.role === 'student' 
      ? '' // Include all fields including enrolledStudents for students
      : '-enrolledStudents'; // Exclude for instructors/admins

    const courses = await Course.find(query)
      .sort({ createdAt: -1 })
      .populate('instructor', 'fullName email')
      .select(selectFields);

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Seed default courses (only for admin or system)
exports.seedDefaultCourses = async (req, res) => {
  try {
    // Only allow admin or if no courses exist yet
    const courseCount = await Course.countDocuments();
    if (courseCount > 0 && req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can seed courses when courses already exist',
      });
    }

    const { courses } = req.body;

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of courses to seed',
      });
    }

    // Get or create a system admin user for default courses
    const User = require('../models/User');
    let systemInstructor = await User.findOne({ role: 'admin' });
    
    if (!systemInstructor) {
      // Create a system instructor if no admin exists
      systemInstructor = await User.create({
        fullName: 'EduWave System',
        email: 'system@eduwave.com',
        password: crypto.randomBytes(32).toString('hex'), // Random password
        role: 'admin',
        isEmailVerified: true,
      });
    }

    const seededCourses = [];
    const skippedCourses = [];

    for (const courseData of courses) {
      try {
        // Check if course with this ID already exists
        const existingCourse = await Course.findOne({ courseId: courseData.id });
        
        if (existingCourse) {
          skippedCourses.push({
            courseId: courseData.id,
            title: courseData.title,
            reason: 'Course already exists',
          });
          continue;
        }

        // Map frontend course structure to backend structure
        const mappedCourse = {
          courseId: courseData.id,
          title: courseData.title,
          instructorName: courseData.instructor || 'Curated by EduWave Team',
          instructor: systemInstructor._id,
          category: courseData.category,
          description: courseData.description,
          duration: courseData.duration || '',
          videoUrl: courseData.videoUrl || '',
          notes: courseData.notes || '',
          icon: courseData.icon || '📚',
          difficulty: courseData.difficulty || 'Beginner',
          lessons: courseData.lessons || [],
          totalLessons: courseData.totalLessons || (courseData.lessons?.length || 0),
          objectives: courseData.objectives || [],
          prerequisites: courseData.prerequisites || 'None',
          contentType: courseData.contentType || 'curated',
          attribution: courseData.attribution || '',
          licenseType: courseData.licenseType || 'youtube-embed',
          rating: courseData.rating || 0,
          studentsEnrolled: courseData.studentsEnrolled || 0,
          isPublished: true,
        };

        const course = await Course.create(mappedCourse);
        seededCourses.push({
          courseId: course.courseId,
          title: course.title,
        });
      } catch (error) {
        console.error(`Error seeding course ${courseData.id}:`, error);
        skippedCourses.push({
          courseId: courseData.id,
          title: courseData.title,
          reason: error.message,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Seeded ${seededCourses.length} courses, skipped ${skippedCourses.length}`,
      seeded: seededCourses,
      skipped: skippedCourses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

