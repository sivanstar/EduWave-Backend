const { ProgressData, Semester, AcademicGoal } = require('../models/ProgressData');

const gradePoints = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

// Create a new course performance record
exports.createCourse = async (req, res) => {
  try {
    const { name, code, units, score, grade, semester } = req.body;

    if (!name || !code || !units || score === undefined || !grade) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, code, units, score, and grade',
      });
    }

    if (score < 0 || score > 100) {
      return res.status(400).json({
        success: false,
        message: 'Score must be between 0 and 100',
      });
    }

    const course = await ProgressData.create({
      name,
      code,
      units: parseInt(units),
      score: parseFloat(score),
      grade,
      gradePoint: gradePoints[grade],
      semester: semester || null,
      user: req.user._id,
    });

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

// Get all courses for user
exports.getCourses = async (req, res) => {
  try {
    const { semester } = req.query;
    const query = { user: req.user._id };

    if (semester) {
      query.semester = semester;
    }

    const courses = await ProgressData.find(query)
      .populate('semester', 'name')
      .sort({ date: -1 });

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

// Delete a course
exports.deleteCourse = async (req, res) => {
  try {
    const course = await ProgressData.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

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

// Delete all courses
exports.deleteAllCourses = async (req, res) => {
  try {
    await ProgressData.deleteMany({ user: req.user._id });

    res.status(200).json({
      success: true,
      message: 'All courses deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get statistics
exports.getStatistics = async (req, res) => {
  try {
    const courses = await ProgressData.find({ user: req.user._id });

    if (courses.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          cgpa: 0,
          coursesCompleted: 0,
          averageScore: 0,
          bestScore: 0,
          bestCourse: null,
        },
      });
    }

    // Calculate CGPA
    const totalGradePoints = courses.reduce((sum, c) => sum + (c.gradePoint * c.units), 0);
    const totalUnits = courses.reduce((sum, c) => sum + c.units, 0);
    const cgpa = totalUnits > 0 ? (totalGradePoints / totalUnits) : 0;

    // Average score
    const totalScore = courses.reduce((sum, c) => sum + c.score, 0);
    const averageScore = totalScore / courses.length;

    // Best performance
    const bestCourse = courses.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    res.status(200).json({
      success: true,
      data: {
        cgpa: parseFloat(cgpa.toFixed(2)),
        coursesCompleted: courses.length,
        averageScore: parseFloat(averageScore.toFixed(1)),
        bestScore: bestCourse.score,
        bestCourse: bestCourse.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Semester CRUD
exports.createSemester = async (req, res) => {
  try {
    const { name, totalCourses } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Semester name is required',
      });
    }

    const semester = await Semester.create({
      name,
      totalCourses: totalCourses || 0,
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: semester,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getSemesters = async (req, res) => {
  try {
    const semesters = await Semester.find({ user: req.user._id }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: semesters.length,
      data: semesters,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateSemester = async (req, res) => {
  try {
    const semester = await Semester.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!semester) {
      return res.status(404).json({
        success: false,
        message: 'Semester not found',
      });
    }

    const { name, totalCourses } = req.body;
    if (name) semester.name = name;
    if (totalCourses !== undefined) semester.totalCourses = totalCourses;

    await semester.save();

    res.status(200).json({
      success: true,
      data: semester,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteSemester = async (req, res) => {
  try {
    const semester = await Semester.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!semester) {
      return res.status(404).json({
        success: false,
        message: 'Semester not found',
      });
    }

    // Remove semester reference from courses
    await ProgressData.updateMany(
      { semester: req.params.id },
      { $unset: { semester: 1 } }
    );

    res.status(200).json({
      success: true,
      message: 'Semester deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Academic Goals CRUD
exports.createGoal = async (req, res) => {
  try {
    const { title, description, targetValue, deadline } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Goal title is required',
      });
    }

    const goal = await AcademicGoal.create({
      title,
      description: description || '',
      targetValue: targetValue || null,
      deadline: deadline || null,
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: goal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getGoals = async (req, res) => {
  try {
    const goals = await AcademicGoal.find({ user: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: goals.length,
      data: goals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateGoal = async (req, res) => {
  try {
    const goal = await AcademicGoal.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found',
      });
    }

    const { title, description, targetValue, currentValue, deadline, completed } = req.body;
    if (title) goal.title = title;
    if (description !== undefined) goal.description = description;
    if (targetValue !== undefined) goal.targetValue = targetValue;
    if (currentValue !== undefined) goal.currentValue = currentValue;
    if (deadline !== undefined) goal.deadline = deadline;
    if (completed !== undefined) goal.completed = completed;

    await goal.save();

    res.status(200).json({
      success: true,
      data: goal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteGoal = async (req, res) => {
  try {
    const goal = await AcademicGoal.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Goal deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

