const express = require('express');
const {
  getRecommendations,
  getSmartRecommendations,
  getForYouRecommendations,
  getMoodPlaylist,
  trackRecommendation,
} = require('../controllers/recommendationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Existing recommendations stored for a user/song
router.get('/', authenticate, getRecommendations);

// Generate fresh content-based recommendations for a song
router.get('/smart', authenticate, getSmartRecommendations);

// Personalized recommendations from recent listening
router.get('/for-you', authenticate, getForYouRecommendations);

// Generate a mood-based playlist (e.g., happy, sad, energetic)
router.get('/mood', authenticate, getMoodPlaylist);

// Track user interaction with a recommendation
router.post('/:recommendationId/track', authenticate, trackRecommendation);

module.exports = router;
