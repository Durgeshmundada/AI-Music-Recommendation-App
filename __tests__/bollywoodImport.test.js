const { chooseTrack } = require('../scripts/importBollywood');

const wanted = ['Swag Se Swagat', 'Vishal Dadlani', 'Tiger Zinda Hai', 'party'];
const original = { kind: 'song', trackName: 'Swag Se Swagat', artistName: 'Vishal Dadlani & Neha Bhasin', collectionName: 'Tiger Zinda Hai (Original Motion Picture Soundtrack)', previewUrl: 'https://example.test/preview', trackViewUrl: 'https://music.apple.com/in/song/1', trackTimeMillis: 230000 };

test('matches common title and artist spelling differences', () => {
  const classic = { ...original, trackName: 'Gulabi Ankhen', artistName: 'Mohd. Rafi', collectionName: 'The Train (Original Soundtrack)' };
  expect(chooseTrack([classic], ['Gulabi Aankhen', 'Mohammed Rafi', 'The Train'])).toBe(classic);
  const ajabSi = { ...original, trackName: 'Ajab Si', artistName: 'KK & Vishal & Shekhar', collectionName: 'Om Shanti Om' };
  expect(chooseTrack([ajabSi], ['Aankhon Mein Teri', 'KK', 'Om Shanti Om'])).toBe(ajabSi);
});

test('selects original Hindi recording instead of alternate-language version or cover', () => {
  const arabic = { ...original, trackName: 'Swag Se Swagat (From "Tiger Zinda Hai") [Arabic Version]' };
  const cover = { ...original, artistName: 'A Cover Artist' };
  const remix = { ...original, trackName: 'Swag Se Swagat (Remix)' };
  expect(chooseTrack([arabic, cover, remix, original], wanted)).toBe(original);
});

test('does not silently substitute a different artist or song', () => {
  expect(chooseTrack([{ ...original, trackName: 'Another song' }], wanted)).toBeUndefined();
  expect(chooseTrack([{ ...original, artistName: 'Another artist' }], wanted)).toBeUndefined();
});

test('prefers soundtrack album and accepts From-title formatting', () => {
  const compilation = { ...original, collectionName: 'Greatest Hits' };
  const soundtrack = { ...original, trackName: 'Swag Se Swagat (From "Tiger Zinda Hai")' };
  expect(chooseTrack([compilation, soundtrack], wanted)).toBe(soundtrack);
});
