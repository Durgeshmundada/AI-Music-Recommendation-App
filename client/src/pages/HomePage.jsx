import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/layout/AppShell.jsx';
import MusicLibrary from '../components/MusicLibrary.jsx';
import { apiClient } from '../utils/apiClient.js';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useAuth } from '../state/AuthContext.jsx';
import { isFullTrack, isYouTubeTrack, youtubeUrl } from '../utils/audio.js';

const defaultMoods = ['happy', 'sad', 'energetic', 'calm', 'party', 'romantic', 'workout', 'focus'];

const asPct = (value) => `${Math.round((value || 0) * 100)}%`;

function formatSeconds(value) {
  const total = Number.isFinite(value) ? Math.max(Math.floor(value), 0) : 0;
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function SkeletonCard({ count = 6 }) {
  return (
    <div className="card-row">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="song-card skeleton-card">
          <div className="skeleton-block cover" />
          <div className="skeleton-block line" />
          <div className="skeleton-block line short" />
          <div className="skeleton-block button" />
        </div>
      ))}
    </div>
  );
}

function SkeletonRows({ count = 4 }) {
  return (
    <div className="list">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="list-row skeleton-row">
          <div className="skeleton-block line" />
          <div className="skeleton-block pill" />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { playTrack } = usePlayer();

  const [activeSection, setActiveSection] = useState('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [forYouRecommendations, setForYouRecommendations] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [renamePlaylistName, setRenamePlaylistName] = useState('');
  const [recentSongs, setRecentSongs] = useState([]);
  const [continueSongs, setContinueSongs] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingHomeBlocks, setLoadingHomeBlocks] = useState(false);
  const [loadingForYou, setLoadingForYou] = useState(false);
  const [genreFilter, setGenreFilter] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [minEnergyFilter, setMinEnergyFilter] = useState('');
  const [genreOptions, setGenreOptions] = useState([]);
  const [moodOptions, setMoodOptions] = useState(defaultMoods);
  const [error, setError] = useState('');

  const discoverRef = useRef(null);
  const playlistRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedPlaylist = useMemo(
    () => playlists.find((pl) => pl._id === selectedPlaylistId),
    [playlists, selectedPlaylistId]
  );

  const selectedPlaylistEntries = useMemo(
    () => (selectedPlaylist?.songs || []).filter((entry) => entry.song),
    [selectedPlaylist]
  );

  const selectedPlaylistSongs = useMemo(
    () => selectedPlaylistEntries.map((entry) => entry.song),
    [selectedPlaylistEntries]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 320);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const moodAccent = {
      energetic: '#12e193',
      happy: '#fbbf24',
      calm: '#38bdf8',
      party: '#f43f5e',
      focus: '#a78bfa',
      romantic: '#fb7185',
      sad: '#94a3b8',
      workout: '#f97316',
    };

    const accent = moodAccent[selectedSong?.mood] || '#12e193';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-soft', `${accent}33`);
  }, [selectedSong]);

  const pushToast = (message, type = 'info') => {
    window.dispatchEvent(
      new CustomEvent('app:toast', {
        detail: { message, type },
      })
    );
  };

  const fetchPlaylists = async () => {
    try {
      setLoadingPlaylists(true);
      const res = await apiClient.get('/playlists');
      const items = res.data.playlists || [];
      setPlaylists(items);

      if (!items.length) {
        setSelectedPlaylistId('');
        return;
      }

      if (!selectedPlaylistId || !items.some((item) => item._id === selectedPlaylistId)) {
        setSelectedPlaylistId(items[0]._id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load playlists');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const fetchFacets = async () => {
    try {
      const res = await apiClient.get('/songs/facets');
      setGenreOptions(res.data.genres || []);
      if ((res.data.moods || []).length) {
        setMoodOptions(res.data.moods);
      }
    } catch {
      // optional helper data only
    }
  };

  const fetchHomeBlocks = async () => {
    try {
      setLoadingHomeBlocks(true);
      const [recentRes, continueRes] = await Promise.all([
        apiClient.get('/songs/recent', { params: { limit: 8 } }),
        apiClient.get('/songs/continue', { params: { limit: 6 } }),
      ]);
      setRecentSongs(recentRes.data.songs || []);
      setContinueSongs(continueRes.data.songs || []);
    } catch {
      // non-blocking
    } finally {
      setLoadingHomeBlocks(false);
    }
  };

  const fetchForYou = async () => {
    try {
      setLoadingForYou(true);
      const res = await apiClient.get('/recommendations/for-you', { params: { n: 12 } });
      setForYouRecommendations(res.data.recommendations || []);
    } catch {
      // non-blocking
    } finally {
      setLoadingForYou(false);
    }
  };

  const fetchSongs = async () => {
    try {
      setLoadingSongs(true);
      setError('');

      const params = {
        limit: 24,
        genre: genreFilter || undefined,
        mood: moodFilter || undefined,
        minEnergy: minEnergyFilter || undefined,
      };

      if (debouncedQuery) {
        const res = await apiClient.get('/songs', {
          params: {
            q: debouncedQuery,
            ...params,
          },
        });

        setSongs(res.data.songs || []);
        if (!(res.data.songs || []).length) {
          setError('No songs found. Try another query or filter.');
        }
      } else {
        const res = await apiClient.get('/songs', { params });
        setSongs(res.data.songs || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load songs');
    } finally {
      setLoadingSongs(false);
    }
  };

  useEffect(() => {
    fetchFacets();
    fetchPlaylists();
    fetchHomeBlocks();
    fetchForYou();
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [debouncedQuery, genreFilter, moodFilter, minEnergyFilter]);

  useEffect(() => {
    setRenamePlaylistName(selectedPlaylist?.name || '');
  }, [selectedPlaylist?.name, selectedPlaylistId]);

  const handleNavigate = (section) => {
    setActiveSection(section);
    if (section === 'library') return;

    if (section === 'discover') {
      discoverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => searchInputRef.current?.focus(), 100);
      return;
    }

    playlistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const runSearch = (e) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery.trim());
  };

  const requestRecommendations = async (song) => {
    if (!song?._id) return;

    setSelectedSong(song);
    setLoadingRecs(true);
    setError('');

    try {
      const res = await apiClient.get('/recommendations/smart', {
        params: { songId: song._id, n: 12 },
      });
      setRecommendations(res.data.recommendations || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load recommendations');
    } finally {
      setLoadingRecs(false);
    }
  };

  const createPlaylist = async (e) => {
    e.preventDefault();
    if (!playlistName.trim()) {
      setError('Playlist name is required.');
      return;
    }

    try {
      setError('');
      await apiClient.post('/playlists', { name: playlistName.trim() });
      setPlaylistName('');
      await fetchPlaylists();
      pushToast('Playlist created', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create playlist');
    }
  };

  const renameSelectedPlaylist = async () => {
    if (!selectedPlaylistId || !renamePlaylistName.trim()) return;

    try {
      await apiClient.patch(`/playlists/${selectedPlaylistId}`, {
        name: renamePlaylistName.trim(),
      });
      await fetchPlaylists();
      pushToast('Playlist renamed', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to rename playlist');
    }
  };

  const deleteSelectedPlaylist = async () => {
    if (!selectedPlaylistId) return;

    const confirmed = window.confirm('Delete this playlist permanently?');
    if (!confirmed) return;

    try {
      await apiClient.delete(`/playlists/${selectedPlaylistId}`);
      setSelectedPlaylistId('');
      await fetchPlaylists();
      pushToast('Playlist deleted', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete playlist');
    }
  };

  const addSongToSelectedPlaylist = async (song) => {
    if (!song?._id) {
      setError('Play or select a track first.');
      return;
    }

    if (!selectedPlaylistId) {
      setError('Select or create a playlist first.');
      handleNavigate('playlists');
      return;
    }

    try {
      setError('');
      await apiClient.post(`/playlists/${selectedPlaylistId}/songs`, { songId: song._id });
      await fetchPlaylists();
      pushToast(`Added "${song.name}" to playlist`, 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add song to playlist');
    }
  };

  const removeSongFromSelectedPlaylist = async (songId) => {
    if (!selectedPlaylistId || !songId) return;

    try {
      await apiClient.delete(`/playlists/${selectedPlaylistId}/songs/${songId}`);
      await fetchPlaylists();
      pushToast('Song removed from playlist', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove song from playlist');
    }
  };

  const reorderSelectedPlaylistSong = async (index, direction) => {
    if (!selectedPlaylistId) return;

    const target = index + direction;
    if (target < 0 || target >= selectedPlaylistEntries.length) return;

    const ids = selectedPlaylistEntries.map((entry) => String(entry.song._id));
    [ids[index], ids[target]] = [ids[target], ids[index]];

    try {
      await apiClient.patch(`/playlists/${selectedPlaylistId}/reorder`, {
        orderedSongIds: ids,
      });
      await fetchPlaylists();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reorder playlist');
    }
  };

  const handlePlaySong = async (song) => {
    if (!song) return;

    setSelectedSong(song);
    playTrack(song, { replaceQueue: false });

    try {
      await apiClient.post(`/songs/${song._id}/play`, { duration: 0 });
      fetchHomeBlocks();
      fetchForYou();
    } catch {
      // non-blocking telemetry only
    }
  };

  const playTrackList = (tracks) => {
    if (!tracks.length) return;

    const [first, ...rest] = tracks;
    playTrack(first, { replaceQueue: true, queueTracks: rest });
    setSelectedSong(first);
  };

  const handlePlayRecommendations = () => {
    const valid = recommendations.map((r) => r.recommendedSong).filter(Boolean);

    if (!valid.length) {
      setError('No playable recommendations available.');
      return;
    }

    playTrackList(valid);
  };

  const playForYou = () => {
    const tracks = forYouRecommendations
      .map((rec) => rec.recommendedSong)
      .filter(Boolean);

    if (!tracks.length) {
      setError('No For You tracks available yet.');
      return;
    }

    playTrackList(tracks);
  };

  const playContinue = () => {
    const tracks = continueSongs.length ? continueSongs : recentSongs;

    if (!tracks.length) {
      setError('No listening history yet.');
      return;
    }

    playTrackList(tracks);
  };

  const playSelectedPlaylist = () => {
    if (!selectedPlaylistSongs.length) {
      setError('This playlist has no playable songs yet.');
      return;
    }

    playTrackList(selectedPlaylistSongs);
  };

  const clearFilters = () => {
    setGenreFilter('');
    setMoodFilter('');
    setMinEnergyFilter('');
  };

  return (
    <AppShell activeSection={activeSection} onNavigate={handleNavigate}>
      {activeSection === 'library' && <MusicLibrary onChange={() => { fetchSongs(); fetchFacets(); fetchPlaylists(); fetchHomeBlocks(); fetchForYou(); setSelectedSong(null); setRecommendations([]); }} />}
      <div className="grid two-columns gap-xl" style={{ display: activeSection === 'library' ? 'none' : undefined }}>
        <section ref={discoverRef}>
          <div className="feature-hero">
            <h2>Your Bollywood favorites, in one place</h2>
            <p>
              Rediscover Hindi film classics and modern favorites. Play full songs through official YouTube videos, or upload your own complete recordings.
            </p>
            <div className="quick-actions-row">
              <button className="primary-btn" type="button" onClick={() => handleNavigate('library')}>Browse Bollywood favorites</button>
              <button className="secondary-btn" type="button" onClick={playForYou}>Play For You</button>
              <button className="secondary-btn" type="button" onClick={playContinue}>Resume listening</button>
            </div>
          </div>

          {!user?.isEmailVerified && (
            <div className="inline-info-card">
              <span>Email not verified yet.</span>
              <Link to="/verify-email" className="inline-link">Verify now</Link>
            </div>
          )}

          <form className="search-bar" onSubmit={runSearch}>
            <input
              ref={searchInputRef}
              type="text"
              name="search"
              id="home-search"
              autoComplete="off"
              placeholder="Search songs or artists"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" disabled={loadingSongs}>
              {loadingSongs ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="filters-row compact">
            <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
              <option value="">All genres</option>
              {genreOptions.map((genre) => (
                <option key={genre} value={genre}>{genre}</option>
              ))}
            </select>
            <select value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}>
              <option value="">All moods</option>
              {moodOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={minEnergyFilter} onChange={(e) => setMinEnergyFilter(e.target.value)}>
              <option value="">Any energy</option>
              <option value="0.3">Energy 30%+</option>
              <option value="0.5">Energy 50%+</option>
              <option value="0.7">Energy 70%+</option>
            </select>
            <button className="secondary-btn" type="button" onClick={clearFilters}>Reset</button>
          </div>

          {error && <div className="inline-error">{error}</div>}

          {selectedSong && (
            <div className="selected-track-card">
              <div className="section-header-row">
                <h2 className="section-title">Selected track</h2>
                <div className="controls-row">
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => requestRecommendations(selectedSong)}
                  >
                    Refresh mix
                  </button>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={() => addSongToSelectedPlaylist(selectedSong)}
                  >
                    Save to playlist
                  </button>
                </div>
              </div>
              <div className="song-title">{selectedSong.name}</div>
              <div className="song-artist">{selectedSong.artist}</div>
              <div className="dna-grid">
                {[
                  ['energy', selectedSong.energy],
                  ['valence', selectedSong.valence],
                  ['danceability', selectedSong.danceability],
                ].map(([key, value]) => (
                  <div key={key}>
                    <div className="dna-label-row">
                      <span className="muted dna-label">{key}</span>
                      <span className="muted">{asPct(value)}</span>
                    </div>
                    <div className="dna-track">
                      <div className="dna-fill" style={{ width: asPct(value) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="section-title">Bollywood favorites & your uploads</h2>
          <button className="secondary-btn" type="button" onClick={() => handleNavigate('library')}>Browse the full library</button>
          {loadingSongs ? (
            <SkeletonCard />
          ) : (
            <div className="card-row">
              {songs.map((song) => (
                <div key={song._id} className="song-card">
                  <div className="song-cover">
                    <img
                      src={
                        song.imageUrl
                        || 'https://images.pexels.com/photos/164745/pexels-photo-164745.jpeg?auto=compress&w=200'
                      }
                      alt={song.name}
                    />
                    <button
                      className="play-overlay"
                      onClick={() => handlePlaySong(song)}
                      type="button"
                      title={`Play ${song.name}`}
                    >
                      {isFullTrack(song) ? 'Play' : 'Preview'}
                    </button>
                  </div>
                  <div className="song-meta">
                    <div className="song-title" title={song.name}>{song.name}</div>
                    <div className="song-artist" title={song.artist}>{song.artist}</div>
                    <div className="song-tags">
                      <span className={`track-kind ${isFullTrack(song) ? 'full' : ''}`}>{isYouTubeTrack(song) ? 'Full video' : isFullTrack(song) ? 'Full track' : 'Preview'}</span>
                      <span>{song.genre}</span>
                      {song.mood && <span className="pill">{song.mood}</span>}
                    </div>
                  </div>
                  {song.licenseUrl && <small className="catalog-credit">{song.attribution} <a href={song.licenseUrl} target="_blank" rel="noreferrer">{song.license}</a></small>}
                  {isYouTubeTrack(song) && <div className="catalog-credit"><a href={youtubeUrl(song)} target="_blank" rel="noreferrer">{song.youtubeChannel} · YouTube ↗</a></div>}
                  {!isFullTrack(song) && song.externalUrl && <div className="catalog-credit">Preview provided courtesy of iTunes. <a href={song.externalUrl} target="_blank" rel="noreferrer">Listen on Apple Music ↗</a></div>}
                  <div className="card-actions">
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => requestRecommendations(song)}
                    >
                      Smart mix
                    </button>
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={() => addSongToSelectedPlaylist(song)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
              {!songs.length && <p className="muted">No tracks found with current filters.</p>}
            </div>
          )}
        </section>

        <section>
          <section className="home-block">
            <div className="section-header-row">
              <h2 className="section-title">Continue listening</h2>
              <button className="secondary-btn" type="button" onClick={playContinue}>Play all</button>
            </div>
            {loadingHomeBlocks ? (
              <SkeletonRows count={3} />
            ) : (
              <div className="list compact">
                {(continueSongs.length ? continueSongs : recentSongs).slice(0, 5).map((song) => (
                  <button
                    key={`continue-${song._id}`}
                    className="list-row"
                    type="button"
                    onClick={() => handlePlaySong(song)}
                  >
                    <div>
                      <div className="song-title">{song.name}</div>
                      <div className="song-artist">{song.artist}</div>
                    </div>
                    <span className="pill">
                      {song.resumeFromSec ? formatSeconds(song.resumeFromSec) : 'Recent'}
                    </span>
                  </button>
                ))}
                {!continueSongs.length && !recentSongs.length && (
                  <p className="muted">No listening history yet.</p>
                )}
              </div>
            )}
          </section>

          <div className="divider" />

          <section className="home-block">
            <div className="section-header-row">
              <h2 className="section-title">For You</h2>
              <button className="secondary-btn" type="button" onClick={playForYou}>Play all</button>
            </div>
            {loadingForYou ? (
              <SkeletonRows count={4} />
            ) : (
              <div className="list compact">
                {forYouRecommendations.map((rec) => (
                  <button
                    key={`foryou-${rec._id}`}
                    className="list-row"
                    type="button"
                    onClick={() => handlePlaySong(rec.recommendedSong)}
                    disabled={!rec.recommendedSong}
                  >
                    <div>
                      <div className="song-title">{rec.recommendedSong?.name || 'Unavailable track'}</div>
                      <div className="song-artist">{rec.recommendedSong?.artist || ''}</div>
                    </div>
                    <span className="pill">{rec.strength || 0}%</span>
                  </button>
                ))}
                {!forYouRecommendations.length && <p className="muted">No For You tracks yet.</p>}
              </div>
            )}
          </section>

          <div className="divider" />

          <section>
            <div className="section-header-row">
              <h2 className="section-title">
                {selectedSong ? `Smart mix for "${selectedSong.name}"` : 'Smart mix'}
              </h2>
              {recommendations.length > 0 && (
                <button className="secondary-btn" type="button" onClick={handlePlayRecommendations}>
                  Play all
                </button>
              )}
            </div>

            {loadingRecs && <SkeletonRows count={5} />}

            {!loadingRecs && !recommendations.length && (
              <p className="muted">Pick any track and generate a smart mix.</p>
            )}

            <div className="list">
              {recommendations.map((rec) => (
                <button
                  key={rec._id}
                  className="list-row"
                  type="button"
                  onClick={() => handlePlaySong(rec.recommendedSong)}
                  disabled={!rec.recommendedSong}
                >
                  <div>
                    <div className="song-title">{rec.recommendedSong?.name || 'Unavailable track'}</div>
                    <div className="song-artist">{rec.recommendedSong?.artist || ''}</div>
                    {!!rec.reasons?.length && (
                      <div className="song-why" title={rec.reasons.join(' | ')}>{rec.reasons[0]}</div>
                    )}
                  </div>
                  <div className="list-meta">
                    <span className="pill">
                      {rec.strength ? `${Math.round(rec.strength)}% match` : 'Recommended'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="divider" />

          <section ref={playlistRef}>
            <div className="section-header-row">
              <h2 className="section-title">Playlists</h2>
              {selectedPlaylistSongs.length > 0 && (
                <button className="secondary-btn" type="button" onClick={playSelectedPlaylist}>
                  Play selected
                </button>
              )}
            </div>
            <form className="search-bar" onSubmit={createPlaylist}>
              <input
                type="text"
                placeholder="New playlist name"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
              />
              <button type="submit">Create</button>
            </form>

            <div className="mood-row">
              <select
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
              >
                <option value="">Select playlist</option>
                {playlists.map((pl) => (
                  <option key={pl._id} value={pl._id}>
                    {pl.name} ({pl.songs?.length || 0})
                  </option>
                ))}
              </select>
              <button type="button" onClick={fetchPlaylists} disabled={loadingPlaylists}>
                {loadingPlaylists ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {!!selectedPlaylistId && (
              <div className="playlist-admin-row">
                <input
                  type="text"
                  value={renamePlaylistName}
                  onChange={(e) => setRenamePlaylistName(e.target.value)}
                  placeholder="Rename selected playlist"
                />
                <button className="secondary-btn" type="button" onClick={renameSelectedPlaylist}>Rename</button>
                <button className="secondary-btn danger" type="button" onClick={deleteSelectedPlaylist}>Delete</button>
              </div>
            )}

            {!playlists.length && <p className="muted">No playlists yet. Create one above.</p>}

            {selectedPlaylistSongs.length > 0 && (
              <div className="list compact">
                {selectedPlaylistSongs.map((song, index) => (
                  <div key={`${selectedPlaylistId}-${song._id}-${index}`} className="playlist-song-row">
                    <button
                      className="list-row"
                      type="button"
                      onClick={() => handlePlaySong(song)}
                    >
                      <div>
                        <div className="song-title">{song.name}</div>
                        <div className="song-artist">{song.artist}</div>
                      </div>
                    </button>
                    <div className="playlist-row-actions">
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={() => reorderSelectedPlaylistSong(index, -1)}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={() => reorderSelectedPlaylistSong(index, 1)}
                        disabled={index === selectedPlaylistSongs.length - 1}
                      >
                        Down
                      </button>
                      <button
                        className="secondary-btn danger"
                        type="button"
                        onClick={() => removeSongFromSelectedPlaylist(song._id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </AppShell>
  );
}
