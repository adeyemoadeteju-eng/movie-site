import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const LIBRARY_KEY = 'animedex-library-v1';

function readLibrary() {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
    return {
      history: Array.isArray(data.history) ? data.history : [],
      watchlist: Array.isArray(data.watchlist) ? data.watchlist : [],
      watchedEpisodes: data.watchedEpisodes && typeof data.watchedEpisodes === 'object' ? data.watchedEpisodes : {}
    };
  } catch {
    return { history: [], watchlist: [], watchedEpisodes: {} };
  }
}

function readCounts(library) {
  const history = library.history;
  const watched = library.watchedEpisodes;
  return {
    watchlist_count: library.watchlist.length,
    history_count: history.length,
    continue_count: history.filter(item => item?.lastEpisode).length,
    episodes_watched_count: Object.values(watched).reduce((sum, items) => sum + (Array.isArray(items) ? new Set(items).size : 0), 0),
    updated_at: new Date().toISOString()
  };
}

function activityRows(library) {
  const rows = [];
  const historyById = new Map(library.history.map(item => [String(item.id), item]));
  const imageFor = item => {
    const value = item?.coverImage?.extraLarge || item?.coverImage?.large || item?.image || item?.poster || '';
    return /^https:\/\//i.test(value) ? value.slice(0, 2048) : '';
  };
  for (const item of library.history.slice(0, 30)) {
    if (!item?.id) continue;
    const timestamp = Number(item.lastUpdated || item.viewedAt);
    rows.push({
      user_id: null,
      activity_type: 'started',
      activity_key: 'started:' + item.id,
      anime_id: String(item.id),
      anime_title: String(item.title?.english || item.title?.romaji || item.title || 'Anime').slice(0, 180),
      anime_image: imageFor(item),
      detail: 'Started watching',
      ...(Number.isFinite(timestamp) && timestamp > 0 ? { created_at: new Date(timestamp).toISOString() } : {})
    });
    const watchedEpisode = Number(item.lastCompletedEpisode);
    if (Number.isInteger(watchedEpisode) && watchedEpisode > 0) {
      rows.push({
        user_id: null,
        activity_type: 'episode_watched',
        activity_key: 'episode:' + item.id + ':' + watchedEpisode,
        anime_id: String(item.id),
        anime_title: String(item.title?.english || item.title?.romaji || item.title || 'Anime').slice(0, 180),
        anime_image: imageFor(item),
        detail: 'Episode ' + watchedEpisode + ' marked watched',
        ...(Number.isFinite(timestamp) && timestamp > 0 ? { created_at: new Date(timestamp).toISOString() } : {})
      });
    }
  }
  for (const item of library.watchlist.slice(0, 60)) {
    if (!item?.id) continue;
    rows.push({
      user_id: null,
      activity_type: 'watchlist',
      activity_key: 'watchlist:' + item.id,
      anime_id: String(item.id),
      anime_title: String(item.title?.english || item.title?.romaji || item.title || 'Anime').slice(0, 180),
      anime_image: imageFor(item),
      detail: 'Added to watchlist'
    });
  }
  // Avoid repeated rows when history and watchlist contain the same event key.
  return [...new Map(rows.map(row => [row.activity_key, row])).values()].slice(0, 120);
}

export default function ProfileStatsSync() {
  useEffect(() => {
    if (!supabase) return;
    let userId = null;
    let active = true;
    let busy = false;
    let queued = false;

    const sync = async () => {
      if (!userId || busy) return;
      busy = true;
      const currentUser = userId;
      try {
        const library = readLibrary();
        const { error: statsError } = await supabase.from('profile_stats')
          .upsert({ user_id: currentUser, ...readCounts(library) }, { onConflict: 'user_id' });
        if (statsError) console.warn('AniOrbit profile stats sync:', statsError.message);

        const rows = activityRows(library).map(row => ({ ...row, user_id: currentUser }));
        if (rows.length) {
          const { error: activityError } = await supabase.from('member_activity')
            .upsert(rows, { onConflict: 'user_id,activity_key', ignoreDuplicates: true });
          if (activityError) console.warn('AniOrbit activity sync:', activityError.message);
        }
        if (!statsError) window.dispatchEvent(new Event('aniorbit-profile-stats-updated'));
      } finally {
        busy = false;
        if (queued && active) { queued = false; sync(); }
      }
    };

    const refresh = () => {
      if (busy) { queued = true; return; }
      sync();
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userId = data.session?.user?.id || null;
      if (userId) refresh();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userId = session?.user?.id || null;
      if (userId) refresh();
    });
    window.addEventListener('animedex-library-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('animedex-library-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return null;
}
