import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAiringTime } from './scheduleUtils.js';
import PageHeader from './PageHeader.jsx';

const API = (import.meta.env.VITE_KUHI_API_URL || import.meta.env.VITE_ANIME_API_URL || 'https://anime-api-jqpp.onrender.com').replace(/\/+$/, '');

function labelForDate(value) {
  const date = new Date(Number(value) * 1000);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function SchedulePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('week');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    const cacheKey = 'aniorbit-release-schedule-v1';
    try {
      if (!force) {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
        if (cached?.savedAt && Date.now() - cached.savedAt < 60 * 1000 && Array.isArray(cached.items)) {
          setItems(cached.items);
          setLoading(false);
          return;
        }
      }
      const response = await fetch(API + '/anime/schedule?page=1&per_page=50', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Schedule request failed (' + response.status + ')');
      const rows = (Array.isArray(data.results) ? data.results : [])
        .filter(item => item?.id && Number.isFinite(Number(item.airingAt)) && Number(item.airingAt) > 0 && item.next_episode)
        .sort((a, b) => Number(a.airingAt) - Number(b.airingAt));
      setItems(rows);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), items: rows })); } catch {}
    } catch (reason) {
      setError(reason.message || 'The release schedule could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const now = Date.now() / 1000;
    const cutoff = range === 'today' ? now + 24 * 60 * 60 : range === 'week' ? now + 7 * 24 * 60 * 60 : Infinity;
    return items.filter(item => Number(item.airingAt) >= now - 60 * 60 && Number(item.airingAt) <= cutoff);
  }, [items, range]);

  const groups = useMemo(() => visible.reduce((result, item) => {
    const key = new Date(Number(item.airingAt) * 1000).toLocaleDateString();
    if (!result[key]) result[key] = { label: labelForDate(item.airingAt), items: [] };
    result[key].items.push(item);
    return result;
  }, {}), [visible]);

  return <>
    <PageHeader/>
    <main className="ad-schedule-page">
      <Link className="ad-profile-back" to="/">← Back to AniOrbit</Link>
      <div className="ad-page-title"><div><span>KEEP UP WITH YOUR SHOWS</span><h1>Upcoming episodes</h1><p>Browse the catalogue’s latest airing timetable.</p></div><button type="button" onClick={() => load(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh schedule'}</button></div>
      <div className="ad-schedule-filters" role="group" aria-label="Schedule range">
        <button type="button" className={range === 'today' ? 'active' : ''} aria-pressed={range === 'today'} onClick={() => setRange('today')}>Today</button>
        <button type="button" className={range === 'week' ? 'active' : ''} aria-pressed={range === 'week'} onClick={() => setRange('week')}>Next 7 days</button>
        <button type="button" className={range === 'all' ? 'active' : ''} aria-pressed={range === 'all'} onClick={() => setRange('all')}>All results</button>
      </div>
      {error && <div className="ad-catalogue-error" role="alert"><span>{error}</span><button type="button" onClick={() => load(true)}>Try again</button></div>}
      {loading && !items.length ? <p className="ad-schedule-empty">Loading release schedule…</p> : Object.entries(groups).length ? Object.entries(groups).map(([key, group]) => <section className="ad-schedule-day" key={key}>
        <h2>{group.label}</h2><div className="ad-schedule-list">{group.items.map(item => {
          const image = item.coverImage?.extraLarge || item.coverImage?.large || item.image || '';
          const title = item.title?.english || item.title?.romaji || item.title?.native || 'Untitled';
          return <article key={item.id + ':' + item.next_episode}>
            <Link to={'/anime/' + item.id} className="ad-schedule-poster">{image ? <img src={image} loading="lazy" alt="" /> : <span>AO</span>}</Link>
            <div className="ad-schedule-copy"><Link to={'/anime/' + item.id}><b>{title}</b></Link><span>Episode {item.next_episode}</span><small>{formatAiringTime(item.airingAt)}</small></div>
            <Link className="ad-schedule-open" to={'/anime/' + item.id}>View <span>→</span></Link>
          </article>;
        })}</div>
      </section>) : !error ? <p className="ad-schedule-empty">{loading ? 'Refreshing schedule…' : 'No upcoming episodes were returned for this range.'}</p> : null}
    </main>
  </>;
}
