import { supabase } from './supabase.js';

const LIBRARY_KEY = 'animedex-library-v1';
const LISTS_KEY = 'aniorbit-custom-lists-v1';
const LISTS_UPDATED_KEY = 'aniorbit-custom-lists-updated-at-v1';
const META_KEY = 'aniorbit-cloud-sync-meta-v1';
const BACKUP_KEY = 'aniorbit-account-switch-backup-v1';
const MAX_BYTES = 1024 * 1024;

function emptyLibrary() {
  return {
    watchlist: [],
    history: [],
    watchedEpisodes: {},
    notifiedEpisodes: [],
    tracking: {},
    episodeProgress: {}
  };
}

function normalizeLibrary(value) {
  const library = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...emptyLibrary(),
    ...library,
    watchlist: Array.isArray(library.watchlist) ? library.watchlist : [],
    history: Array.isArray(library.history) ? library.history : [],
    watchedEpisodes: library.watchedEpisodes && typeof library.watchedEpisodes === 'object' && !Array.isArray(library.watchedEpisodes) ? library.watchedEpisodes : {},
    notifiedEpisodes: Array.isArray(library.notifiedEpisodes) ? library.notifiedEpisodes : [],
    tracking: library.tracking && typeof library.tracking === 'object' && !Array.isArray(library.tracking) ? library.tracking : {},
    episodeProgress: library.episodeProgress && typeof library.episodeProgress === 'object' && !Array.isArray(library.episodeProgress) ? library.episodeProgress : {}
  };
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readMeta() {
  const value = readJson(META_KEY, {});
  return value && typeof value === 'object' ? value : {};
}

function saveMeta(value) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(value));
  } catch {}
}

function readLocalSnapshot() {
  const library = normalizeLibrary(readJson(LIBRARY_KEY, {}));
  const lists = readJson(LISTS_KEY, []);
  const customLists = Array.isArray(lists) ? lists.slice(0, 12) : [];
  const listsUpdatedAt = Number(localStorage.getItem(LISTS_UPDATED_KEY)) || 0;
  return {
    version: 1,
    modifiedAt: Math.max(Number(library.updatedAt) || 0, listsUpdatedAt),
    library,
    customLists
  };
}

function normalizeSnapshot(value) {
  const snapshot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    modifiedAt: Math.max(0, Number(snapshot.modifiedAt) || 0),
    library: normalizeLibrary(snapshot.library),
    customLists: Array.isArray(snapshot.customLists) ? snapshot.customLists.slice(0, 12) : []
  };
}

function stampSnapshot(value, modifiedAt) {
  const snapshot = normalizeSnapshot(value);
  const timestamp = Math.max(1, Number(modifiedAt) || Date.now());
  return {
    ...snapshot,
    modifiedAt: timestamp,
    library: { ...snapshot.library, updatedAt: timestamp }
  };
}

function writeLocalSnapshot(value) {
  const snapshot = normalizeSnapshot(value);
  const stamped = stampSnapshot(snapshot, snapshot.modifiedAt || Date.now());
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(stamped.library));
    localStorage.setItem(LISTS_KEY, JSON.stringify(stamped.customLists));
    localStorage.setItem(LISTS_UPDATED_KEY, String(stamped.modifiedAt));
  } catch (error) {
    throw new Error('This device could not store the synced library. Check available browser storage and try again.');
  }
  window.dispatchEvent(new Event('animedex-library-change'));
  window.dispatchEvent(new Event('aniorbit-custom-lists-change'));
  return stamped;
}

function itemId(item) {
  return item?.id === undefined || item?.id === null ? '' : String(item.id);
}

function mergeArrayById(primary, secondary, choose) {
  const result = new Map();
  for (const item of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
    const id = itemId(item);
    if (!id) continue;
    const previous = result.get(id);
    result.set(id, previous ? choose(previous, item) : item);
  }
  return [...result.values()];
}

function timeOf(item) {
  return Math.max(
    Number(item?.updatedAt) || 0,
    Number(item?.lastUpdated) || 0,
    Number(item?.viewedAt) || 0,
    Date.parse(item?.updatedAt || '') || 0,
    Date.parse(item?.createdAt || '') || 0
  );
}

