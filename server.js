const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();
const connectDB = require('./config/database');

const app = express();

// CORS middleware - Allow frontend to access API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to database
connectDB();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to EduWise API' });
});

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' 
  });
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const courseRoutes = require('./routes/courseRoutes');
const textToPdfRoutes = require('./routes/textToPdfRoutes');
const pdfToLinkRoutes = require('./routes/pdfToLinkRoutes');
const studyPlannerRoutes = require('./routes/studyPlannerRoutes');
const progressAnalyticsRoutes = require('./routes/progressAnalyticsRoutes');
const cgpaCalculatorRoutes = require('./routes/cgpaCalculatorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const gameRoutes = require('./routes/gameRoutes');
const forumRoutes = require('./routes/forumRoutes');
const videoPlayerRoutes = require('./routes/videoPlayerRoutes');
const premiumRoutes = require('./routes/premiumRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Auth routes
app.use('/auth', authRoutes);

// User routes
app.use('/api/users', userRoutes);

// Course routes
app.use('/api/courses', courseRoutes);

// Text to PDF routes
app.use('/api/text-to-pdf', textToPdfRoutes);

// PDF to Link routes
app.use('/api/pdf-to-link', pdfToLinkRoutes);

// Study Planner routes
app.use('/api/study-planner', studyPlannerRoutes);

// Progress Analytics routes
app.use('/api/progress-analytics', progressAnalyticsRoutes);

// CGPA Calculator routes
app.use('/api/cgpa-calculator', cgpaCalculatorRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Leaderboard routes
app.use('/api/leaderboard', leaderboardRoutes);

// Game routes
app.use('/api/games', gameRoutes);

// Forum routes
app.use('/api/forum', forumRoutes);

// Video Player routes
app.use('/api/video-player', videoPlayerRoutes);

// Premium routes
app.use('/api/premium', premiumRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : {} 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
