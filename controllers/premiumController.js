const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');

// Get premium settings (public)
exports.getPremiumSettings = async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    res.status(200).json({
      success: true,
      data: {
        premiumEnabled: settings.premiumEnabled,
        trialDuration: settings.trialDuration,
        courseLimitFree: settings.courseLimitFree || settings.courseLimit || 2,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user premium status
exports.getPremiumStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const settings = await AdminSettings.getSettings();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if premium is disabled globally
    if (!settings.premiumEnabled) {
      return res.status(200).json({
        success: true,
        data: {
          isPremium: true,
          inTrial: false,
          remainingTrialDays: 0,
          reason: 'premium_disabled',
        },
      });
    }

    // Check if user is pro
    if (user.isPro) {
      return res.status(200).json({
        success: true,
        data: {
          isPremium: true,
          inTrial: false,
          remainingTrialDays: 0,
          reason: 'pro',
        },
      });
    }

    // Check trial status
    let inTrial = false;
    let remainingTrialDays = 0;

    if (user.trialStartDate) {
      const trialStart = new Date(user.trialStartDate);
      const now = new Date();
      const daysSinceStart = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
      const trialDuration = settings.trialDuration || 60;

      if (daysSinceStart <= trialDuration) {
        inTrial = true;
        remainingTrialDays = Math.max(0, trialDuration - daysSinceStart);
      } else if (!user.trialExpired) {
        user.trialExpired = true;
        await user.save();
      }
    }

    // Get monthly course status
    const monthKey = getMonthKey();
    const coursesStatus = getMonthlyCoursesStatus(user, monthKey, settings);

    res.status(200).json({
      success: true,
      data: {
        isPremium: inTrial || user.isPro,
        inTrial,
        remainingTrialDays,
        coursesUsed: coursesStatus.used,
        coursesLimit: coursesStatus.limit,
        coursesRemaining: coursesStatus.remaining,
        reason: inTrial ? 'trial' : user.isPro ? 'pro' : 'free',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Start user trial
exports.startTrial = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.trialStartDate) {
      return res.status(400).json({
        success: false,
        message: 'Trial already started',
      });
    }

    user.trialStartDate = new Date();
    user.trialExpired = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Trial started successfully',
      data: {
        trialStartDate: user.trialStartDate,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Check course access
exports.checkCourseAccess = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user = await User.findById(req.user._id);
    const settings = await AdminSettings.getSettings();

    if (!user) {
      return res.status(401).json({
        success: false,
        allowed: false,
        reason: 'not_logged_in',
        message: 'Please sign in to enroll in courses.',
      });
    }

    // If premium disabled, allow all
    if (!settings.premiumEnabled) {
      return res.status(200).json({
        success: true,
        allowed: true,
        reason: 'premium_disabled',
        message: 'Access granted',
      });
    }

    // Check if user is premium
    const isPremium = await checkUserPremium(user, settings);
    if (isPremium) {
      return res.status(200).json({
        success: true,
        allowed: true,
        reason: 'premium',
        message: 'Premium access granted',
      });
    }

    // Check monthly limit for free users
    const monthKey = getMonthKey();
    const coursesStatus = await getMonthlyCoursesStatus(user, monthKey, settings);
    const alreadyEnrolled = user.coursesThisMonth?.some(c => c.courseId === courseId);

    if (alreadyEnrolled) {
      return res.status(200).json({
        success: true,
        allowed: true,
        reason: 'already_enrolled',
        used: coursesStatus.used,
        limit: coursesStatus.limit,
        remaining: coursesStatus.remaining,
        message: 'You are enrolled in this course',
      });
    }

    if (coursesStatus.used < coursesStatus.limit) {
      return res.status(200).json({
        success: true,
        allowed: true,
        reason: 'within_limit',
        used: coursesStatus.used,
        limit: coursesStatus.limit,
        remaining: coursesStatus.remaining - 1,
        message: `You can enroll. ${coursesStatus.remaining - 1} free course${coursesStatus.remaining - 1 !== 1 ? 's' : ''} remaining this month.`,
      });
    }

    return res.status(200).json({
      success: true,
      allowed: false,
      reason: 'limit_reached',
      used: coursesStatus.used,
      limit: coursesStatus.limit,
      remaining: 0,
      message: `Monthly limit reached (${coursesStatus.limit} courses). Upgrade to Premium for unlimited access.`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Enroll in course
exports.enrollInCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const user = await User.findById(req.user._id);
    const settings = await AdminSettings.getSettings();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Please sign in first.',
      });
    }

    if (!courseId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required',
      });
    }

    // Check if premium or premium disabled
    const isPremium = await checkUserPremium(user, settings);
    if (!settings.premiumEnabled || isPremium) {
      // Just track for stats
      if (!user.coursesAccessed) user.coursesAccessed = [];
      if (!user.coursesAccessed.includes(courseId)) {
        user.coursesAccessed.push(courseId);
      }
      await user.save();
      return res.status(200).json({
        success: true,
        message: 'Enrolled successfully',
      });
    }

    // Free user - check monthly limit
    const monthKey = getMonthKey();
    if (user.currentMonth !== monthKey) {
      user.currentMonth = monthKey;
      user.coursesThisMonth = [];
    }

    if (!user.coursesThisMonth) {
      user.coursesThisMonth = [];
    }

    // Check if already enrolled
    const alreadyEnrolled = user.coursesThisMonth.some(c => c.courseId === courseId);
    if (alreadyEnrolled) {
      if (!user.coursesAccessed) user.coursesAccessed = [];
      if (!user.coursesAccessed.includes(courseId)) {
        user.coursesAccessed.push(courseId);
      }
      await user.save();
      return res.status(200).json({
        success: true,
        alreadyEnrolled: true,
        message: 'You are already enrolled in this course',
      });
    }

    // Check limit
    const limit = settings.courseLimitFree || settings.courseLimit || 2;
    if (user.coursesThisMonth.length >= limit) {
      return res.status(400).json({
        success: false,
        limitReached: true,
        message: `Monthly limit reached (${limit} courses). Upgrade for unlimited access.`,
      });
    }

    // Enroll
    user.coursesThisMonth.push({
      courseId,
      enrolledAt: new Date(),
    });

    if (!user.coursesAccessed) user.coursesAccessed = [];
    if (!user.coursesAccessed.includes(courseId)) {
      user.coursesAccessed.push(courseId);
    }

    await user.save();

    const remaining = Math.max(0, limit - user.coursesThisMonth.length);
    res.status(200).json({
      success: true,
      message: `Enrolled! ${remaining} free course${remaining !== 1 ? 's' : ''} remaining this month.`,
      remaining,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get monthly courses status
exports.getMonthlyCoursesStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const settings = await AdminSettings.getSettings();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const monthKey = getMonthKey();
    const coursesStatus = await getMonthlyCoursesStatus(user, monthKey, settings);

    res.status(200).json({
      success: true,
      data: coursesStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper functions
function getMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function checkUserPremium(user, settings) {
  if (user.isPro) return true;

  if (user.trialStartDate) {
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysSinceStart = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    const trialDuration = settings.trialDuration || 60;

    if (daysSinceStart <= trialDuration) {
      return true;
    } else if (!user.trialExpired) {
      user.trialExpired = true;
      await user.save();
    }
  }

  return false;
}

async function getMonthlyCoursesStatus(user, monthKey, settings) {
  // Reset if new month
  if (user.currentMonth !== monthKey) {
    user.currentMonth = monthKey;
    user.coursesThisMonth = [];
    await user.save();
  }

  const limit = settings.courseLimitFree || settings.courseLimit || 2;
  const used = user.coursesThisMonth?.length || 0;
  const remaining = Math.max(0, limit - used);

  return { used, limit, remaining };
}

