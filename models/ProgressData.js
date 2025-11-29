const mongoose = require('mongoose');

const progressDataSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Course code is required'],
    trim: true,
  },
  units: {
    type: Number,
    required: [true, 'Credit units are required'],
    min: 1,
    max: 6,
  },
  score: {
    type: Number,
    required: [true, 'Score is required'],
    min: 0,
    max: 100,
  },
  grade: {
    type: String,
    required: [true, 'Grade is required'],
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
  },
  gradePoint: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
  },
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Semester',
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const semesterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Semester name is required'],
    trim: true,
  },
  totalCourses: {
    type: Number,
    default: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const academicGoalSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Goal title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  targetValue: {
    type: Number,
  },
  currentValue: {
    type: Number,
    default: 0,
  },
  deadline: {
    type: Date,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ProgressData = mongoose.model('ProgressData', progressDataSchema);
const Semester = mongoose.model('Semester', semesterSchema);
const AcademicGoal = mongoose.model('AcademicGoal', academicGoalSchema);

module.exports = { ProgressData, Semester, AcademicGoal };

