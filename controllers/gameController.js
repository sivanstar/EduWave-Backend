const { GameSession, GameStats } = require('../models/Game');
const User = require('../models/User');
const crypto = require('crypto');

// Generate unique duel key
function generateDuelKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 6; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Get or create game stats for user
async function getOrCreateStats(userId) {
  let stats = await GameStats.findOne({ user: userId });
  if (!stats) {
    stats = await GameStats.create({ user: userId });
  }
  return stats;
}

// Create a new duel
exports.createDuel = async (req, res) => {
  try {
    const { topic, numQuestions } = req.body;

    if (!topic || !numQuestions) {
      return res.status(400).json({
        success: false,
        message: 'Topic and number of questions are required',
      });
    }

    // Check duel limits
    const stats = await getOrCreateStats(req.user._id);
    const user = await User.findById(req.user._id);
    const isPremium = user.isPro || (user.trialStartDate && !user.trialExpired);
    
    const today = new Date().toISOString().split('T')[0];
    const currentWeek = new Date().toISOString().split('T')[0].substring(0, 7) + '-' + 
      Math.ceil(new Date().getDate() / 7);
    
    // Reset daily count if new day
    if (stats.lastDuelDate && new Date(stats.lastDuelDate).toISOString().split('T')[0] !== today) {
      stats.duelsToday = 0;
      stats.lastDuelDate = new Date();
    }

    // Reset weekly count if new week
    if (stats.lastDuelWeek !== currentWeek) {
      stats.duelsThisWeek = 0;
      stats.lastDuelWeek = currentWeek;
    }

    // Check limits based on premium status
    const dailyLimit = isPremium ? 5 : 1;
    const weeklyLimit = isPremium ? 20 : 3;

    if (stats.duelsToday >= dailyLimit) {
      return res.status(403).json({
        success: false,
        message: `Daily duel limit reached (${dailyLimit} per day). ${isPremium ? '' : 'Upgrade to Premium for 5 duels per day.'}`,
      });
    }

    if (stats.duelsThisWeek >= weeklyLimit) {
      return res.status(403).json({
        success: false,
        message: `Weekly duel limit reached (${weeklyLimit} per week). ${isPremium ? '' : 'Upgrade to Premium for 20 duels per week.'}`,
      });
    }

    // Generate unique duel key
    let duelKey = generateDuelKey();
    while (await GameSession.findOne({ duelKey })) {
      duelKey = generateDuelKey();
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Update stats
    stats.duelsToday += 1;
    stats.duelsThisWeek += 1;
    stats.lastDuelDate = new Date();
    stats.lastDuelWeek = currentWeek;
    await stats.save();

    const duel = await GameSession.create({
      duelKey,
      hostId: req.user._id,
      hostName: req.user.fullName,
      topic,
      numQuestions: parseInt(numQuestions),
      expiresAt,
    });

    res.status(201).json({
      success: true,
      data: {
        duelKey: duel.duelKey,
        expiresAt: duel.expiresAt,
        topic: duel.topic,
        numQuestions: duel.numQuestions,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Join a duel
exports.joinDuel = async (req, res) => {
  try {
    const { duelKey } = req.body;

    if (!duelKey) {
      return res.status(400).json({
        success: false,
        message: 'Duel key is required',
      });
    }

    const duel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() });

    if (!duel) {
      return res.status(404).json({
        success: false,
        message: 'Invalid duel key',
      });
    }

    if (duel.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: `Duel is ${duel.status}`,
      });
    }

    if (duel.expiresAt < new Date()) {
      duel.status = 'expired';
      await duel.save();
      return res.status(400).json({
        success: false,
        message: 'Duel key has expired',
      });
    }

    if (duel.hostId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot join your own duel',
      });
    }

    // Check opponent's duel limits
    const opponentStats = await getOrCreateStats(req.user._id);
    const today = new Date().toISOString().split('T')[0];
    
    if (opponentStats.lastDuelDate && new Date(opponentStats.lastDuelDate).toISOString().split('T')[0] !== today) {
      opponentStats.duelsToday = 0;
      opponentStats.lastDuelDate = new Date();
    }

    const dailyLimit = 1;
    if (opponentStats.duelsToday >= dailyLimit) {
      return res.status(403).json({
        success: false,
        message: 'You have reached your daily duel limit',
      });
    }

    // Update duel
    duel.opponentId = req.user._id;
    duel.opponentName = req.user.fullName;
    duel.status = 'locked';
    await duel.save();

    // Update opponent stats
    opponentStats.duelsToday += 1;
    opponentStats.lastDuelDate = new Date();
    await opponentStats.save();

    res.status(200).json({
      success: true,
      data: {
        duelKey: duel.duelKey,
        topic: duel.topic,
        numQuestions: duel.numQuestions,
        hostName: duel.hostName,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get duel status
exports.getDuelStatus = async (req, res) => {
  try {
    const { duelKey } = req.params;

    const duel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() })
      .populate('hostId', 'fullName email')
      .populate('opponentId', 'fullName email');

    if (!duel) {
      return res.status(404).json({
        success: false,
        message: 'Duel not found',
      });
    }

    res.status(200).json({
      success: true,
      data: duel,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Start duel (host starts the game)
exports.startDuel = async (req, res) => {
  try {
    const { duelKey } = req.body;

    const duel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() });

    if (!duel) {
      return res.status(404).json({
        success: false,
        message: 'Duel not found',
      });
    }

    if (duel.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can start the duel',
      });
    }

    if (duel.status !== 'locked') {
      return res.status(400).json({
        success: false,
        message: 'Duel is not ready to start',
      });
    }

    // Update host stats
    const hostStats = await getOrCreateStats(req.user._id);
    const today = new Date().toISOString().split('T')[0];
    
    if (hostStats.lastDuelDate && new Date(hostStats.lastDuelDate).toISOString().split('T')[0] !== today) {
      hostStats.duelsToday = 0;
      hostStats.lastDuelDate = new Date();
    }

    hostStats.duelsToday += 1;
    hostStats.lastDuelDate = new Date();
    await hostStats.save();

    duel.status = 'started';
    duel.startedAt = new Date();
    await duel.save();

    res.status(200).json({
      success: true,
      data: duel,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Submit game results
exports.submitGameResult = async (req, res) => {
  try {
    const { duelKey, score, isSolo } = req.body;

    const stats = await getOrCreateStats(req.user._id);

    if (isSolo) {
      // Solo game - just update stats
      stats.gamesPlayed += 1;
      await stats.save();

      return res.status(200).json({
        success: true,
        message: 'Solo game result saved',
      });
    }

    // Duel game
    if (!duelKey) {
      return res.status(400).json({
        success: false,
        message: 'Duel key is required for duel games',
      });
    }

    const duel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() });

    if (!duel) {
      return res.status(404).json({
        success: false,
        message: 'Duel not found',
      });
    }

    // Update scores
    const isHost = duel.hostId.toString() === req.user._id.toString();
    if (isHost) {
      duel.hostScore = parseInt(score);
    } else {
      duel.opponentScore = parseInt(score);
    }

    // Check if both players have submitted
    if (duel.hostScore > 0 && duel.opponentScore > 0) {
      duel.status = 'completed';
      duel.completedAt = new Date();

      // Update stats for both players
      stats.gamesPlayed += 1;
      const opponentStats = await getOrCreateStats(duel.opponentId);

      // Determine winner and update points
      if (duel.hostScore > duel.opponentScore) {
        const hostStats = await getOrCreateStats(duel.hostId);
        hostStats.gamesWon += 1;
        hostStats.currentGameStreak = (hostStats.currentGameStreak || 0) + 1;
        hostStats.maxGameStreak = Math.max(hostStats.maxGameStreak || 0, hostStats.currentGameStreak);
        hostStats.pointsEarned += 5;
        await hostStats.save();
        
        // Update User points
        const hostUser = await User.findById(duel.hostId);
        if (hostUser) {
          hostUser.points = (hostUser.points || 0) + 5;
          await hostUser.save();
          
          // Check wave rider badge (5 wins in a row)
          const badgeService = require('../utils/badgeService');
          if (hostStats.currentGameStreak >= 5) {
            await badgeService.awardBadge(hostUser._id, 'wave_rider');
          }
          await badgeService.checkPointBadges(hostUser._id);
        }
        
        // Loser loses streak
        opponentStats.currentGameStreak = 0;
        opponentStats.pointsEarned += 2;
        await opponentStats.save();
        const opponentUser = await User.findById(duel.opponentId);
        if (opponentUser) {
          opponentUser.points = (opponentUser.points || 0) + 2;
          await opponentUser.save();
          const badgeService = require('../utils/badgeService');
          await badgeService.checkPointBadges(opponentUser._id);
        }
      } else if (duel.opponentScore > duel.hostScore) {
        // Opponent wins
        stats.gamesWon += 1;
        stats.currentGameStreak = (stats.currentGameStreak || 0) + 1;
        stats.maxGameStreak = Math.max(stats.maxGameStreak || 0, stats.currentGameStreak);
        stats.pointsEarned += 5;
        await stats.save();
        const opponentUser = await User.findById(duel.opponentId);
        if (opponentUser) {
          opponentUser.points = (opponentUser.points || 0) + 5;
          await opponentUser.save();
          
          // Check wave rider badge (5 wins in a row)
          const badgeService = require('../utils/badgeService');
          if (stats.currentGameStreak >= 5) {
            await badgeService.awardBadge(opponentUser._id, 'wave_rider');
          }
          await badgeService.checkPointBadges(opponentUser._id);
        }
        
        // Host loses streak
        const hostStats = await getOrCreateStats(duel.hostId);
        hostStats.currentGameStreak = 0;
        hostStats.pointsEarned += 2;
        await hostStats.save();
        const hostUser = await User.findById(duel.hostId);
        if (hostUser) {
          hostUser.points = (hostUser.points || 0) + 2;
          await hostUser.save();
          const badgeService = require('../utils/badgeService');
          await badgeService.checkPointBadges(hostUser._id);
        }
      } else {
        // Draw
        stats.gamesWon += 1;
        stats.pointsEarned += 2;
        const opponentUser = await User.findById(duel.opponentId);
        if (opponentUser) {
          opponentUser.points = (opponentUser.points || 0) + 2;
          await opponentUser.save();
        }
        
        const hostStats = await getOrCreateStats(duel.hostId);
        hostStats.gamesWon += 1;
        hostStats.pointsEarned += 2;
        await hostStats.save();
        const hostUser = await User.findById(duel.hostId);
        if (hostUser) {
          hostUser.points = (hostUser.points || 0) + 2;
          await hostUser.save();
        }
      }

      opponentStats.gamesPlayed += 1;
      await opponentStats.save();
    }

    await duel.save();
    await stats.save();

    res.status(200).json({
      success: true,
      data: {
        duel,
        isComplete: duel.status === 'completed',
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user game statistics
exports.getGameStats = async (req, res) => {
  try {
    const stats = await getOrCreateStats(req.user._id);

    // Calculate win rate
    const winRate = stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

    // Check and reset daily/weekly limits
    const today = new Date().toISOString().split('T')[0];
    const weekStart = getWeekStart();

    if (stats.lastDuelDate && new Date(stats.lastDuelDate).toISOString().split('T')[0] !== today) {
      stats.duelsToday = 0;
      stats.lastDuelDate = new Date();
    }

    if (stats.lastDuelWeek !== weekStart) {
      stats.duelsThisWeek = 0;
      stats.lastDuelWeek = weekStart;
    }

    await stats.save();

    res.status(200).json({
      success: true,
      data: {
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
        winRate,
        pointsEarned: stats.pointsEarned,
        duelsToday: stats.duelsToday,
        duelsThisWeek: stats.duelsThisWeek,
        dailyLimit: 1, // Can be made configurable
        weeklyLimit: 3,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Cancel duel
exports.cancelDuel = async (req, res) => {
  try {
    const { duelKey } = req.body;

    const duel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() });

    if (!duel) {
      return res.status(404).json({
        success: false,
        message: 'Duel not found',
      });
    }

    if (duel.hostId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can cancel the duel',
      });
    }

    if (duel.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel duel in current status',
      });
    }

    duel.status = 'cancelled';
    await duel.save();

    res.status(200).json({
      success: true,
      message: 'Duel cancelled successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to get week start
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

