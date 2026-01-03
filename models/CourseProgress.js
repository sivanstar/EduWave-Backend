const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema({
  lessonId: {
    type: Number,
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  watchTime: {
    type: Number, // in seconds
    default: 0,
  },
  lastWatchedAt: {
    type: Date,
  },
});

const courseProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  courseId: {
    type: String,
    required: true,
  },
  lessons: [lessonProgressSchema],
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
  },
  totalWatchTime: {
    type: Number, // in seconds
    default: 0,
  },
  lastAccessedAt: {
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

courseProgressSchema.index({ user: 1, courseId: 1 }, { unique: true });
courseProgressSchema.index({ user: 1, lastAccessedAt: -1 }); // For sorting user's courses
courseProgressSchema.index({ course: 1 }); // For finding progress by course
courseProgressSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('CourseProgress', courseProgressSchema);