function mergeLibrary(localValue, cloudValue) {
  const local = normalizeLibrary(localValue);
  const cloud = normalizeLibrary(cloudValue);
  const watchedEpisodes = { ...cloud.watchedEpisodes };
  for (const [id, episodes] of Object.entries(local.watchedEpisodes)) {
    const combined = new Set([
      ...(Array.isArray(watchedEpisodes[id]) ? watchedEpisodes[id] : []),
      ...(Array.isArray(episodes) ? episodes : [])
    ].map(Number).filter(number => Number.isInteger(number) && number > 0));
    watchedEpisodes[id] = [...combined].sort((a, b) => a - b);
  }

  const tracking = { ...cloud.tracking };
  for (const [id, entry] of Object.entries(local.tracking)) {
    const existing = tracking[id];
    if (!existing || timeOf(entry) >= timeOf(existing)) tracking[id] = entry;
  }

  const episodeProgress = { ...cloud.episodeProgress };
  for (const [key, entry] of Object.entries(local.episodeProgress)) {
    const existing = episodeProgress[key];
    if (!existing || timeOf(entry) >= timeOf(existing)) episodeProgress[key] = entry;
  }

  const history = mergeArrayById(cloud.history, local.history, (a, b) => {
    const newest = timeOf(b) >= timeOf(a) ? b : a;
    const other = newest === a ? b : a;
    return {
      ...other,
      ...newest,
      recommendations: mergeArrayById(other.recommendations, newest.recommendations, (_old, next) => next).slice(0, 12)
    };
  });

  return {
    ...cloud,
    ...local,
    watchlist: mergeArrayById(cloud.watchlist, local.watchlist, (a, b) => ({ ...a, ...b })),
    history: history.sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 30),
    watchedEpisodes,
    notifiedEpisodes: [...new Map([...cloud.notifiedEpisodes, ...local.notifiedEpisodes].map(item => [JSON.stringify(item), item])).values()].slice(-200),
    tracking,
    episodeProgress,
    updatedAt: Math.max(Number(local.updatedAt) || 0, Number(cloud.updatedAt) || 0)
  };
}

function mergeCustomLists(cloudLists, localLists) {
  return mergeArrayById(cloudLists, localLists, (cloud, local) => {
    const preferLocal = timeOf(local) >= timeOf(cloud);
    const chosen = preferLocal ? local : cloud;
    const other = preferLocal ? cloud : local;
    return {
      ...other,
      ...chosen,
      items: mergeArrayById(other.items, chosen.items, (a, b) => ({ ...a, ...b })).slice(0, 100)
    };
  }).slice(0, 12);
}

function mergeSnapshots(localValue, cloudValue) {
  const local = normalizeSnapshot(localValue);
  const cloud = normalizeSnapshot(cloudValue);
  return {
    version: 1,
    modifiedAt: Math.max(local.modifiedAt, cloud.modifiedAt),
    library: mergeLibrary(local.library, cloud.library),
    customLists: mergeCustomLists(cloud.customLists, local.customLists)
  };
}

function emptySnapshot() {
  return { version: 1, modifiedAt: 0, library: emptyLibrary(), customLists: [] };
}

async function uploadSnapshot(userId, value) {
  const snapshot = stampSnapshot(value, Math.max(Date.now(), Number(value?.modifiedAt) + 1 || 0));
  const serialized = JSON.stringify(snapshot);
  if (new TextEncoder().encode(serialized).length > MAX_BYTES) {
    throw new Error('Your cloud library is over the 1 MB save limit. Remove some older saved items or custom lists, then sync again.');
  }
  writeLocalSnapshot(snapshot);
  const { error } = await supabase.from('user_cloud_saves').upsert({
    user_id: userId,
    data: snapshot,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return snapshot;
}

export async function syncCloudLibrary(userId) {
  if (!supabase || !userId) throw new Error('Sign in to sync your AniOrbit library.');
  const meta = readMeta();
  const { data: row, error } = await supabase.from('user_cloud_saves')
    .select('data,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  // Read local data after the network request so edits made while the request
  // was in flight are included before deciding which copy to keep.
  const local = readLocalSnapshot();
  const accountChanged = Boolean(meta.lastUserId && meta.lastUserId !== userId);
  let action = 'current';
  let snapshot;

  if (accountChanged) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({
        savedAt: Date.now(),
        previousUserId: meta.lastUserId,
        snapshot: local
      }));
    } catch {}
    snapshot = row ? normalizeSnapshot(row.data) : emptySnapshot();
    if (row) {
      snapshot = writeLocalSnapshot(snapshot);
      action = 'account-switched';
    } else {
      snapshot = await uploadSnapshot(userId, snapshot);
      action = 'account-switched';
    }
  } else if (!meta.lastUserId) {
    if (row) {
      snapshot = mergeSnapshots(local, row.data);
      snapshot = await uploadSnapshot(userId, snapshot);
      action = 'merged';
    } else {
      snapshot = await uploadSnapshot(userId, local);
      action = 'uploaded';
    }
  } else if (!row) {
    snapshot = await uploadSnapshot(userId, local);
    action = 'uploaded';
  } else {
    const cloud = normalizeSnapshot(row.data);
    if (local.modifiedAt > cloud.modifiedAt) {
      snapshot = await uploadSnapshot(userId, local);
      action = 'uploaded';
    } else if (cloud.modifiedAt > local.modifiedAt) {
      snapshot = writeLocalSnapshot(cloud);
      action = 'downloaded';
    } else {
      snapshot = cloud;
      action = 'current';
    }
  }

  saveMeta({
    lastUserId: userId,
    lastSyncedAt: Date.now(),
    cloudModifiedAt: snapshot?.modifiedAt || 0
  });
  return { action, modifiedAt: snapshot?.modifiedAt || 0 };
}
