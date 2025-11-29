const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  topic: {
    type: String,
    required: [true, 'Topic is required'],
    trim: true,
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  timeSlot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'midnight'],
    required: [true, 'Time slot is required'],
  },
  duration: {
    type: Number,
    required: [true, 'Duration is required'],
    min: 15,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  notes: {
    type: String,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
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
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// User study preferences
const studyPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  studyDays: [{
    type: String,
    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  }],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

studySessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const StudySession = mongoose.model('StudySession', studySessionSchema);
const StudyPreferences = mongoose.model('StudyPreferences', studyPreferencesSchema);

module.exports = { StudySession, StudyPreferences };

