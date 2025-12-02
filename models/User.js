const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please add your full name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ],
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false, // Don't return password by default
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
  },
  emailVerificationExpire: {
    type: Date,
  },
  refreshToken: {
    type: String,
    select: false,
  },
  role: {
    type: String,
    enum: ['user', 'instructor', 'admin'],
    default: 'user',
  },
  points: {
    type: Number,
    default: 0,
  },
  badges: {
    achievement: [{
      id: String,
      earned: Boolean,
      progress: Number,
      earnedAt: Date,
    }],
    point: [{
      id: String,
      earned: Boolean,
      earnedAt: Date,
    }],
  },
  forumStats: {
    posts: {
      type: Number,
      default: 0,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
  },
  isPro: {
    type: Boolean,
    default: false,
  },
  trialStartDate: {
    type: Date,
  },
  trialExpired: {
    type: Boolean,
    default: false,
  },
  upgradeDate: {
    type: Date,
  },
  coursesThisMonth: [{
    courseId: String,
    enrolledAt: Date,
  }],
  currentMonth: {
    type: String, // Format: "YYYY-MM"
  },
  coursesAccessed: [String],
  loginStreak: {
    type: Number,
    default: 0,
  },
  lastLoginDate: {
    type: Date,
  },
  lastToolUsed: {
    toolId: String,
    toolName: String,
    usedAt: Date,
  },
  lastCourseOpened: {
    courseId: String,
    courseName: String,
    openedAt: Date,
  },
  lastPostCreated: {
    postId: String,
    title: String,
    createdAt: Date,
  },
  toolsUsedCount: {
    type: Number,
    default: 0,
  },
  consecutiveToolDays: {
    type: Number,
    default: 0,
  },
  lastToolUseDate: {
    type: Date,
  },
  studyPlannerDays: {
    type: Number,
    default: 0,
  },
  analyticsDays: {
    type: Number,
    default: 0,
  },
  lastStudyPlannerDate: {
    type: Date,
  },
  lastAnalyticsDate: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

