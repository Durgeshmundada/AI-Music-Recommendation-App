const express = require('express');
const {
  createPlaylist,
  getUserPlaylists,
  addSongToPlaylist,
  updatePlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
  deletePlaylist
} = require('../controllers/playlistController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, createPlaylist);
router.get('/', authenticate, getUserPlaylists);
router.patch('/:id', authenticate, updatePlaylist);
router.post('/:playlistId/songs', authenticate, addSongToPlaylist);
router.delete('/:playlistId/songs/:songId', authenticate, removeSongFromPlaylist);
router.patch('/:playlistId/reorder', authenticate, reorderPlaylistSongs);
router.delete('/:id', authenticate, deletePlaylist);

module.exports = router;
