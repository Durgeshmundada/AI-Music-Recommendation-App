import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../state/PlayerContext.jsx';
import { loadYouTubeAPI, youtubeError } from '../utils/youtube.js';
import { youtubeUrl } from '../utils/audio.js';

// Keep the official player visible, including its controls, branding and ads.
export default function YouTubePlayer({ track, volume, onProgress }) {
  const host = useRef(null);
  const callbacks = useRef({});
  const { youtubeRef, setPlayerError, setIsPlaying, onEnded } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  callbacks.current = { volume, onProgress, onEnded, setPlayerError, setIsPlaying };

  useEffect(() => {
    let disposed = false;
    let player;
    let timer;
    let readyTimeout;
    setLoading(true);
    setPlayerError('');
    loadYouTubeAPI().then((YT) => {
      if (disposed) return;
      const frame = document.createElement('iframe');
      frame.id = 'official-youtube-player';
      frame.title = `Full song: ${track.name}`;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.src = `https://www.youtube.com/embed/${track.youtubeVideoId}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`;
      host.current.replaceChildren(frame);
      readyTimeout = setTimeout(() => {
        if (!disposed) { setLoading(false); setPlayerError('YouTube is taking too long to connect. Reload the video or open it on YouTube.'); }
      }, 20000);
      player = new YT.Player(frame, { events: {
        onReady: () => {
          if (disposed) return;
          clearTimeout(readyTimeout);
          youtubeRef.current = player;
          setLoading(false);
          player.setVolume(callbacks.current.volume * 100);
          player.playVideo();
          timer = setInterval(() => callbacks.current.onProgress(player.getCurrentTime() || 0, player.getDuration() || 0), 500);
        },
        onStateChange: ({ data }) => {
          if (disposed) return;
          callbacks.current.setIsPlaying(data === YT.PlayerState.PLAYING);
          if (data === YT.PlayerState.PLAYING) callbacks.current.setPlayerError('');
          if (data === YT.PlayerState.ENDED) callbacks.current.onEnded();
        },
        onAutoplayBlocked: () => {
          if (!disposed) callbacks.current.setPlayerError('Press Play in the YouTube video to start this song.');
        },
        onError: ({ data }) => {
          if (disposed) return;
          clearTimeout(readyTimeout);
          setLoading(false);
          callbacks.current.setIsPlaying(false);
          callbacks.current.setPlayerError(youtubeError(data));
        },
      } });
    }).catch((error) => {
      if (!disposed) { setLoading(false); setPlayerError(error.message); }
    });
    const pauseWhenHidden = () => { if (document.hidden) player?.pauseVideo?.(); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(readyTimeout);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      if (youtubeRef.current === player) youtubeRef.current = null;
      player?.destroy();
      host.current?.replaceChildren();
    };
  }, [track.youtubeVideoId, retry, youtubeRef]);

  useEffect(() => { youtubeRef.current?.setVolume(volume * 100); }, [volume, youtubeRef]);

  return <section className="youtube-panel" aria-label="Official full song video">
    <div className="youtube-frame" ref={host} />
    <div className="youtube-caption">
      <span role="status">{loading ? 'Connecting to YouTube…' : track.youtubeChannel || 'Official YouTube video'}</span>
      <a href={youtubeUrl(track)} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
      <button type="button" className="youtube-retry" onClick={() => setRetry((value) => value + 1)}>Reload video</button>
    </div>
  </section>;
}
