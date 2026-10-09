import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../utils/apiClient.js';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { trackDuration, isFullTrack, isYouTubeTrack, youtubeUrl } from '../utils/audio.js';

export default function MusicLibrary({ onChange }) {
  const { user } = useAuth();
  const { playTrack, removeTrack, currentTrack, isPlaying } = usePlayer();
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('bollywood');
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const [rights, setRights] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState([]);
  const [deleting, setDeleting] = useState('');
  const input = useRef(null);
  const pageSize = 30;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await apiClient.get('/songs', { signal: controller.signal, params: {
          q: query, playback: scope === 'bollywood' ? undefined : scope === 'mine' ? 'full' : scope,
          genre: scope === 'bollywood' ? 'bollywood' : undefined,
          mine: scope === 'mine' ? 'true' : undefined,
          limit: pageSize, skip: page * pageSize, sort,
        } });
        setSongs(data.songs);
        setTotal(data.total);
        if (page > 0 && page * pageSize >= data.total) setPage(Math.max(0, Math.ceil(data.total / pageSize) - 1));
      } catch (err) {
        if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load the library. Please retry.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, scope, sort, page, revision]);

  const upload = async (event) => {
    event.preventDefault();
    if (!files.length || !rights || uploading) return;
    setUploading(true);
    setResults([]);
    const failed = [];
    let added = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('File exceeds 100 MB.');
        const form = new FormData();
        form.append('rightsConfirmed', 'true');
        form.append('audio', file);
        setProgress(`${index + 1}/${files.length} · ${file.name}`);
        await apiClient.post('/songs/upload', form, { timeout: 300000, onUploadProgress: ({ loaded, total: bytes }) => {
          setProgress(`${index + 1}/${files.length} · ${file.name} · ${bytes ? Math.round(loaded / bytes * 100) : 0}%`);
        } });
        added += 1;
      } catch (err) {
        failed.push(file);
        setResults((items) => [...items, `${file.name}: ${err.response?.data?.message || err.message}`]);
      }
    }
    setProgress(`${added} song${added === 1 ? '' : 's'} added${failed.length ? ` · ${failed.length} could not be added` : ''}.`);
    setFiles(failed);
    if (!failed.length && input.current) input.current.value = '';
    setUploading(false);
    if (added) {
      setScope('mine'); setPage(0); setQuery(''); setSort('latest');
      setRevision((value) => value + 1); onChange();
    }
  };

  const deleteSong = async (song) => {
    if (!window.confirm(`Delete “${song.name}”? This removes the track from the shared library and playlists${song.source === 'upload' ? ', and deletes its uploaded audio file' : ''}.`)) return;
    setDeleting(song._id);
    setError('');
    try {
      await apiClient.delete(`/songs/${song._id}`);
      removeTrack(song._id);
      setRevision((value) => value + 1);
      onChange();
    } catch (err) { setError(err.response?.data?.message || 'Deletion failed. Please retry.'); }
    finally { setDeleting(''); }
  };

  return (
    <section className="music-library">
      <div className={`library-hero ${scope === 'bollywood' ? 'bollywood-hero' : ''}`}>
        <div><span className="library-eyebrow">{scope === 'bollywood' ? 'BOLLYWOOD FAVORITES' : 'YOUR LISTENING ROOM'}</span><h2>{scope === 'bollywood' ? 'The songs you know by heart.' : 'Your collection. Your sound.'}</h2>
          <p>{scope === 'bollywood' ? 'Iconic love songs, dance-floor favorites, and timeless Hindi film classics. Play the full song in its official YouTube video.' : 'Browse complete recordings or bring your own downloaded music.'}</p></div>
        <div className="library-count"><strong>{total.toLocaleString()}</strong><span>matching tracks</span></div>
      </div>
      <form className="upload-panel" onSubmit={upload}>
        <div><h3>Insert downloaded songs</h3><p>Choose one or many MP3, M4A, WAV, FLAC, or OGG files. Up to 100 MB each. Titles and artists are read from file tags.</p></div>
        <input ref={input} aria-label="Choose downloaded songs" type="file" accept=".mp3,.m4a,.wav,.flac,.ogg" multiple disabled={uploading} onChange={(event) => { setFiles(Array.from(event.target.files || [])); setResults([]); setProgress(''); }} />
        <label className="rights-check"><input type="checkbox" checked={rights} disabled={uploading} onChange={(event) => setRights(event.target.checked)} />I have permission to share these recordings with everyone using this app.</label>
        <div className="controls-row"><button className="primary-btn" disabled={!files.length || !rights || uploading} type="submit">{uploading ? 'Uploading…' : `Upload${files.length ? ` ${files.length} song${files.length === 1 ? '' : 's'}` : ' songs'}`}</button><span className="muted" role="status">{progress || 'Your original audio plays at its full length.'}</span></div>
        {results.length > 0 && <ul className="upload-errors" role="alert">{results.map((result, index) => <li key={index}>{result}</li>)}</ul>}
      </form>
      <div className="library-toolbar">
        <input aria-label="Search library" placeholder="Search titles, artists, or albums" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} maxLength={200} />
        <select aria-label="Track type" value={scope} onChange={(event) => { setScope(event.target.value); setPage(0); }}><option value="bollywood">Bollywood favorites</option><option value="full">Full tracks</option><option value="mine">My uploads</option><option value="preview">Previews only</option></select>
        <select aria-label="Sort tracks" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="popular">Featured first</option><option value="latest">Recently added</option></select>
        {scope !== 'preview' && <button className="secondary-btn" type="button" disabled={!songs.length || loading} onClick={() => playTrack(songs[0], { replaceQueue: true, queueTracks: songs.slice(1) })}>Play this page</button>}
      </div>
      {scope === 'bollywood' && <p className="library-note">Complete songs from official music channels. YouTube may show ads or restrict videos by region; use “Open on YouTube” if a video cannot play here.</p>}
      {scope === 'preview' && <p className="library-note">Promotional previews provided courtesy of iTunes. Choose Bollywood favorites or Full tracks for complete songs.</p>}
      {error && <div className="inline-error" role="alert">{error} <button className="secondary-btn" type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></div>}
      <div className="library-track-list" aria-busy={loading}>
        {loading ? <p className="muted" role="status">Loading tracks…</p> : songs.map((song, index) => (
          <article className={`library-track ${currentTrack?._id === song._id ? 'is-current' : ''}`} key={song._id}>
            <button className="track-art" aria-label={`${isFullTrack(song) ? 'Play' : 'Preview'} ${song.name}`} type="button" onClick={() => playTrack(song, { replaceQueue: true, queueTracks: isFullTrack(song) ? songs.slice(index + 1) : [] })}>{song.imageUrl && <img src={song.imageUrl} alt="" loading="lazy" />}<span>{currentTrack?._id === song._id && isPlaying ? '♫' : '▶'}</span></button>
            <div className="library-track-info"><strong>{song.name}</strong><span>{song.artist}</span><small>{song.album}</small>
              {song.licenseUrl && <small>{song.attribution} <a href={song.licenseUrl} target="_blank" rel="noreferrer">{song.license}</a> · <a href={song.externalUrl} target="_blank" rel="noreferrer">Source</a></small>}
            </div>
            <span className={`track-kind ${isFullTrack(song) ? 'full' : ''}`}>{isYouTubeTrack(song) ? 'Full video' : isFullTrack(song) ? 'Full track' : 'Preview'}</span>
            <span className="track-length">{isFullTrack(song) ? trackDuration(song.duration) : 'Clip'}</span>
            {isYouTubeTrack(song) && <a className="official-track-link" href={youtubeUrl(song)} target="_blank" rel="noreferrer">YouTube ↗</a>}
            {!isFullTrack(song) && song.externalUrl && <a className="official-track-link" href={song.externalUrl} target="_blank" rel="noreferrer">Listen on Apple Music ↗</a>}
            {(user?.role === 'admin' || String(song.uploadedBy || '') === String(user?._id || user?.id)) && <button className="delete-track-btn" aria-label={`Delete ${song.name}`} disabled={Boolean(deleting)} type="button" onClick={() => deleteSong(song)}>{deleting === song._id ? 'Deleting…' : 'Delete'}</button>}
          </article>
        ))}
        {!loading && !songs.length && <div className="library-empty"><h3>{scope === 'mine' ? 'Your collection starts here' : 'No matching tracks'}</h3><p>{scope === 'mine' ? 'Use the upload panel above to add your first complete recording.' : 'Try a different search or track type.'}</p></div>}
      </div>
      <div className="library-pagination"><button className="secondary-btn" type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Previous page</button><span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span><button className="secondary-btn" type="button" disabled={(page + 1) * pageSize >= total || loading} onClick={() => setPage((value) => value + 1)}>Next page</button></div>
      <p className="library-note">A curated selection of original Bollywood recordings, not a live popularity chart. Availability depends on the music service and your region. You can delete your own uploads; admins can manage the catalog.</p>
    </section>
  );
}
