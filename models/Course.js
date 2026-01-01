const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
  },
  instructorName: {
    type: String,
    required: [true, 'Instructor name is required'],
    trim: true,
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
  },
  duration: {
    type: String,
    trim: true,
  },
  videoUrl: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  accessCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
  },
  files: {
    type: [{
      name: {
        type: String,
        required: true,
      },
      path: {
        type: String,
        required: true,
      },
      size: {
        type: Number,
        default: 0,
      },
      type: {
        type: String,
        default: '',
      },
    }],
    default: [],
  },
  // Course Manager fields
  icon: {
    type: String,
    default: '📚',
  },
  difficulty: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
  },
  lessons: [{
    id: Number,
    title: String,
    videoUrl: String,
    duration: String,
    description: String,
    source: String,
    sourceUrl: String,
    order: Number,
  }],
  totalLessons: {
    type: Number,
    default: 0,
  },
  objectives: [String],
  prerequisites: {
    type: String,
    default: 'None',
  },
  contentType: {
    type: String,
    enum: ['curated', 'original', 'mixed'],
    default: 'curated',
  },
  attribution: {
    type: String,
  },
  licenseType: {
    type: String,
    enum: ['fair-use', 'cc-by', 'cc-by-sa', 'mit-ocw', 'youtube-embed'],
    default: 'fair-use',
  },
  rating: {
    type: Number,
    default: 0,
  },
  studentsEnrolled: {
    type: Number,
    default: 0,
  },
  enrolledStudents: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    progress: {
      type: Number,
      default: 0,
    },
  }],
  isPublished: {
    type: Boolean,
    default: true,
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

courseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Course', courseSchema);

