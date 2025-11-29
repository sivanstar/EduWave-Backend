const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  duelKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  hostName: {
    type: String,
    required: true,
  },
  opponentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  opponentName: {
    type: String,
  },
  topic: {
    type: String,
    required: true,
  },
  numQuestions: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['waiting', 'locked', 'started', 'completed', 'expired', 'cancelled', 'forfeited'],
    default: 'waiting',
  },
  hostScore: {
    type: Number,
    default: 0,
  },
  opponentScore: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  startedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const gameStatsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  gamesPlayed: {
    type: Number,
    default: 0,
  },
  gamesWon: {
    type: Number,
    default: 0,
  },
  pointsEarned: {
    type: Number,
    default: 0,
  },
  duelsToday: {
    type: Number,
    default: 0,
  },
  duelsThisWeek: {
    type: Number,
    default: 0,
  },
  lastDuelDate: {
    type: Date,
  },
  lastDuelWeek: {
    type: String,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

gameStatsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const GameSession = mongoose.model('GameSession', gameSessionSchema);
const GameStats = mongoose.model('GameStats', gameStatsSchema);

module.exports = { GameSession, GameStats };

