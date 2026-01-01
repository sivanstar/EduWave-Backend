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

    // Allow all authenticated users to create courses
    // Students will have accessCode required, admins won't

    // Generate unique IDs
    let courseId = generateCourseId();
    
    // Ensure uniqueness
    while (await Course.findOne({ courseId })) {
      courseId = generateCourseId();
    }

    // Generate access code based on creator role:
    // - Admin-created courses: No accessCode (accessible to all without code)
    // - Student/Instructor-created courses: Always require accessCode
    let accessCode = req.body.accessCode;
    if (req.user.role === 'admin') {
      // Admin courses don't need accessCode - accessible to all
      accessCode = null;
    } else {
      // Students/instructors always need accessCode
      if (!accessCode && req.body.generateAccessCode !== false) {
        accessCode = generateAccessCode();
        while (await Course.findOne({ accessCode })) {
          accessCode = generateAccessCode();
        }
      }
    }

    // Validate and format files array
    let files = [];
    if (req.body.files && Array.isArray(req.body.files)) {
      files = req.body.files.map(file => ({
        name: file.name || '',
        path: file.path || '',
        size: typeof file.size === 'number' ? file.size : 0,
        type: file.type || '',
      })).filter(file => file.name && file.path); // Only include files with name and path
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
      files: files,
    };

    // Add access code only if provided (for student/instructor courses)
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
      .populate('instructor', 'fullName email role')
      .populate('enrolledStudents.userId', 'fullName email');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check access permissions:
    // - Admins can access any course without accessCode
    // - Admin-created courses are accessible to all without accessCode
    // - Student/instructor-created courses require accessCode (unless user is admin)
    const User = require('../models/User');
    const isAdmin = req.user && req.user.role === 'admin';
    
    // Check if course creator is admin
    let creatorIsAdmin = false;
    const instructor = course.instructor;
    
    if (instructor && typeof instructor === 'object' && instructor.role) {
      // Instructor is populated with user data
      creatorIsAdmin = instructor.role === 'admin';
    } else if (instructor) {
      // If instructor is just an ID, fetch the user
      const instructorUser = await User.findById(instructor);
      creatorIsAdmin = instructorUser && instructorUser.role === 'admin';
    }

    // Access rules:
    // 1. Admins can always access
    // 2. Admin-created courses don't require accessCode (if course has no accessCode, it's admin-created)
    // 3. Student/instructor-created courses require accessCode (unless user is admin)
    const requiresAccessCode = !creatorIsAdmin && !isAdmin && course.accessCode;
    let accessCodeUsed = false;
    
    if (requiresAccessCode) {
      // Check if accessCode was provided in query
      const providedCode = req.query.accessCode || req.body.accessCode;
      if (!providedCode || providedCode.toUpperCase() !== course.accessCode.toUpperCase()) {
        return res.status(403).json({
          success: false,
          message: 'Access code required. Please provide a valid access code.',
          requiresAccessCode: true,
        });
      }
      accessCodeUsed = true;
    }
    
    // Notify course creator if course was accessed with accessCode (not public/admin course)
    if (accessCodeUsed && course.accessCode && req.user && course.instructor) {
      const instructorId = typeof course.instructor === 'object' ? course.instructor._id : course.instructor;
      
      // Don't notify if user is accessing their own course
      if (instructorId.toString() !== req.user._id.toString()) {
        const { createNotificationForUser } = require('./notificationController');
        const accessingUser = await User.findById(req.user._id);
        await createNotificationForUser(
          instructorId,
          'Course Accessed',
          `${accessingUser.fullName} accessed your course "${course.title}" using access code`,
          'info',
          `/course-manager.html`
        );
      }
    }

    // Track last course opened (if authenticated)
    if (req.user) {
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

    // Notify course creator if course was accessed with accessCode (not public/admin course)
    // Only notify if user is authenticated and not the course creator
    if (req.user && course.instructor && course.accessCode) {
      const instructorId = typeof course.instructor === 'object' ? course.instructor._id : course.instructor;
      
      console.log(`🔔 Course access check: user=${req.user._id}, instructor=${instructorId}, accessCode=${course.accessCode}`);
      
      if (instructorId.toString() !== req.user._id.toString()) {
        const User = require('../models/User');
        const { createNotificationForUser } = require('./notificationController');
        const accessingUser = await User.findById(req.user._id);
        
        if (accessingUser) {
          console.log(`📬 Creating notification for course creator ${instructorId} about access by ${accessingUser.fullName}`);
          const notification = await createNotificationForUser(
            instructorId,
            'Course Accessed',
            `${accessingUser.fullName} accessed your course "${course.title}" using access code`,
            'info',
            `/course-manager.html`
          );
          
          if (notification) {
            console.log(`✅ Notification created successfully: ${notification._id}`);
          } else {
            console.error(`❌ Failed to create notification for course creator`);
          }
        } else {
          console.warn(`⚠️ Accessing user not found: ${req.user._id}`);
        }
      } else {
        console.log(`ℹ️ User is accessing their own course, no notification needed`);
      }
    } else {
      if (!req.user) {
        console.log(`ℹ️ Course accessed without authentication, no notification sent`);
      } else if (!course.accessCode) {
        console.log(`ℹ️ Course has no accessCode (public course), no notification sent`);
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

