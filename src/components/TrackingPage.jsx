import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';

const LIBRARY_KEY = 'animedex-library-v1';
const STATUSES = ['Watching', 'Completed', 'On Hold', 'Plan to Watch'];

function safeRead() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function isExcluded(anime) {
  return anime?.isAdult === true
    || (anime?.genres || []).some(genre => String(genre || '').trim().toLowerCase() === 'hentai');
}

function title(anime) {
  return anime?.title?.english || anime?.title?.romaji || anime?.title?.native || anime?.name || 'Untitled';
}

function updateStatus(id, entry, status) {
  const library = safeRead();
  const tracking = { ...(library.tracking || {}) };
  if (!STATUSES.includes(status)) {
    delete tracking[String(id)];
  } else {
    tracking[String(id)] = { ...entry, status, updatedAt: Date.now() };
  }
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ ...library, tracking, updatedAt: Date.now() }));
    window.dispatchEvent(new Event('animedex-library-change'));
  } catch (error) {
    console.warn('AniOrbit tracking changes could not be saved:', error);
  }
}

export default function TrackingPage() {
  const [library, setLibrary] = useState(safeRead);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    const refresh = () => setLibrary(safeRead());
    window.addEventListener('animedex-library-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('animedex-library-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const entries = useMemo(() => Object.entries(library.tracking || {})
    .map(([id, entry]) => ({ id, ...(entry || {}) }))
    .filter(entry => entry.anime?.id && !isExcluded(entry.anime))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [library.tracking]);

  const visible = filter === 'All' ? entries : entries.filter(entry => entry.status === filter);
  const counts = useMemo(() => ({
    All: entries.length,
    ...Object.fromEntries(STATUSES.map(status => [status, entries.filter(entry => entry.status === status).length]))
  }), [entries]);

  return <>
    <PageHeader />
    <main className="ad-tracking-page">
      <Link className="ad-profile-back" to="/">← Back to AniOrbit</Link>
      <div className="ad-page-title">
        <div>
          <span>YOUR PERSONAL ANIME LIBRARY</span>
          <h1>Anime tracking</h1>
          <p>Keep track of what you are watching, finished, paused, or plan to watch.</p>
        </div>
        <span className="ad-tracking-total">{entries.length} {entries.length === 1 ? 'title' : 'titles'} tracked</span>
      </div>
      <div className="ad-tracking-tabs" role="group" aria-label="Filter tracked anime">
        {['All', ...STATUSES].map(status => (
          <button key={status} type="button" className={filter === status ? 'active' : ''}
            aria-pressed={filter === status} onClick={() => setFilter(status)}>
            {status}<span>{counts[status]}</span>
          </button>
        ))}
      </div>
      {visible.length ? <div className="ad-tracking-grid">
        {visible.map(entry => {
          const anime = entry.anime;
          const watched = library.watchedEpisodes?.[String(entry.id)] || [];
          const total = Number(anime.episodes) || 0;
          const progress = total > 0 ? Math.min(100, Math.round(watched.length / total * 100)) : 0;
          return <article className="ad-tracking-card" key={entry.id}>
            <Link className="ad-tracking-art" to={'/anime/' + entry.id}>
              {anime.coverImage?.extraLarge || anime.coverImage?.large
                ? <img src={anime.coverImage.extraLarge || anime.coverImage.large} alt="" loading="lazy" />
                : <span>ANIORBIT</span>}
            </Link>
            <div className="ad-tracking-info">
              <Link to={'/anime/' + entry.id}><h2>{title(anime)}</h2></Link>
              <p>{anime.format || 'Anime'}{anime.seasonYear ? ' · ' + anime.seasonYear : ''}</p>
              {total > 0 && <div className="ad-tracking-progress" role="progressbar"
                aria-label={title(anime) + ' episode progress'} aria-valuemin="0" aria-valuemax={total}
                aria-valuenow={Math.min(total, watched.length)}>
                <i style={{ width: progress + '%' }} />
              </div>}
              <small>{watched.length}{total ? ' / ' + total : ''} episodes marked watched</small>
              <label>Status
                <select aria-label={'Status for ' + title(anime)} value={entry.status || ''}
                  onChange={event => updateStatus(entry.id, entry, event.target.value)}>
                  {STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                  <option value="">Remove from tracking</option>
                </select>
              </label>
            </div>
            <Link className="ad-tracking-open" to={'/anime/' + entry.id}>Open anime →</Link>
          </article>;
        })}
      </div> : <section className="ad-tracking-empty">
        <span>ANIORBIT · MY LIBRARY</span>
        <h2>{filter === 'All' ? 'Your tracking list is empty.' : 'Nothing in ' + filter + ' yet.'}</h2>
        <p>Open an anime page and choose a status under “My anime status” to add it here.</p>
        <Link to="/">Explore anime</Link>
      </section>}
    </main>
  </>;
}
