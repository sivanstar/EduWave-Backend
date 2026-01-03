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
  username: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
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
  passwordResetToken: {
    type: String,
  },
  passwordResetExpire: {
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
  toolsUsed: [{
    toolId: String,
    toolName: String,
    firstUsedAt: Date,
    lastUsedAt: Date,
    lastPointsAwardedAt: Date,
  }],
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

// Add database indexes for frequently queried fields (CRITICAL for performance)
userSchema.index({ email: 1 }); // Already unique, but explicit index helps
userSchema.index({ points: -1 }); // For leaderboard queries
userSchema.index({ 'forumStats.helpfulVotes': -1 }); // For forum leaderboard
userSchema.index({ loginStreak: -1 }); // For streak queries
userSchema.index({ createdAt: -1 }); // For sorting users by join date
userSchema.index({ isPro: 1, trialExpired: 1 }); // For premium queries

// Ensure points are always whole numbers (integers)
userSchema.pre('save', function(next) {
  if (this.points !== undefined && this.points !== null) {
    this.points = Math.round(this.points);
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

