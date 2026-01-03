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
      .populate('instructor', 'fullName email role _id')
      .populate('enrolledStudents.userId', 'fullName email');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const User = require('../models/User');
    
    // Check if user is admin
    const isAdmin = req.user && req.user.role === 'admin';
    
    // Check if current user is the course creator
    let isCourseCreator = false;
    if (req.user && course.instructor) {
      const instructorId = typeof course.instructor === 'object' 
        ? course.instructor._id 
        : course.instructor;
      isCourseCreator = instructorId && instructorId.toString() === req.user._id.toString();
    }
    
    // Check if course creator is admin
    let creatorIsAdmin = false;
    if (typeof course.instructor === 'object' && course.instructor.role) {
      creatorIsAdmin = course.instructor.role === 'admin';
    } else if (course.instructor) {
      const instructorUser = await User.findById(course.instructor);
      creatorIsAdmin = instructorUser && instructorUser.role === 'admin';
    }

    // Determine if access code is required
    // No access code needed if: user is admin, user is creator, or course has no access code (admin-created)
    const requiresAccessCode = course.accessCode && !isAdmin && !isCourseCreator && !creatorIsAdmin;
    let accessCodeUsed = false;
    
    if (requiresAccessCode) {
      // Check if accessCode was provided in query or body
      const providedCode = (req.query.accessCode || req.body.accessCode || '').trim().toUpperCase();
      const courseAccessCode = (course.accessCode || '').trim().toUpperCase();
      
      if (!providedCode || providedCode !== courseAccessCode) {
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

    // Track last course opened and auto-enroll (if authenticated and not creator)
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        user.lastCourseOpened = {
          courseId: course.courseId,
          courseName: course.title,
          openedAt: new Date(),
        };
        await user.save({ validateBeforeSave: false });
        
        // Auto-enroll if not already enrolled and not the course creator
        if (!isCourseCreator) {
          const isEnrolled = course.enrolledStudents.some(
            student => student.userId.toString() === req.user._id.toString()
          );
          
          if (!isEnrolled) {
            course.enrolledStudents.push({
              userId: req.user._id,
              enrolledAt: new Date(),
              progress: 0,
            });
            await course.save();
          }
        }
        
        // Check first step badge
        const badgeService = require('../utils/badgeService');
        await badgeService.checkFirstStep(user._id);
      }
    }

    // Refresh course data with updated enrollment
    const updatedCourse = await Course.findOne({ courseId: req.params.courseId })
      .populate('instructor', 'fullName email role _id')
      .populate('enrolledStudents.userId', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedCourse,
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

    // Track last course opened and auto-enroll (if authenticated and not creator)
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
        
        // Check if user is course creator
      const instructorId = typeof course.instructor === 'object' ? course.instructor._id : course.instructor;
        const isCourseCreator = instructorId && instructorId.toString() === req.user._id.toString();
        
        // Auto-enroll if not already enrolled and not the course creator
        if (!isCourseCreator) {
          const isEnrolled = course.enrolledStudents.some(
            student => student.userId.toString() === req.user._id.toString()
          );
          
          if (!isEnrolled) {
            course.enrolledStudents.push({
              userId: req.user._id,
              enrolledAt: new Date(),
              progress: 0,
            });
            await course.save();
          }
        }
        
        // Notify course creator if course was accessed with accessCode (not public/admin course)
        if (course.instructor && course.accessCode && !isCourseCreator) {
          const { createNotificationForUser } = require('./notificationController');
          await createNotificationForUser(
            instructorId,
            'Course Accessed',
            `${user.fullName} accessed your course "${course.title}" using access code`,
            'info',
            `/course-manager.html`
          );
        }
        
        // Check first step badge
        const badgeService = require('../utils/badgeService');
        await badgeService.checkFirstStep(user._id);
      }
    }

    // Refresh course data with updated enrollment
    const updatedCourse = await Course.findOne({ accessCode: req.params.accessCode.toUpperCase() })
      .populate('instructor', 'fullName email')
      .populate('enrolledStudents.userId', 'fullName email');

    res.status(200).json({
      success: true,
      data: updatedCourse,
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

    // For students/admins, show all courses (don't filter by isPublished)
    // Courses will be filtered on frontend by admin instructor
    // Note: There are only 'user' and 'admin' roles, so 'instructor' check is not needed

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
      .populate('instructor', 'fullName email role _id isPro')
      .select(selectFields)
      .lean(); // Use lean() for better performance

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

// Assign all courses without instructors to admin (one-time fix)
// Allow any authenticated user to trigger this as it's a data fix operation
exports.assignCoursesToAdmin = async (req, res) => {
  try {
    // Require authentication but allow any user (this is a data fix operation)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const User = require('../models/User');
    const Course = require('../models/Course');
    
    // Get or create a system admin user
    let adminUser = await User.findOne({ role: 'admin' });
    
    if (!adminUser) {
      adminUser = await User.create({
        fullName: 'EduWave System',
        email: 'system@eduwave.com',
        password: crypto.randomBytes(32).toString('hex'),
        role: 'admin',
        isEmailVerified: true,
      });
    }

    // Find all courses and check their instructor status
    const allCourses = await Course.find({}).populate('instructor', 'role');
    
    // Separate courses into two groups:
    // 1. Courses without instructors (null, undefined, or populated instructor is null)
    // 2. Courses with non-admin instructors
    const coursesWithoutInstructor = [];
    const coursesWithNonAdminInstructor = [];
    
    for (const course of allCourses) {
      // Check if instructor is null after population (could be invalid ObjectId or actually null)
      const hasInstructor = course.instructor && 
                           course.instructor !== null && 
                           typeof course.instructor === 'object' && 
                           course.instructor._id;
      
      if (!hasInstructor) {
        // Course has no instructor (null ObjectId, invalid ObjectId, or populated result is null)
        coursesWithoutInstructor.push(course._id);
      } else if (course.instructor.role && course.instructor.role !== 'admin') {
        // Course has instructor but it's not an admin
        coursesWithNonAdminInstructor.push(course._id);
      }
    }

    // Update all courses without instructors to assign them to admin
    let updateResult1 = { modifiedCount: 0, matchedCount: 0 };
    if (coursesWithoutInstructor.length > 0) {
      // Update using updateMany - this should work for courses with null or invalid instructor ObjectIds
      updateResult1 = await Course.updateMany(
        {
          _id: { $in: coursesWithoutInstructor }
        },
        {
          $set: {
            instructor: adminUser._id,
            instructorName: adminUser.fullName || 'EduWave System'
          }
        }
      );
      // If updateMany didn't work, try updating individually
      if (updateResult1.modifiedCount === 0 && coursesWithoutInstructor.length > 0) {
        let individualUpdates = 0;
        for (const courseId of coursesWithoutInstructor) {
          try {
            const result = await Course.findByIdAndUpdate(
              courseId,
              {
                $set: {
                  instructor: adminUser._id,
                  instructorName: adminUser.fullName || 'EduWave System'
                }
              },
              { new: true }
            );
            if (result) individualUpdates++;
          } catch (err) {
            // Silent error handling
          }
        }
        updateResult1.modifiedCount = individualUpdates;
      }
    }

    // Update all courses with non-admin instructors to assign them to admin
    let updateResult2 = { modifiedCount: 0 };
    if (coursesWithNonAdminInstructor.length > 0) {
      updateResult2 = await Course.updateMany(
        {
          _id: { $in: coursesWithNonAdminInstructor }
        },
        {
          $set: {
            instructor: adminUser._id,
            instructorName: adminUser.fullName || 'EduWave System'
          }
        }
      );
    }

    const totalUpdated = updateResult1.modifiedCount + updateResult2.modifiedCount;

    res.status(200).json({
      success: true,
      message: `Assigned ${totalUpdated} courses to admin`,
      adminId: adminUser._id,
      adminName: adminUser.fullName,
      coursesUpdated: totalUpdated,
      coursesWithoutInstructor: updateResult1.modifiedCount,
      coursesWithNonAdminInstructor: updateResult2.modifiedCount,
      totalCoursesFound: coursesWithoutInstructor.length + coursesWithNonAdminInstructor.length,
      coursesWithoutInstructorIds: coursesWithoutInstructor.length,
      coursesWithNonAdminInstructorIds: coursesWithNonAdminInstructor.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

