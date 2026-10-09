const express = require('express');
const {
  getAllSongs,
  getSongById,
  getSongFacets,
  searchSongs,
  getRecentSongs,
  getContinueListeningSongs,
  addSong,
  playSong,
} = require('../controllers/songController');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { uploadSong, streamSong, deleteSong } = require('../controllers/audioController');
const audioUpload = require('../middleware/audioUpload');
const rateLimit = require('express-rate-limit');

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ message: 'Invalid song ID.' });
  next();
});
router.post('/upload', authenticate, rateLimit({ windowMs: 60 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }), audioUpload, uploadSong);
router.get('/:id/audio', streamSong);
router.delete('/:id', authenticate, deleteSong);

router.get('/', optionalAuth, getAllSongs);
router.get('/facets', getSongFacets);
router.get('/search', searchSongs);
router.get('/recent', authenticate, getRecentSongs);
router.get('/continue', authenticate, getContinueListeningSongs);
router.get('/:id', getSongById);
router.post('/', authenticate, authorize('admin'), addSong);
router.post('/:id/play', authenticate, playSong);

module.exports = router;
