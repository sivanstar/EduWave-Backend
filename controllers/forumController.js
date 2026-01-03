const ForumPost = require('../models/Forum');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');

// Helper function to check if user is premium (validates trial expiration)
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

// Get all posts (with optional category filter)
exports.getPosts = async (req, res) => {
  try {
    const { category, limit = 50, skip = 0 } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    // Add pagination to limit data transfer and improve performance
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 posts per request
    const skipNum = parseInt(skip) || 0;

    const posts = await ForumPost.find(query)
      .populate('author', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .lean(); // Use lean() for better performance

    // Get total count for pagination (only if needed)
    const total = skipNum === 0 ? await ForumPost.countDocuments(query) : null;

    res.status(200).json({
      success: true,
      count: posts.length,
      data: posts,
      ...(total !== null && { total, hasMore: skipNum + posts.length < total })
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single post by ID
exports.getPost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'fullName email')
      .populate('replies.author', 'fullName email')
      .lean(); // Use lean() for better performance

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create a new post
exports.createPost = async (req, res) => {
  try {
    const { title, content, category, image } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and category are required',
      });
    }

    // Check if user is premium (free users can only reply)
    const user = await User.findById(req.user._id);
    const settings = await AdminSettings.getSettings();
    
    // Use proper premium check that validates trial expiration
    const isPremium = await checkUserPremium(user, settings);
    
    if (!isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Free users can only reply to posts. Upgrade to Premium to create posts.',
      });
    }

    const post = await ForumPost.create({
      title,
      content,
      image: image || null,
      author: req.user._id,
      authorName: req.user.fullName,
      category,
    });

    // Update user stats and activity
    if (!user.forumStats) {
      user.forumStats = { posts: 0, helpfulVotes: 0 };
    }
    user.forumStats.posts = (user.forumStats.posts || 0) + 1;
    user.lastPostCreated = {
      postId: post._id.toString(),
      title: post.title,
      createdAt: post.createdAt,
    };
    await user.save();
    
    // Check first step badge
    const badgeService = require('../utils/badgeService');
    await badgeService.checkFirstStep(user._id);

    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Update a post
exports.updatePost = async (req, res) => {
  try {
    const { title, content, image } = req.body;
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post',
      });
    }

    if (title) post.title = title;
    if (content) post.content = content;
    if (image !== undefined) post.image = image;
    post.edited = true;
    post.editedAt = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a post
