const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const connectDB = require('./config/database');

const app = express();

// CORS middleware - Environment-aware for Vercel/production
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null'];
  
  const origin = req.headers.origin;
  
  // Handle preflight requests first
  if (req.method === 'OPTIONS') {
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      // Allow all origins in development (including null for file:// protocol)
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return res.sendStatus(200);
  }
  
  // Handle actual requests
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    // Allow all origins in development (including null for file:// protocol)
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  next();
});

// Middleware
// Increase body size limit to handle base64 image uploads (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve verification page - check backend/public first, then frontend directory
app.get('/verify-email.html', (req, res) => {
  // Try multiple possible paths to handle different deployment scenarios
  // Priority: backend/public (for Render/production) > frontend directory
  const possiblePaths = [
    path.resolve(__dirname, 'public/verify-email.html'), // Backend public directory (for production)
    path.join(__dirname, 'public', 'verify-email.html'), // Alternative path join
    path.resolve(__dirname, '../frontend/verify-email.html'), // Frontend directory (for local dev)
    path.resolve(__dirname, '../../frontend/verify-email.html'),
    path.resolve(process.cwd(), 'backend/public/verify-email.html'),
    path.resolve(process.cwd(), 'public/verify-email.html'),
    path.resolve(process.cwd(), 'frontend/verify-email.html'),
    path.resolve(process.cwd(), '../frontend/verify-email.html'),
    // Render-specific absolute paths (already absolute, don't resolve)
    '/opt/render/project/src/backend/public/verify-email.html',
    '/opt/render/project/backend/public/verify-email.html',
    '/opt/render/project/public/verify-email.html',
    path.resolve('/opt/render/project/src/backend/public/verify-email.html'),
    path.resolve('/opt/render/project/backend/public/verify-email.html'),
  ];
  
  let filePath = null;
  
  // Find the first path that exists
  for (const possiblePath of possiblePaths) {
    try {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        console.log(`Found verify-email.html at: ${filePath}`);
        break;
      }
    } catch (err) {
      // Continue to next path
    }
  }
  
  if (!filePath) {
    console.error('verify-email.html not found. Tried paths:', possiblePaths);
    console.error('Current __dirname:', __dirname);
    console.error('Current process.cwd():', process.cwd());
    return res.status(404).json({
      success: false,
      message: 'Verification page not found',
    });
  }
  
  res.sendFile(filePath);
});

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

// Set up periodic check for study planner reminders (every hour)
const { checkStudyPlannerReminders } = require('./controllers/notificationController');

// Check reminders immediately on server start (after DB connection)
setTimeout(async () => {
  if (mongoose.connection.readyState === 1) {
    console.log('Checking study planner reminders...');
    const result = await checkStudyPlannerReminders();
    console.log(`Study planner reminders checked: ${result.checked || 0} sessions, ${result.remindersSent || 0} reminders sent`);
  }
}, 5000); // Wait 5 seconds for DB connection

// Check reminders every hour
setInterval(async () => {
  if (mongoose.connection.readyState === 1) {
    const result = await checkStudyPlannerReminders();
    console.log(`Study planner reminders checked: ${result.checked || 0} sessions, ${result.remindersSent || 0} reminders sent`);
  }
}, 60 * 60 * 1000); // Every hour

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});