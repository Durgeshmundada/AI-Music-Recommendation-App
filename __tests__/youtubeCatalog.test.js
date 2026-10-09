const { validateCatalog, songDocument } = require('../scripts/importYouTubeCatalog');
const catalog = require('../data/bollywood-youtube.json');

describe('official full-song catalog', () => {
  test('all 72 songs have unique official video sources and no preview fallback', () => {
    expect(catalog).toHaveLength(72);
    expect(() => validateCatalog(catalog)).not.toThrow();
  });
  test.each([
    { duration: 30000 }, { youtubeVideoId: '<script>' }, { youtubeChannelId: 'unverified' },
    { previewUrl: 'https://example.com/preview.m4a' }, { audioUrl: 'https://example.com/rip.mp3' },
  ])('rejects incomplete or unverified sources: %j', (override) => {
    expect(() => validateCatalog([{ ...catalog[0], ...override }])).toThrow();
  });
  test('rejects duplicate entries and omits migration-only metadata from songs', () => {
    expect(() => validateCatalog([catalog[0], catalog[0]])).toThrow('Duplicate');
    expect(songDocument(catalog[0])).not.toHaveProperty('legacyItunesId');
    expect(songDocument(catalog[0])).toHaveProperty('youtubeVideoId', catalog[0].youtubeVideoId);
  });
});