exports.deletePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post',
      });
    }

    await post.deleteOne();

    // Update user stats
    const user = await User.findById(req.user._id);
    if (user.forumStats) {
      user.forumStats.posts = Math.max(0, (user.forumStats.posts || 0) - 1);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Add a reply to a post
exports.addReply = async (req, res) => {
  try {
    const { content, image } = req.body;
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Reply content is required',
      });
    }

    post.replies.push({
      content,
      image: image || null,
      author: req.user._id,
      authorName: req.user.fullName,
    });

    await post.save();

    // Award 1 point to post author for each reply received
    if (post.author.toString() !== req.user._id.toString()) {
      const postAuthor = await User.findById(post.author);
      if (postAuthor) {
        postAuthor.points = Math.round((postAuthor.points || 0) + 1);
        await postAuthor.save();
        
        // Check trending badge (100 replies)
        const badgeService = require('../utils/badgeService');
        await badgeService.checkTrending(postAuthor._id);
        await badgeService.checkPointBadges(postAuthor._id);
        
        // Notify post author about the new reply
        const { createNotificationForUser } = require('./notificationController');
        await createNotificationForUser(
          postAuthor._id,
          'New Reply to Your Post',
          `${req.user.fullName} replied to your post: "${post.title}"`,
          'info',
          `/forum.html?post=${post._id}`
        );
      }
    }

    res.status(201).json({
      success: true,
      data: post.replies[post.replies.length - 1],
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete a reply
exports.deleteReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const reply = post.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found',
      });
    }

    if (reply.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this reply',
      });
    }

    reply.deleteOne();
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Reply deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Vote helpful on a post
exports.votePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const userId = req.user._id;
    const hasVoted = post.votedBy.some(id => id.toString() === userId.toString());

    if (hasVoted) {
      // Remove vote
      post.votedBy = post.votedBy.filter(id => id.toString() !== userId.toString());
      post.helpfulVotes = Math.max(0, post.helpfulVotes - 1);

      // Update author's helpful votes and remove 1 point
      const author = await User.findById(post.author);
      if (author && author.forumStats) {
        author.forumStats.helpfulVotes = Math.max(0, (author.forumStats.helpfulVotes || 0) - 1);
        author.points = Math.max(0, Math.round((author.points || 0) - 1));
        await author.save();
      }
    } else {
      // Add vote
      post.votedBy.push(userId);
      post.helpfulVotes += 1;

      // Update author's helpful votes and award 1 point per like
      const author = await User.findById(post.author);
      if (author) {
        if (!author.forumStats) {
          author.forumStats = { posts: 0, helpfulVotes: 0 };
        }
        author.forumStats.helpfulVotes = (author.forumStats.helpfulVotes || 0) + 1;
        author.points = Math.round((author.points || 0) + 1);
        await author.save();
        
        // Check wave influencer badge (100 likes)
        const badgeService = require('../utils/badgeService');
        await badgeService.checkWaveInfluencer(author._id);
        await badgeService.checkPointBadges(author._id);
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      data: {
        helpfulVotes: post.helpfulVotes,
        hasVoted: !hasVoted,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Vote helpful on a reply
exports.voteReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const reply = post.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found',
      });
    }

    const userId = req.user._id;
    const hasVoted = reply.votedBy.some(id => id.toString() === userId.toString());

    if (hasVoted) {
      reply.votedBy = reply.votedBy.filter(id => id.toString() !== userId.toString());
      reply.helpfulVotes = Math.max(0, reply.helpfulVotes - 1);

      const replyAuthor = await User.findById(reply.author);
      if (replyAuthor && replyAuthor.forumStats) {
        replyAuthor.forumStats.helpfulVotes = Math.max(0, (replyAuthor.forumStats.helpfulVotes || 0) - 1);
        replyAuthor.points = Math.max(0, Math.round((replyAuthor.points || 0) - 1));
        await replyAuthor.save();
      }
    } else {
      reply.votedBy.push(userId);
      reply.helpfulVotes += 1;

      const replyAuthor = await User.findById(reply.author);
      if (replyAuthor) {
        if (!replyAuthor.forumStats) {
          replyAuthor.forumStats = { posts: 0, helpfulVotes: 0 };
        }
        replyAuthor.forumStats.helpfulVotes = (replyAuthor.forumStats.helpfulVotes || 0) + 1;
        replyAuthor.points = Math.round((replyAuthor.points || 0) + 1);
        await replyAuthor.save();
      }
    }

    await post.save();

    res.status(200).json({
      success: true,
      data: {
        helpfulVotes: reply.helpfulVotes,
        hasVoted: !hasVoted,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Report a post
exports.reportPost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (post.author.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own post',
      });
    }

    post.flagged = true;
    post.flaggedBy = req.user._id;
    post.flaggedAt = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      message: 'Post reported successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Report a reply
exports.reportReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    const reply = post.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found',
      });
    }

    if (reply.author.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own reply',
      });
    }

    reply.reported = true;
    reply.reportedBy = req.user._id;
    reply.reportedAt = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      message: 'Reply reported successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get forum statistics
exports.getStats = async (req, res) => {
  try {
    const totalPosts = await ForumPost.countDocuments();
    const totalHelpful = await ForumPost.aggregate([
      { $group: { _id: null, total: { $sum: '$helpfulVotes' } } },
    ]);

    const categoryStats = await ForumPost.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    // Count unique users who have posted
    const totalMembers = await ForumPost.distinct('author').then(authors => authors.length);

    const stats = {
      totalMembers,
      totalPosts,
      totalHelpful: totalHelpful[0]?.total || 0,
      categories: {
        general: 0,
        qa: 0,
        career: 0,
      },
    };

    categoryStats.forEach(stat => {
      if (stats.categories.hasOwnProperty(stat._id)) {
        stats.categories[stat._id] = stat.count;
      }
    });

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get top contributors
exports.getContributors = async (req, res) => {
  try {
    const contributors = await User.find({
      'forumStats.helpfulVotes': { $gt: 0 },
    })
      .select('fullName forumStats')
      .sort({ 'forumStats.helpfulVotes': -1 })
      .limit(20)
      .lean();

    const formatted = contributors.map(user => ({
      name: user.fullName,
      helpfulVotes: user.forumStats?.helpfulVotes || 0,
      posts: user.forumStats?.posts || 0,
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

