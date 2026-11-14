import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customListsEventName, readCustomLists, toggleAnimeInCustomList } from '../lib/customLists.js';

export default function CustomListActions({ anime }) {
  const [lists, setLists] = useState(() => readCustomLists());
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const refresh = () => {
      const next = readCustomLists();
      setLists(next);
      setSelected(current => next.some(list => list.id === current) ? current : (next[0]?.id || ''));
    };
    window.addEventListener(customListsEventName(), refresh);
    refresh();
    return () => window.removeEventListener(customListsEventName(), refresh);
  }, []);

  useEffect(() => {
    if (!selected && lists[0]) setSelected(lists[0].id);
  }, [lists, selected]);

  if (!lists.length) {
    return <Link className="ad-custom-list-create-link" to="/lists">＋ Create a custom list</Link>;
  }

  const activeList = lists.find(list => list.id === selected);
  const alreadyAdded = Boolean(activeList?.items.some(item => String(item.id) === String(anime?.id)));

  const toggle = () => {
    if (!selected || !anime?.id) return;
    toggleAnimeInCustomList(selected, anime);
    const list = readCustomLists().find(item => item.id === selected);
    const added = list?.items.some(item => String(item.id) === String(anime.id));
    setMessage(added ? 'Added to ' + list.name + '.' : 'Removed from ' + list.name + '.');
  };

  return <div className="ad-custom-list-actions">
    <label htmlFor="ad-add-to-list">Custom list</label>
    <select id="ad-add-to-list" value={selected} onChange={event => { setSelected(event.target.value); setMessage(''); }}>
      {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
    </select>
    <button type="button" onClick={toggle} disabled={!activeList}>
      {alreadyAdded ? '✓ In this list' : '+ Add to list'}
    </button>
    <Link to="/lists" aria-label="Manage custom lists">Manage</Link>
    {message && <small role="status">{message}</small>}
  </div>;
}
