const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  addReply,
  deleteReply,
  votePost,
  voteReply,
  reportPost,
  reportReply,
  getStats,
  getContributors,
} = require('../controllers/forumController');

// Public routes
router.get('/stats', getStats);
router.get('/contributors', getContributors);
router.get('/', getPosts);
router.get('/:id', getPost);

// Protected routes
router.use(protect);

router.post('/', createPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);
router.post('/:id/replies', addReply);
router.delete('/:id/replies/:replyId', deleteReply);
router.post('/:id/vote', votePost);
router.post('/:id/replies/:replyId/vote', voteReply);
router.post('/:id/report', reportPost);
router.post('/:id/replies/:replyId/report', reportReply);

module.exports = router;

