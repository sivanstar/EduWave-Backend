const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
  },
  units: {
    type: Number,
    required: true,
    min: 0,
  },
  grade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F', ''],
    default: '',
  },
});

const semesterSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true,
  },
  courses: [courseSchema],
});

const cgpaCalculationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  semesters: [semesterSchema],
  cgpa: {
    type: Number,
  },
  calculatedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

cgpaCalculationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('CGPACalculation', cgpaCalculationSchema);

