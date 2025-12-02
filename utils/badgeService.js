const User = require('../models/User');
const CourseProgress = require('../models/CourseProgress');
const ForumPost = require('../models/Forum');

// Badge definitions
const ACHIEVEMENT_BADGES = {
  first_step: { name: 'First Step', icon: '👣', description: 'Open a course, use a tool, and post in forum' },
  goal_setter: { name: 'Goal Setter', icon: '🎯', description: 'Use Smart Study Planner or Progress Analytics for 7 consecutive days' },
  quick_learner: { name: 'Quick Learner', icon: '⚡', description: 'Complete a course within 1 day' },
  wave_rider: { name: 'Wave Rider', icon: '🏄', description: 'Win 5 games in a row on Learning Games' },
  consistent: { name: 'Consistent', icon: '📅', description: 'Log into EduWave for 1 month (30 days streak)' },
  daily_grinder: { name: 'Daily Grinder', icon: '💪', description: 'Use any EduWave tools daily for 14 consecutive days' },
  expert: { name: 'Expert', icon: '🎓', description: 'Complete 5 courses' },
  wave_champion: { name: 'Wave Champion', icon: '🏆', description: 'Reach top 3 on the Leaderboard' },
  wave_influencer: { name: 'Wave Influencer', icon: '🌟', description: 'Get 100 likes on a single post' },
  trending: { name: 'Trending', icon: '🔥', description: 'Have 100 comments on a single post' },
};

const POINT_BADGES = {
  bronze: { name: 'EduWaver Bronze', icon: '🥉', minPoints: 1000, maxPoints: 4999 },
  silver: { name: 'EduWaver Silver', icon: '🥈', minPoints: 5000, maxPoints: 9999 },
  gold: { name: 'EduWaver Gold', icon: '🥇', minPoints: 10000, maxPoints: 19999 },
  platinum: { name: 'EduWaver Platinum', icon: '💎', minPoints: 20000, maxPoints: 99999 },
  legend: { name: 'EduWaver Legend', icon: '👑', minPoints: 100000, maxPoints: Infinity },
};

// Initialize badge if it doesn't exist
function initBadge(user, badgeId, isPointBadge = false) {
  const badgeType = isPointBadge ? 'point' : 'achievement';
  if (!user.badges) {
    user.badges = { achievement: [], point: [] };
  }
  if (!user.badges[badgeType]) {
    user.badges[badgeType] = [];
  }
  
  const existingBadge = user.badges[badgeType].find(b => b.id === badgeId);
  if (!existingBadge) {
    user.badges[badgeType].push({
      id: badgeId,
      earned: false,
      progress: 0,
      earnedAt: null,
    });
  }
  return user.badges[badgeType].find(b => b.id === badgeId);
}

// Award a badge
async function awardBadge(userId, badgeId, isPointBadge = false) {
  try {
    const user = await User.findById(userId);
    if (!user) return false;

    const badge = initBadge(user, badgeId, isPointBadge);
    
    if (!badge.earned) {
      badge.earned = true;
      badge.earnedAt = new Date();
      await user.save({ validateBeforeSave: false });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error awarding badge:', error);
    return false;
  }
}

// Update badge progress
async function updateBadgeProgress(userId, badgeId, progress, isPointBadge = false) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const badge = initBadge(user, badgeId, isPointBadge);
    badge.progress = progress;
    await user.save({ validateBeforeSave: false });
  } catch (error) {
    console.error('Error updating badge progress:', error);
  }
}

// Check and award point badges
async function checkPointBadges(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const points = user.points || 0;

    for (const [badgeId, badgeData] of Object.entries(POINT_BADGES)) {
      if (points >= badgeData.minPoints && points <= badgeData.maxPoints) {
        await awardBadge(userId, badgeId, true);
      }
    }
  } catch (error) {
    console.error('Error checking point badges:', error);
  }
}

