const { cosineSimilarity } = require('../utils/recommendationEngine');

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const song = {
      energy: 0.7,
      valence: 0.4,
      danceability: 0.8,
      acousticness: 0.1,
      instrumentalness: 0.0,
    };

    expect(cosineSimilarity(song, song)).toBeCloseTo(1, 6);
  });

  test('returns 0 when one song has all-zero features', () => {
    const songA = {
      energy: 0,
      valence: 0,
      danceability: 0,
      acousticness: 0,
      instrumentalness: 0,
    };

    const songB = {
      energy: 0.8,
      valence: 0.5,
      danceability: 0.6,
      acousticness: 0.2,
      instrumentalness: 0.1,
    };

    expect(cosineSimilarity(songA, songB)).toBe(0);
  });
});
