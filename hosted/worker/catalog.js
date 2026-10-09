import manifest from '../data/bollywood-youtube.json';
import { rows } from '../db/index.js';

export const catalog = manifest.map(({ legacyItunesId, videoTitle, verifiedAt, ...song }) => ({
  ...song, _id: `yt_${song.youtubeVideoId}`, createdAt: verifiedAt,
}));

export async function songs(env) {
  const [uploads, removed] = await Promise.all([
    rows(env, "SELECT song_json FROM uploads WHERE state = 'ready' ORDER BY created_at DESC LIMIT 10000"),
    rows(env, 'SELECT song_id FROM removed_catalog'),
  ]);
  const hidden = new Set(removed.map(row => row.song_id));
  return [...catalog.filter(song => !hidden.has(song._id)), ...uploads.map(row => JSON.parse(row.song_json))];
}

export function recommendations(items, seed, count) {
  return items.filter(song => song._id !== seed?._id).map(song => {
    const sameArtist = seed && song.artist.toLowerCase().split(/[,;&]/).some(artist => artist.trim().length > 2 && seed.artist.toLowerCase().includes(artist.trim()));
    const sameMood = seed?.mood && song.mood === seed.mood;
    const sameGenre = seed?.genre && song.genre === seed.genre;
    const score = (sameArtist ? 45 : 0) + (sameMood ? 35 : 0) + (sameGenre ? 15 : 0);
    return { _id: `mix_${song._id}`, recommendedSong: song, strength: Math.max(15, score),
      reasons: [sameArtist ? 'Another song by an artist you selected' : sameMood ? `More ${song.mood} music` : sameGenre ? 'More from this genre' : 'From your music library'], score };
  }).sort((a, b) => b.score - a.score || (b.recommendedSong.featuredRank || 0) - (a.recommendedSong.featuredRank || 0)).slice(0, count);
}