// Check first step badge (course opened, tool used, forum post)
async function checkFirstStep(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    let progress = 0;
    if (user.lastCourseOpened) progress++;
    if (user.lastToolUsed) progress++;
    if (user.forumStats?.posts > 0) progress++;

    await updateBadgeProgress(userId, 'first_step', progress);
    
    if (progress >= 3) {
      await awardBadge(userId, 'first_step');
    }
  } catch (error) {
    console.error('Error checking first step:', error);
  }
}

// Check consistent badge (30 day login streak)
async function checkConsistent(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const streak = user.loginStreak || 0;
    await updateBadgeProgress(userId, 'consistent', streak);
    
    if (streak >= 30) {
      await awardBadge(userId, 'consistent');
    }
  } catch (error) {
    console.error('Error checking consistent:', error);
  }
}

// Check expert badge (5 courses completed)
async function checkExpert(userId) {
  try {
    const progressRecords = await CourseProgress.find({ user: userId });
    const completedCourses = progressRecords.filter(p => p.progress >= 100).length;
    
    await updateBadgeProgress(userId, 'expert', completedCourses);
    
    if (completedCourses >= 5) {
      await awardBadge(userId, 'expert');
    }
  } catch (error) {
    console.error('Error checking expert:', error);
  }
}

// Check wave champion (top 3 on leaderboard)
async function checkWaveChampion(userId) {
  try {
    const user = await User.findById(userId).select('points');
    if (!user) return;

    const usersAbove = await User.countDocuments({
      points: { $gt: user.points || 0 },
    });
    const rank = usersAbove + 1;

    if (rank <= 3) {
      await awardBadge(userId, 'wave_champion');
    }
  } catch (error) {
    console.error('Error checking wave champion:', error);
  }
}

// Check wave influencer (100 likes on a post)
async function checkWaveInfluencer(userId) {
  try {
    const posts = await ForumPost.find({ author: userId });
    for (const post of posts) {
      if (post.helpfulVotes >= 100) {
        await awardBadge(userId, 'wave_influencer');
        break;
      }
    }
  } catch (error) {
    console.error('Error checking wave influencer:', error);
  }
}

// Check trending (100 replies on a post)
async function checkTrending(userId) {
  try {
    const posts = await ForumPost.find({ author: userId });
    for (const post of posts) {
      if (post.replies && post.replies.length >= 100) {
        await awardBadge(userId, 'trending');
        break;
      }
    }
  } catch (error) {
    console.error('Error checking trending:', error);
  }
}

// Check daily grinder badge (14 consecutive tool days)
async function checkDailyGrinder(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const streak = user.consecutiveToolDays || 0;
    await updateBadgeProgress(userId, 'daily_grinder', streak);
    
    if (streak >= 14) {
      await awardBadge(userId, 'daily_grinder');
    }
  } catch (error) {
    console.error('Error checking daily grinder:', error);
  }
}

// Check goal setter badge (7 consecutive days using study planner or analytics)
async function checkGoalSetter(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const maxDays = Math.max(user.studyPlannerDays || 0, user.analyticsDays || 0);
    await updateBadgeProgress(userId, 'goal_setter', maxDays);
    
    if (maxDays >= 7) {
      await awardBadge(userId, 'goal_setter');
    }
  } catch (error) {
    console.error('Error checking goal setter:', error);
  }
}

// Check all badges for a user
async function checkAllBadges(userId) {
  await checkPointBadges(userId);
  await checkFirstStep(userId);
  await checkConsistent(userId);
  await checkExpert(userId);
  await checkWaveChampion(userId);
  await checkWaveInfluencer(userId);
  await checkTrending(userId);
  await checkDailyGrinder(userId);
  await checkGoalSetter(userId);
}

module.exports = {
  awardBadge,
  updateBadgeProgress,
  checkPointBadges,
  checkFirstStep,
  checkConsistent,
  checkExpert,
  checkWaveChampion,
  checkWaveInfluencer,
  checkTrending,
  checkDailyGrinder,
  checkGoalSetter,
  checkAllBadges,
  ACHIEVEMENT_BADGES,
  POINT_BADGES,
};

