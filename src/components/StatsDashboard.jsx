import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';

const LIBRARY_KEY = 'animedex-library-v1';
const STATUSES = ['Watching', 'Completed', 'On Hold', 'Plan to Watch'];

function readSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
    return {
      watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
      history: Array.isArray(raw.history) ? raw.history : [],
      watchedEpisodes: raw.watchedEpisodes && typeof raw.watchedEpisodes === 'object' ? raw.watchedEpisodes : {},
      tracking: raw.tracking && typeof raw.tracking === 'object' ? raw.tracking : {}
    };
  } catch {
    return { watchlist: [], history: [], watchedEpisodes: {}, tracking: {} };
  }
}

function isExcluded(item) {
  return item?.isAdult === true || (item?.genres || []).some(genre => String(genre).toLowerCase() === 'hentai');
}

export default function StatsDashboard() {
  const [library, setLibrary] = useState(readSnapshot);
  const [customListCount, setCustomListCount] = useState(0);
  const year = new Date().getFullYear();

  useEffect(() => {
    const refresh = () => {
      setLibrary(readSnapshot());
      try {
        const lists = JSON.parse(localStorage.getItem('aniorbit-custom-lists-v1') || '[]');
        setCustomListCount(Array.isArray(lists) ? lists.length : 0);
      } catch {
        setCustomListCount(0);
      }
    };
    refresh();
    window.addEventListener('animedex-library-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('aniorbit-custom-lists-change', refresh);
    return () => {
      window.removeEventListener('animedex-library-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('aniorbit-custom-lists-change', refresh);
    };
  }, []);

  const data = useMemo(() => {
    const history = library.history.filter(item => item?.id && !isExcluded(item));
    const watched = Object.values(library.watchedEpisodes).reduce((sum, episodes) => sum + (Array.isArray(episodes) ? new Set(episodes).size : 0), 0);
    const tracked = Object.values(library.tracking).filter(entry => STATUSES.includes(entry?.status));
    const monthCounts = Array(12).fill(0);
    const yearHistory = history.filter(item => {
      const stamp = Number(item.viewedAt || item.lastUpdated || 0);
      if (!stamp) return false;
      const date = new Date(stamp);
      if (date.getFullYear() !== year) return false;
      monthCounts[date.getMonth()] += 1;
      return true;
    });
    const genreCounts = new Map();
    history.forEach(item => (item.genres || []).forEach(genre => {
      const key = String(genre || '').trim();
      if (key) genreCounts.set(key, (genreCounts.get(key) || 0) + 1);
    }));
    const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topAnime = [...history].sort((a, b) => Number(b.viewedAt || b.lastUpdated || 0) - Number(a.viewedAt || a.lastUpdated || 0)).slice(0, 5);
    return { history, watched, tracked, monthCounts, yearHistory, topGenres, topAnime };
  }, [library, year]);

  const maxMonth = Math.max(1, ...data.monthCounts);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return <>
    <PageHeader />
    <main className="ao-stats-page">
      <Link className="ao-profile-back" to="/">← Back to AniOrbit</Link>
      <div className="ao-page-title"><div><span>YOUR ANIME JOURNEY</span><h1>Statistics &amp; yearly recap</h1><p>A snapshot of your AniOrbit library and your recent activity in {year}.</p></div><Link className="ao-stats-link" to="/tracking">Manage tracking →</Link></div>
      <section className="ao-stats-grid" aria-label="Your anime statistics">
        <article><span>Episodes marked watched</span><strong>{data.watched.toLocaleString()}</strong></article>
        <article><span>Anime in recent history</span><strong>{data.history.length.toLocaleString()}</strong></article>
        <article><span>On your watchlist</span><strong>{library.watchlist.filter(item => !isExcluded(item)).length.toLocaleString()}</strong></article>
        <article><span>Tracked anime</span><strong>{data.tracked.length.toLocaleString()}</strong></article>
        <article><span>Custom collections</span><strong>{customListCount.toLocaleString()}</strong></article>
        <article><span>Titles viewed in {year}</span><strong>{data.yearHistory.length.toLocaleString()}</strong></article>
      </section>
      <section className="ao-stats-panel">
        <div className="ao-stats-panel-head"><div><span>YEARLY RECAP</span><h2>Your activity in {year}</h2></div><b>{data.yearHistory.length} recent title {data.yearHistory.length === 1 ? 'entry' : 'entries'}</b></div>
        <div className="ao-month-chart" role="img" aria-label="Recent title activity entries by month in the current year">
          {data.monthCounts.map((count, index) => <div className="ao-month-column" key={monthNames[index]}><span>{count || ''}</span><i style={{ height: (count ? Math.max(6, count / maxMonth * 100) : 0) + '%' }} /><small>{monthNames[index]}</small></div>)}
        </div>
        <p className="ao-stats-footnote">Monthly activity uses the dates stored with your recent history entries. Episode completion dates are not currently recorded separately, so this recap does not guess when each episode was watched.</p>
      </section>
      <div className="ao-stats-columns">
        <section className="ao-stats-panel"><div className="ao-stats-panel-head"><div><span>YOUR TASTE</span><h2>Top genres in recent history</h2></div></div>
          {data.topGenres.length ? <div className="ao-genre-ranking">{data.topGenres.map(([genre, count]) => <div key={genre}><span>{genre}</span><b>{count}</b></div>)}</div> : <p className="ao-stats-empty">Your genre breakdown will appear as you explore anime.</p>}
        </section>
        <section className="ao-stats-panel"><div className="ao-stats-panel-head"><div><span>RECENTLY EXPLORED</span><h2>Your latest anime</h2></div></div>
          {data.topAnime.length ? <div className="ao-stats-anime">{data.topAnime.map(item => <Link to={'/anime/' + item.id} key={item.id}><span>{item.coverImage?.large || item.image ? <img src={item.coverImage?.large || item.image} alt="" loading="lazy" /> : <i>AO</i>}</span><b>{item.title?.english || item.title?.romaji || item.title?.native || item.name || 'Anime'}</b></Link>)}</div> : <p className="ao-stats-empty">Open an anime page to start building your history.</p>}
        </section>
      </div>
      <p className="ao-stats-footnote">Your detailed viewing history and these charts are read from this browser's saved library. Cloud-synced lifetime counters appear on your member profile when you are signed in. Your recap currently reflects up to 30 recent history entries, not a complete historical export.</p>
    </main>
  </>;
}
