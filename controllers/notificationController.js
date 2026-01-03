const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper function to create notification for a user
async function createNotificationForUser(userId, title, message, type = 'info', link = null) {
  try {
    if (!userId) {
      return null;
    }
    
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
    });
    
    return notification;
  } catch (error) {
    return null;
  }
}

// Helper function to create notifications for all users
async function createNotificationForAllUsers(title, message, type = 'info', link = null) {
  try {
    const users = await User.find().select('_id').lean();
    const notifications = [];
    
    for (const user of users) {
      const notification = await createNotificationForUser(user._id, title, message, type, link);
      if (notification) {
        notifications.push(notification);
      }
    }
    
    return notifications;
  } catch (error) {
    return [];
  }
}

// Get user notifications
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 20, unreadOnly = false } = req.query;
    const query = { user: req.user._id };

    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create notification
exports.createNotification = async (req, res) => {
  try {
    const { title, message, type = 'info', link } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required',
      });
    }

    const notification = await Notification.create({
      user: req.user._id,
      title,
      message,
      type,
      link,
    });

    res.status(201).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check and send study planner reminders
exports.checkStudyPlannerReminders = async () => {
  try {
    const { StudySession } = require('../models/StudyPlan');
    const now = new Date();
    
    // Find upcoming study sessions that are not completed
    const upcomingSessions = await StudySession.find({
      completed: false,
      date: { $gte: now },
    }).populate('user', 'fullName email');
    
    let remindersSent = 0;
    
    for (const session of upcomingSessions) {
      const timeUntilSession = session.date.getTime() - now.getTime();
      const hoursUntil = timeUntilSession / (1000 * 60 * 60);
      
      // Initialize remindersSent if not exists
      if (!session.remindersSent) {
        session.remindersSent = { '24h': false, '12h': false, '3h': false };
      }
      
      // Check for 24-hour reminder (24h to 12h before)
      if (hoursUntil <= 24 && hoursUntil > 12 && !session.remindersSent['24h']) {
        await createNotificationForUser(
          session.user._id,
          'Study Session Reminder - 24 Hours',
          `Your study session "${session.topic}" for ${session.subject} is in 24 hours (${session.date.toLocaleString()})`,
          'warning',
          '/study-planner.html'
        );
        session.remindersSent['24h'] = true;
        remindersSent++;
        await session.save();
      }
      
      // Check for 12-hour reminder (12h to 3h before)
      if (hoursUntil <= 12 && hoursUntil > 3 && !session.remindersSent['12h']) {
        await createNotificationForUser(
          session.user._id,
          'Study Session Reminder - 12 Hours',
          `Your study session "${session.topic}" for ${session.subject} is in 12 hours (${session.date.toLocaleString()})`,
          'warning',
          '/study-planner.html'
        );
        session.remindersSent['12h'] = true;
        remindersSent++;
        await session.save();
      }
      
      // Check for 3-hour reminder (3h to 0h before)
      if (hoursUntil <= 3 && hoursUntil > 0 && !session.remindersSent['3h']) {
        await createNotificationForUser(
          session.user._id,
          'Study Session Reminder - 3 Hours',
          `Your study session "${session.topic}" for ${session.subject} is in 3 hours (${session.date.toLocaleString()})`,
          'warning',
          '/study-planner.html'
        );
        session.remindersSent['3h'] = true;
        remindersSent++;
        await session.save();
      }
    }
    
    return { checked: upcomingSessions.length, remindersSent };
  } catch (error) {
    console.error('Error checking study planner reminders:', error);
    return { error: error.message };
  }
};

// Export helper functions for use in other controllers
exports.createNotificationForUser = createNotificationForUser;
exports.createNotificationForAllUsers = createNotificationForAllUsers;

