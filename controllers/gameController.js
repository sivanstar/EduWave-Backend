const { GameSession, GameStats } = require('../models/Game');
const User = require('../models/User');
const crypto = require('crypto');
const axios = require('axios');

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

    // Check if duel already has an opponent (prevent race condition)
    if (duel.opponentId) {
      return res.status(400).json({
        success: false,
        message: 'This duel already has an opponent',
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

    // Joining duels is unlimited for all users - no limit checks needed
    // Use findOneAndUpdate with atomic operation to prevent race conditions
    const updatedDuel = await GameSession.findOneAndUpdate(
      { 
        duelKey: duelKey.toUpperCase(),
        status: 'waiting',
        opponentId: null // Only update if no opponent exists
      },
      {
        opponentId: req.user._id,
        opponentName: req.user.fullName,
        status: 'locked',
      },
      { new: true }
    );

    if (!updatedDuel) {
      // Duel was already taken or status changed
      const currentDuel = await GameSession.findOne({ duelKey: duelKey.toUpperCase() });
      if (currentDuel && currentDuel.opponentId) {
        return res.status(400).json({
          success: false,
          message: 'This duel already has an opponent',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Unable to join duel. It may have been cancelled or already started.',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        duelKey: updatedDuel.duelKey,
        topic: updatedDuel.topic,
        numQuestions: updatedDuel.numQuestions,
        hostName: updatedDuel.hostName,
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

    // Don't increment stats here - already done when creating/joining
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

    // If game is forfeited, don't award points (0 points for quit/forfeit)
    if (duel.status === 'forfeited') {
      return res.status(200).json({
        success: true,
        data: {
          duel,
          isComplete: true,
          pointsAwarded: 0,
          message: 'Game was forfeited - no points awarded',
        },
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
          
          // Check badges
          const badgeService = require('../utils/badgeService');
          await badgeService.checkWaveRider(hostUser._id); // Check if 5 wins in a row
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
          
          // Check badges
          const badgeService = require('../utils/badgeService');
          await badgeService.checkWaveRider(opponentUser._id); // Check if 5 wins in a row
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

    // Get user premium status for limits
    const user = await User.findById(req.user._id);
    const isPremium = user.isPro || (user.trialStartDate && !user.trialExpired);
    const dailyLimit = isPremium ? 5 : 1;
    const weeklyLimit = isPremium ? 20 : 3;

    res.status(200).json({
      success: true,
      data: {
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
        winRate,
        pointsEarned: stats.pointsEarned,
        duelsToday: stats.duelsToday,
        duelsThisWeek: stats.duelsThisWeek,
        dailyLimit,
        weeklyLimit,
        isPremium,
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

// Simple question bank (subset from frontend)
const questionBank = {
  general: [
    { q: "What is the capital of France?", a: ["Paris", "London", "Berlin", "Madrid"], correct: 0 },
    { q: "Which planet is known as the Red Planet?", a: ["Mars", "Venus", "Jupiter", "Saturn"], correct: 0 },
    { q: "Who painted the Mona Lisa?", a: ["Leonardo da Vinci", "Michelangelo", "Raphael", "Donatello"], correct: 0 },
    { q: "What is the largest ocean on Earth?", a: ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"], correct: 0 },
    { q: "How many continents are there?", a: ["7", "5", "6", "8"], correct: 0 },
    { q: "What is the chemical symbol for gold?", a: ["Au", "Ag", "Fe", "Cu"], correct: 0 },
    { q: "What year did World War II end?", a: ["1945", "1944", "1946", "1943"], correct: 0 },
    { q: "Who wrote 'Romeo and Juliet'?", a: ["William Shakespeare", "Charles Dickens", "Jane Austen", "Mark Twain"], correct: 0 },
  ],
  tech: [
    { q: "What does HTML stand for?", a: ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"], correct: 0 },
    { q: "Who is the founder of Microsoft?", a: ["Bill Gates", "Steve Jobs", "Mark Zuckerberg", "Elon Musk"], correct: 0 },
    { q: "What does CPU stand for?", a: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Computer Processing Utility"], correct: 0 },
    { q: "Which programming language is known as the 'language of the web'?", a: ["JavaScript", "Python", "Java", "C++"], correct: 0 },
    { q: "What does AI stand for?", a: ["Artificial Intelligence", "Advanced Integration", "Automated Interface", "Analytical Information"], correct: 0 },
    { q: "Who invented the World Wide Web?", a: ["Tim Berners-Lee", "Bill Gates", "Steve Jobs", "Mark Zuckerberg"], correct: 0 },
    { q: "What year was Google founded?", a: ["1998", "1995", "2000", "1996"], correct: 0 },
    { q: "Which company developed the iPhone?", a: ["Apple", "Samsung", "Google", "Microsoft"], correct: 0 },
  ],
  science: [
    { q: "What is the chemical symbol for water?", a: ["H2O", "CO2", "O2", "H2"], correct: 0 },
    { q: "How many bones are in the human body?", a: ["206", "205", "207", "200"], correct: 0 },
    { q: "What is the speed of light?", a: ["300,000 km/s", "150,000 km/s", "450,000 km/s", "200,000 km/s"], correct: 0 },
    { q: "What is the largest organ in the human body?", a: ["Skin", "Liver", "Heart", "Brain"], correct: 0 },
    { q: "What gas do plants absorb from the atmosphere?", a: ["Carbon Dioxide", "Oxygen", "Nitrogen", "Hydrogen"], correct: 0 },
    { q: "What is the powerhouse of the cell?", a: ["Mitochondria", "Nucleus", "Ribosome", "Chloroplast"], correct: 0 },
    { q: "What is the closest planet to the Sun?", a: ["Mercury", "Venus", "Earth", "Mars"], correct: 0 },
    { q: "What is the boiling point of water?", a: ["100°C", "90°C", "110°C", "120°C"], correct: 0 },
  ],
  history: [
    { q: "Who was the first President of the United States?", a: ["George Washington", "Thomas Jefferson", "Abraham Lincoln", "John Adams"], correct: 0 },
    { q: "In what year did the Titanic sink?", a: ["1912", "1910", "1915", "1920"], correct: 0 },
    { q: "Who discovered America in 1492?", a: ["Christopher Columbus", "Amerigo Vespucci", "Ferdinand Magellan", "Vasco da Gama"], correct: 0 },
    { q: "What year did the Berlin Wall fall?", a: ["1989", "1985", "1990", "1991"], correct: 0 },
    { q: "Who was the first man to walk on the moon?", a: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "John Glenn"], correct: 0 },
    { q: "What empire was ruled by Julius Caesar?", a: ["Roman Empire", "Greek Empire", "Persian Empire", "Ottoman Empire"], correct: 0 },
    { q: "Which war was fought between the North and South in the United States?", a: ["Civil War", "Revolutionary War", "World War I", "World War II"], correct: 0 },
    { q: "Who invented the printing press?", a: ["Johannes Gutenberg", "Leonardo da Vinci", "Galileo Galilei", "Isaac Newton"], correct: 0 },
  ],
  math: [
    { q: "What is 15 × 8?", a: ["120", "115", "125", "130"], correct: 0 },
    { q: "What is the square root of 144?", a: ["12", "11", "13", "14"], correct: 0 },
    { q: "What is 25% of 200?", a: ["50", "45", "55", "60"], correct: 0 },
    { q: "What is the value of Pi (π) to 2 decimal places?", a: ["3.14", "3.15", "3.13", "3.16"], correct: 0 },
    { q: "What is 7³ (7 cubed)?", a: ["343", "49", "147", "243"], correct: 0 },
    { q: "What is the sum of angles in a triangle?", a: ["180°", "360°", "90°", "270°"], correct: 0 },
    { q: "What is 12 × 12?", a: ["144", "124", "134", "154"], correct: 0 },
    { q: "What is 150 ÷ 3?", a: ["50", "45", "55", "60"], correct: 0 },
  ],
  geography: [
    { q: "Which country has the most islands?", a: ["Sweden", "Canada", "Indonesia", "Philippines"], correct: 0 },
    { q: "What is the world's longest river?", a: ["Nile", "Amazon", "Yangtze", "Mississippi"], correct: 1 },
    { q: "Which is the largest desert in the world?", a: ["Antarctica", "Sahara", "Arabian", "Gobi"], correct: 0 },
    { q: "What is the smallest continent?", a: ["Australia", "Europe", "Antarctica", "South America"], correct: 0 },
    { q: "What is the capital of Australia?", a: ["Canberra", "Sydney", "Melbourne", "Perth"], correct: 0 },
    { q: "Which mountain is the highest in the world?", a: ["Mount Everest", "K2", "Kangchenjunga", "Lhotse"], correct: 0 },
    { q: "Which ocean is the largest?", a: ["Pacific", "Atlantic", "Indian", "Arctic"], correct: 0 },
    { q: "What is the capital of Brazil?", a: ["Brasília", "Rio de Janeiro", "São Paulo", "Buenos Aires"], correct: 0 },
  ],
  sports: [
    { q: "How many players are on a soccer team?", a: ["11", "10", "12", "9"], correct: 0 },
    { q: "Which country won the 2022 FIFA World Cup?", a: ["Argentina", "France", "Brazil", "Germany"], correct: 0 },
    { q: "In which sport would you perform a slam dunk?", a: ["Basketball", "Volleyball", "Tennis", "Soccer"], correct: 0 },
    { q: "How many rounds are in a boxing match?", a: ["12", "10", "15", "8"], correct: 0 },
    { q: "Which country has won the most Olympic gold medals?", a: ["United States", "Russia", "China", "Germany"], correct: 0 },
    { q: "In tennis, what is a zero score called?", a: ["Love", "Nil", "Zero", "Null"], correct: 0 },
    { q: "Which sport uses a shuttlecock?", a: ["Badminton", "Tennis", "Squash", "Table Tennis"], correct: 0 },
    { q: "How many players are on a baseball team?", a: ["9", "10", "11", "8"], correct: 0 },
  ],
  movies: [
    { q: "Who directed the movie 'Jurassic Park'?", a: ["Steven Spielberg", "James Cameron", "George Lucas", "Peter Jackson"], correct: 0 },
    { q: "Which actor played Jack in 'Titanic'?", a: ["Leonardo DiCaprio", "Brad Pitt", "Johnny Depp", "Tom Cruise"], correct: 0 },
    { q: "What year was the first 'Star Wars' movie released?", a: ["1977", "1975", "1980", "1979"], correct: 0 },
    { q: "Who played the Joker in 'The Dark Knight'?", a: ["Heath Ledger", "Joaquin Phoenix", "Jack Nicholson", "Jared Leto"], correct: 0 },
    { q: "Which movie features the song 'My Heart Will Go On'?", a: ["Titanic", "The Bodyguard", "Ghost", "Pretty Woman"], correct: 0 },
    { q: "What is the highest-grossing film of all time?", a: ["Avatar", "Avengers: Endgame", "Titanic", "Star Wars: The Force Awakens"], correct: 0 },
    { q: "Who directed the 'Lord of the Rings' trilogy?", a: ["Peter Jackson", "Steven Spielberg", "James Cameron", "Christopher Nolan"], correct: 0 },
    { q: "Which actor played Iron Man in the Marvel Cinematic Universe?", a: ["Robert Downey Jr.", "Chris Evans", "Chris Hemsworth", "Mark Ruffalo"], correct: 0 },
  ],
};

// Helper function to get Open Trivia DB category ID
function getCategoryId(category) {
  const categories = {
    'general': 9,    // General Knowledge
    'science': 17,   // Science & Nature
    'tech': 18,      // Science: Computers
    'history': 23,   // History
    'math': 19,      // Mathematics
    'geography': 22, // Geography
    'sports': 21,    // Sports
    'movies': 11     // Films
  };
  return categories[category] || 9;
}

// Helper function to decode HTML entities
function decodeHTML(html) {
  if (!html) return '';
  // Simple HTML entity decoding without external library
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'");
}

// Helper function to shuffle array
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Fetch questions from Open Trivia DB API
async function fetchFromTriviaAPI(category, amount) {
  try {
    const categoryId = getCategoryId(category);
    const url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&type=multiple`;
    
    const response = await axios.get(url, { timeout: 5000 });
    
    if (response.data.response_code !== 0) {
      throw new Error('API response error');
    }
    
    return response.data.results.map(q => {
      // Combine all answers and shuffle them properly
      const allAnswers = [...q.incorrect_answers, q.correct_answer];
      const shuffledAnswers = shuffleArray(allAnswers);
      
      // Find the new position of the correct answer after shuffling
      const correctIndex = shuffledAnswers.indexOf(q.correct_answer);
      
      return {
        q: decodeHTML(q.question),
        a: shuffledAnswers.map(a => decodeHTML(a)),
        correct: correctIndex
      };
    });
  } catch (error) {
    console.error('Failed to fetch from Trivia API:', error.message);
    throw error;
  }
}

// Generate questions for a game
exports.generateQuestions = async (req, res) => {
  try {
    const { topic, numQuestions } = req.query;
    
    if (!topic || !numQuestions) {
      return res.status(400).json({
        success: false,
        message: 'Topic and number of questions are required',
      });
    }

    const numQuestionsInt = parseInt(numQuestions);
    
    // Try Open Trivia DB API first
    try {
      const apiQuestions = await fetchFromTriviaAPI(topic, numQuestionsInt);
      if (apiQuestions.length >= numQuestionsInt) {
        return res.status(200).json({
          success: true,
          data: {
            questions: apiQuestions,
            topic,
            count: apiQuestions.length,
            source: 'trivia_api'
          },
        });
      }
    } catch (error) {
      console.log('Trivia API failed, falling back to local questions:', error.message);
    }

    // Fallback to local questions
    let pool = [];
    if (topic === 'mixed') {
      // Mix all categories
      Object.values(questionBank).forEach(category => {
        pool = pool.concat(category);
      });
    } else {
      pool = questionBank[topic] || questionBank.general;
    }

    // Shuffle and select
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, numQuestionsInt);

    res.status(200).json({
      success: true,
      data: {
        questions: selected,
        topic,
        count: selected.length,
        source: 'local'
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};