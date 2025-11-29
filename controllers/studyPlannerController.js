const { StudySession, StudyPreferences } = require('../models/StudyPlan');

// Create a new study session
exports.createSession = async (req, res) => {
  try {
    const { subject, topic, date, timeSlot, duration, priority, notes } = req.body;

    if (!subject || !topic || !date || !timeSlot || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Please provide subject, topic, date, timeSlot, and duration',
      });
    }

    const session = await StudySession.create({
      subject,
      topic,
      date,
      timeSlot,
      duration: parseInt(duration),
      priority: priority || 'medium',
      notes: notes || '',
      user: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all study sessions for user
exports.getSessions = async (req, res) => {
  try {
    const { completed, date } = req.query;
    const query = { user: req.user._id };

    if (completed !== undefined) {
      query.completed = completed === 'true';
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const sessions = await StudySession.find(query).sort({ date: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get a single study session
exports.getSession = async (req, res) => {
  try {
    const session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Study session not found',
      });
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a study session
exports.updateSession = async (req, res) => {
  try {
    const session = await StudySession.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Study session not found',
      });
    }

    const { subject, topic, date, timeSlot, duration, priority, notes, completed } = req.body;

    if (subject) session.subject = subject;
    if (topic) session.topic = topic;
    if (date) session.date = date;
    if (timeSlot) session.timeSlot = timeSlot;
    if (duration) session.duration = parseInt(duration);
    if (priority) session.priority = priority;
    if (notes !== undefined) session.notes = notes;
    if (completed !== undefined) {
      session.completed = completed;
      session.completedAt = completed ? new Date() : null;
    }

    await session.save();

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a study session
exports.deleteSession = async (req, res) => {
  try {
    const session = await StudySession.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Study session not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Study session deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete all study sessions
exports.deleteAllSessions = async (req, res) => {
  try {
    await StudySession.deleteMany({ user: req.user._id });

    res.status(200).json({
      success: true,
      message: 'All study sessions deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get study statistics
exports.getStatistics = async (req, res) => {
  try {
    const sessions = await StudySession.find({ user: req.user._id });

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.completed).length;
    const totalMinutes = sessions
      .filter(s => s.completed)
      .reduce((sum, s) => sum + s.duration, 0);
    const studyHours = (totalMinutes / 60).toFixed(1);

    // Weekly progress (sessions completed this week)
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const weeklySessions = sessions.filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= startOfWeek && sessionDate < endOfWeek && s.completed;
    });
    const weeklyProgress = totalSessions > 0 
      ? Math.round((weeklySessions.length / totalSessions) * 100) 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalSessions,
        completedSessions,
        studyHours: parseFloat(studyHours),
        weeklyProgress,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update study preferences (study days)
exports.updatePreferences = async (req, res) => {
  try {
    const { studyDays } = req.body;

    let preferences = await StudyPreferences.findOne({ user: req.user._id });

    if (preferences) {
      preferences.studyDays = studyDays || [];
      preferences.updatedAt = new Date();
      await preferences.save();
    } else {
      preferences = await StudyPreferences.create({
        user: req.user._id,
        studyDays: studyDays || [],
      });
    }

    res.status(200).json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get study preferences
exports.getPreferences = async (req, res) => {
  try {
    let preferences = await StudyPreferences.findOne({ user: req.user._id });

    if (!preferences) {
      // Default preferences
      preferences = await StudyPreferences.create({
        user: req.user._id,
        studyDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      });
    }

    res.status(200).json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

