import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { audioSource, isFullTrack, isPlayable, isYouTubeTrack } from '../utils/audio.js';
import { useAuth } from './AuthContext.jsx';

const PlayerContext = createContext(null);

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const PlayerProvider = ({ children }) => {
  const { user } = useAuth();
  const audioRef = useRef(null);
  const youtubeRef = useRef(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [queueSeed, setQueueSeed] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // off | all | one

  const attemptPlay = () => {
    if (isYouTubeTrack(currentTrack)) { youtubeRef.current?.playVideo(); return; }
    if (!audioRef.current) return;

    const playPromise = audioRef.current.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setPlayerError('');
          setIsPlaying(true);
        })
        .catch((error) => {
          if (error.name === 'AbortError') return;
          setIsPlaying(false);
          setPlayerError('Unable to play this recording. Press Play to retry or choose another track.');
        });
    } else {
      setIsPlaying(true);
      setPlayerError('');
    }
  };

  const playTrack = (track, { replaceQueue = false, queueTracks = [] } = {}) => {
    if (!track) return;
    if (!isPlayable(track)) { setPlayerError('No recording is available for this track.'); return; }

    if (currentTrack && (currentTrack._id !== track._id || audioSource(currentTrack) !== audioSource(track))) {
      setHistory((prev) => [currentTrack, ...prev].slice(0, 100));
    }
    setCurrentTrack(track);

    if (replaceQueue || !isFullTrack(track)) {
      const normalized = isFullTrack(track) ? queueTracks.filter((item) => isFullTrack(item) && isPlayable(item)) : [];
      const nextQueue = shuffleEnabled ? shuffleArray(normalized) : normalized;
      setQueue(nextQueue);
      setQueueSeed(isFullTrack(track) ? [track, ...normalized] : []);
    }

    if (currentTrack?._id === track._id) attemptPlay();
  };

  const togglePlay = () => {
    if (isYouTubeTrack(currentTrack)) {
      if (isPlaying) youtubeRef.current?.pauseVideo();
      else attemptPlay();
      return;
    }
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      attemptPlay();
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      setPlayerError('');
    }
  };

  const playNext = () => {
    if (queue.length) {
      const [next, ...rest] = queue;
      if (currentTrack) {
        setHistory((prev) => [currentTrack, ...prev].slice(0, 100));
      }
      setCurrentTrack(next);
      setQueue(rest);
      return;
    }

    if (repeatMode === 'all' && queueSeed.length) {
      const [first, ...rest] = queueSeed;
      const loopQueue = shuffleEnabled ? shuffleArray(rest) : rest;
      setCurrentTrack(first);
      setQueue(loopQueue);
      setHistory([]);
      if (first._id === currentTrack?._id) { seekTo(0); attemptPlay(); }
      return;
    }

    audioRef.current?.pause();
    youtubeRef.current?.pauseVideo();
    setIsPlaying(false);
  };

  const playPrevious = () => {
    if (history.length) {
      const [previous, ...rest] = history;
      setHistory(rest);
      setQueue((prevQueue) => (currentTrack ? [currentTrack, ...prevQueue] : prevQueue));
      setCurrentTrack(previous);
      return;
    }

    if (isYouTubeTrack(currentTrack) || (audioRef.current && audioRef.current.currentTime > 3)) {
      seekTo(0);
      attemptPlay();
    }
  };

  const toggleShuffle = () => {
    setShuffleEnabled(!shuffleEnabled);
    if (!shuffleEnabled && queue.length > 1) setQueue(shuffleArray(queue));
  };

  const cycleRepeatMode = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const jumpToQueueIndex = (index) => {
    if (index < 0 || index >= queue.length) return;
    if (currentTrack) setHistory((prev) => [currentTrack, ...prev].slice(0, 100));
    setCurrentTrack(queue[index]);
    setQueue(queue.filter((_, itemIndex) => itemIndex !== index));
  };

  const removeFromQueueIndex = (index) => {
    const removed = queue[index];
    setQueue((prevQueue) => prevQueue.filter((_, idx) => idx !== index));
    if (removed) setQueueSeed((items) => items.filter((track) => track._id !== removed._id));
  };

  const clearQueue = () => {
    setQueue([]);
    setQueueSeed(currentTrack ? [currentTrack] : []);
  };

  const removeTrack = (id) => {
    const keep = (track) => String(track._id) !== String(id);
    setQueue((items) => items.filter(keep));
    setQueueSeed((items) => items.filter(keep));
    setHistory((items) => items.filter(keep));
    if (String(currentTrack?._id) === String(id)) {
      audioRef.current?.pause(); setCurrentTrack(null); setIsPlaying(false); setPlayerError('');
    }
  };

  const onEnded = () => {
    if (!isFullTrack(currentTrack)) { setIsPlaying(false); return; }
    if (repeatMode === 'one') { seekTo(0); attemptPlay(); }
    else playNext();
  };

  const seekTo = (seconds) => {
    if (isYouTubeTrack(currentTrack)) youtubeRef.current?.seekTo(seconds, true);
    else if (audioRef.current) audioRef.current.currentTime = seconds;
  };

  useEffect(() => {
    setPlayerError('');
    setIsPlaying(false);
    if (currentTrack && !isYouTubeTrack(currentTrack)) attemptPlay();
  }, [currentTrack?._id, currentTrack?.audioUrl, currentTrack?.previewUrl, currentTrack?.youtubeVideoId]);

  useEffect(() => {
    if (!user) {
      audioRef.current?.pause(); setCurrentTrack(null); setQueue([]); setHistory([]); setQueueSeed([]); setIsPlaying(false);
    }
  }, [user]);

  const value = {
    audioRef,
    youtubeRef,
    seekTo,
    currentTrack,
    isPlaying,
    playerError,
    queue,
    history,
    repeatMode,
    shuffleEnabled,
    playTrack,
    togglePlay,
    playNext,
    playPrevious,
    toggleShuffle,
    cycleRepeatMode,
    jumpToQueueIndex,
    removeFromQueueIndex,
    clearQueue,
    setPlayerError,
    setIsPlaying,
    onEnded,
    removeTrack,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
