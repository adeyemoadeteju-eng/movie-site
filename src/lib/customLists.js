const KEY = 'aniorbit-custom-lists-v1';
const EVENT = 'aniorbit-custom-lists-change';

export function readCustomLists() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value)
      ? value.filter(list => list && typeof list.id === 'string' && typeof list.name === 'string')
        .map(list => ({ ...list, items: Array.isArray(list.items) ? list.items : [] }))
      : [];
  } catch {
    return [];
  }
}

export function saveCustomLists(lists) {
  const safe = Array.isArray(lists) ? lists.slice(0, 12) : [];
  try {
    localStorage.setItem(KEY, JSON.stringify(safe));
    window.dispatchEvent(new Event(EVENT));
  } catch (error) {
    console.warn('AniOrbit custom lists could not be saved:', error);
  }
  return safe;
}

export function customListsEventName() {
  return EVENT;
}

export function toggleAnimeInCustomList(listId, anime) {
  if (!anime?.id) return readCustomLists();
  const summary = {
    id: String(anime.id),
    title: anime.title?.english || anime.title?.romaji || anime.title?.native || anime.name || 'Untitled',
    image: anime.coverImage?.extraLarge || anime.coverImage?.large || anime.image || anime.poster || '',
    format: anime.format || 'TV',
    seasonYear: anime.seasonYear || null,
    genres: Array.isArray(anime.genres) ? anime.genres.slice(0, 8) : []
  };
  const next = readCustomLists().map(list => {
    if (list.id !== listId) return list;
    const exists = list.items.some(item => String(item.id) === String(summary.id));
    return {
      ...list,
      updatedAt: new Date().toISOString(),
      items: exists
        ? list.items.filter(item => String(item.id) !== String(summary.id))
        : [...list.items, summary].slice(0, 100)
    };
  });
  return saveCustomLists(next);
}

export function removeAnimeFromCustomList(listId, animeId) {
  return saveCustomLists(readCustomLists().map(list => list.id === listId
    ? { ...list, items: list.items.filter(item => String(item.id) !== String(animeId)), updatedAt: new Date().toISOString() }
    : list));
}
