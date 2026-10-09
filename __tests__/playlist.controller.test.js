jest.mock('../models/Playlist', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const Playlist = require('../models/Playlist');
const playlistController = require('../controllers/playlistController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('playlistController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('addSongToPlaylist returns 409 when song already exists', async () => {
    const playlistDoc = {
      owner: { toString: () => 'u1' },
      songs: [{ song: { toString: () => 's1' } }],
      save: jest.fn(),
    };

    Playlist.findById.mockResolvedValue(playlistDoc);

    const req = {
      user: { _id: 'u1' },
      params: { playlistId: 'p1' },
      body: { songId: 's1' },
    };
    const res = makeRes();

    await playlistController.addSongToPlaylist(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Song already exists in this playlist' })
    );
    expect(playlistDoc.save).not.toHaveBeenCalled();
  });

  test('reorderPlaylistSongs keeps unspecified songs at the end', async () => {
    const s1 = { song: { toString: () => 's1' } };
    const s2 = { song: { toString: () => 's2' } };
    const s3 = { song: { toString: () => 's3' } };

    const playlistDoc = {
      owner: { toString: () => 'u1' },
      songs: [s1, s2, s3],
      save: jest.fn().mockResolvedValue(true),
    };

    Playlist.findById.mockResolvedValue(playlistDoc);

    const req = {
      user: { _id: 'u1' },
      params: { playlistId: 'p1' },
      body: { orderedSongIds: ['s3', 's1'] },
    };
    const res = makeRes();

    await playlistController.reorderPlaylistSongs(req, res);

    expect(playlistDoc.songs).toEqual([s3, s1, s2]);
    expect(playlistDoc.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Playlist order updated' })
    );
  });
});
