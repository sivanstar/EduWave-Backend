const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Reply content is required'],
    trim: true,
  },
  image: {
    type: String, // Base64 or URL
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  helpfulVotes: {
    type: Number,
    default: 0,
  },
  votedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  reported: {
    type: Boolean,
    default: false,
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reportedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const forumPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    maxlength: 150,
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
  },
  image: {
    type: String, // Base64 or URL
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['general', 'qa', 'career'],
    required: true,
  },
  helpfulVotes: {
    type: Number,
    default: 0,
  },
  votedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  replies: [replySchema],
  flagged: {
    type: Boolean,
    default: false,
  },
  flaggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  flaggedAt: {
    type: Date,
  },
  edited: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
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

forumPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add database indexes for frequently queried fields (CRITICAL for performance)
forumPostSchema.index({ category: 1, createdAt: -1 }); // For category filtering and sorting
forumPostSchema.index({ author: 1 }); // For finding posts by author
forumPostSchema.index({ createdAt: -1 }); // For sorting by date
forumPostSchema.index({ 'forumStats.helpfulVotes': -1 }); // For leaderboard queries
forumPostSchema.index({ flagged: 1 }); // For filtering flagged posts

const ForumPost = mongoose.model('ForumPost', forumPostSchema);

module.exports = ForumPost;

