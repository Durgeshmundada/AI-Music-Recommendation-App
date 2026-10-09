import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../state/AuthContext.jsx';
import { usePlayer } from '../../state/PlayerContext.jsx';
import { audioSource, isFullTrack, isYouTubeTrack } from '../../utils/audio.js';
import YouTubePlayer from '../YouTubePlayer.jsx';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function AppShell({
  children,
  activeSection = 'discover',
  onNavigate = () => {},
}) {
  const { user, logout } = useAuth();
  const {
    audioRef,
    seekTo,
    currentTrack,
    isPlaying,
    playerError,
    togglePlay,
    playNext,
    playPrevious,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeatMode,
    queue,
    history,
    jumpToQueueIndex,
    removeFromQueueIndex,
    clearQueue,
    setPlayerError,
    setIsPlaying,
    onEnded,
  } = usePlayer();

  const [toasts, setToasts] = useState([]);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const isVideo = isYouTubeTrack(currentTrack);

  const seekMax = useMemo(
    () => (durationSec > 0 ? durationSec : 0),
    [durationSec]
  );

  useEffect(() => {
    const onToast = (event) => {
      const detail = event.detail || {};
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const toast = {
        id,
        message: detail.message || 'Done',
        type: detail.type || 'info',
      };
      setToasts((prev) => [...prev, toast].slice(-4));
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    };

    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai-music-volume');
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
          setVolume(parsed);
          setIsMuted(parsed === 0);
        }
      }
    } catch {
      // ignore local storage failures
    }
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [audioRef, isMuted, volume, currentTrack?._id]);

  useEffect(() => {
    setCurrentSec(0);
    setDurationSec(0);
  }, [currentTrack?._id, currentTrack?.audioUrl, currentTrack?.previewUrl, currentTrack?.youtubeVideoId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const targetTag = event.target?.tagName;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(targetTag) || event.target?.isContentEditable;

      if (isTyping) return;

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        playNext();
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        playPrevious();
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        cycleRepeatMode();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycleRepeatMode, playNext, playPrevious, togglePlay]);

  const commitSeek = (nextSec) => {
    const bounded = Math.min(Math.max(nextSec, 0), seekMax || 0);
    seekTo(bounded);
    setCurrentSec(bounded);
  };

  const onSeekChange = (event) => {
    const next = Number(event.target.value);
    setCurrentSec(next);
    if (!isSeeking) {
      commitSeek(next);
    }
  };

  const onSeekCommit = (event) => {
    const next = Number(event.target.value);
    commitSeek(next);
    setIsSeeking(false);
  };

  const onVolumeChange = (event) => {
    const next = Number(event.target.value);
    setVolume(next);
    setIsMuted(next === 0);
    try {
      localStorage.setItem('ai-music-volume', String(next));
    } catch {
      // ignore local storage failures
    }
  };

  const repeatLabel = repeatMode === 'off' ? 'Repeat Off' : repeatMode === 'all' ? 'Repeat All' : 'Repeat One';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-orb" />
          <div>
            <div className="logo-title">AI Music Studio</div>
            <div className="logo-subtitle">Personal Spotify-like brain</div>
          </div>
        </div>
        <nav className="nav-section">
          <div className="nav-label">Library</div>
          <button className={`nav-item ${activeSection === 'library' ? 'active' : ''}`} type="button" onClick={() => onNavigate('library')}>Music library & uploads</button>
          <button
            className={`nav-item ${activeSection === 'discover' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('discover')}
          >
            Home
          </button>
          <button
            className={`nav-item ${activeSection === 'playlists' ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate('playlists')}
          >
            Playlists
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="avatar-circle">{user?.name?.[0]?.toUpperCase()}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} type="button">
            Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="main-header">
          <div>
            <h1>Good to see you, {user?.name?.split(' ')[0]}</h1>
            <p className="header-subtitle">
              Search faster, play smarter mixes, and keep a clean personal music workspace.
            </p>
            <p className="header-hint">Shortcuts: Space play/pause, N next, P previous, R repeat</p>
          </div>
        </header>
        <section className="main-content">{children}</section>
      </main>
      <footer className={`player-bar ${isVideo ? 'with-video' : ''}`}>
        {currentTrack ? (
          <>
            {isVideo && <YouTubePlayer track={currentTrack} volume={isMuted ? 0 : volume} onProgress={(seconds, duration) => {
              setDurationSec(duration);
              if (!isSeeking) setCurrentSec(seconds);
            }} />}
            <div className="player-meta">
              <img
                src={
                  currentTrack.imageUrl ||
                  'https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&w=200'
                }
                alt={currentTrack.name}
                className="player-cover"
              />
              <div>
                <div className="player-title">{currentTrack.name}</div>
                <div className="player-artist">{currentTrack.artist}</div>
                <span className="track-kind">{isVideo ? 'Full song · YouTube' : isFullTrack(currentTrack) ? 'Full track' : 'Preview only'}</span>
                {!isFullTrack(currentTrack) && currentTrack.externalUrl && <div className="player-credit">Preview provided courtesy of iTunes.<br /><a href={currentTrack.externalUrl} target="_blank" rel="noreferrer">Listen on Apple Music ↗</a></div>}
                {currentTrack.licenseUrl && <div className="player-credit"><a href={currentTrack.externalUrl} target="_blank" rel="noreferrer">{currentTrack.artist} / Incompetech</a> · <a href={currentTrack.licenseUrl} target="_blank" rel="noreferrer">{currentTrack.license}</a></div>}
              </div>
            </div>
            <div className="player-controls">
              <div className="queue-badge">Queue: {queue.length}</div>
              <button className="player-btn" onClick={playPrevious} title="Previous" type="button">
                Prev
              </button>
              <button className="player-btn" onClick={playNext} title="Next" type="button">
                Next
              </button>
              <button className="player-btn primary" onClick={togglePlay} type="button">
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                className={`player-btn ${repeatMode !== 'off' ? 'active' : ''}`}
                onClick={cycleRepeatMode}
                disabled={!isFullTrack(currentTrack)}
                title={repeatLabel}
                type="button"
              >
                {repeatMode === 'off' ? 'Repeat' : repeatMode === 'all' ? 'Repeat All' : 'Repeat One'}
              </button>
              <button
                className={`player-btn ${shuffleEnabled ? 'active' : ''}`}
                onClick={toggleShuffle}
                title="Shuffle"
                type="button"
              >
                Shuffle
              </button>
              <button className="player-btn" type="button" onClick={() => setQueueOpen((prev) => !prev)}>
                {queueOpen ? 'Hide Queue' : 'Show Queue'}
              </button>
            </div>
            <div className="player-seek-wrap">
              <span className="time-code">{formatTime(currentSec)}</span>
              <input
                className="seek-slider"
                type="range"
                min="0"
                max={seekMax}
                step="0.1"
                value={Math.min(currentSec, seekMax || 0)}
                onMouseDown={() => setIsSeeking(true)}
                onTouchStart={() => setIsSeeking(true)}
                onChange={onSeekChange}
                onMouseUp={onSeekCommit}
                onTouchEnd={onSeekCommit}
                onKeyUp={onSeekCommit}
                disabled={seekMax <= 0}
                aria-label="Seek track"
              />
              <span className="time-code">{formatTime(durationSec)}</span>
            </div>
            <div className="player-volume-wrap">
              <button
                className="player-btn"
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
              <input
                className="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={onVolumeChange}
                aria-label="Volume"
              />
            </div>
            {playerError && <div className="player-error" role="alert">{playerError}</div>}
            {queueOpen && (
              <div className="queue-drawer">
                <div className="queue-drawer-header">
                  <strong>Up Next ({queue.length})</strong>
                  <div className="queue-drawer-actions">
                    <span className="muted">History: {history.length}</span>
                    <button className="secondary-btn" type="button" onClick={clearQueue}>Clear</button>
                  </div>
                </div>
                {!queue.length && <p className="muted">Queue is empty.</p>}
                {queue.map((track, index) => (
                  <div key={`${track._id || track.name}-${index}`} className="queue-row">
                    <button className="queue-track-btn" type="button" onClick={() => jumpToQueueIndex(index)}>
                      <span className="song-title">{track.name}</span>
                      <span className="song-artist">{track.artist}</span>
                    </button>
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => removeFromQueueIndex(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!isVideo && <audio
              ref={audioRef}
              src={audioSource(currentTrack)}
              preload="metadata"
              onPlay={() => { setPlayerError(''); setIsPlaying(true); }}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={() => setDurationSec(audioRef.current?.duration || 0)}
              onDurationChange={() => setDurationSec(audioRef.current?.duration || 0)}
              onTimeUpdate={() => {
                if (!isSeeking) {
                  setCurrentSec(audioRef.current?.currentTime || 0);
                }
              }}
              onError={() => { setIsPlaying(false); setPlayerError('This recording could not be loaded. Try another track or check your connection.'); }}
              onEnded={onEnded}
            />}
          </>
        ) : (
          <div className="player-empty">Pick a song to start your AI-powered session.</div>
        )}
      </footer>
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
