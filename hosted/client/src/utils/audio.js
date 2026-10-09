import { apiClient } from './apiClient.js';

export function audioSource(track) {
  if (isYouTubeTrack(track)) return undefined;
  const value = track?.audioUrl || track?.previewUrl;
  if (!value) return undefined;
  try {
    const api = new URL(apiClient.defaults.baseURL, window.location.origin);
    const url = new URL(value, api.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function isYouTubeTrack(track) {
  return /^[A-Za-z0-9_-]{11}$/.test(track?.youtubeVideoId || '');
}

export function isFullTrack(track) {
  return isYouTubeTrack(track) || Boolean(track?.audioUrl);
}

export function isPlayable(track) {
  return isYouTubeTrack(track) || Boolean(audioSource(track));
}

export function youtubeUrl(track) {
  return isYouTubeTrack(track) ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}` : undefined;
}

export function trackDuration(milliseconds) {
  const seconds = Math.floor((milliseconds || 0) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
