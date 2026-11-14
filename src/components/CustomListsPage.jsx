import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customListsEventName, readCustomLists, removeAnimeFromCustomList, saveCustomLists } from '../lib/customLists.js';
import PageHeader from './PageHeader.jsx';

export default function CustomListsPage() {
  const [lists, setLists] = useState(() => readCustomLists());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setLists(readCustomLists());
    window.addEventListener(customListsEventName(), refresh);
    return () => window.removeEventListener(customListsEventName(), refresh);
  }, []);

  const createList = event => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 32) {
      setError('List names must be 2–32 characters.');
      return;
    }
    if (lists.length >= 12) {
      setError('You can create up to 12 custom lists.');
      return;
    }
    if (lists.some(list => list.name.toLowerCase() === cleanName.toLowerCase())) {
      setError('You already have a list with that name.');
      return;
    }
    const next = [{ id: globalThis.crypto?.randomUUID?.() || 'list-' + Date.now(), name: cleanName, description: description.trim().slice(0, 120), items: [], createdAt: new Date().toISOString() }, ...lists];
    saveCustomLists(next);
    setLists(next);
    setName('');
    setDescription('');
    setError('');
    setMessage('Your list was created.');
  };

  const deleteList = list => {
    if (!window.confirm('Delete "' + list.name + '" and all its saved anime?')) return;
    const next = lists.filter(item => item.id !== list.id);
    saveCustomLists(next);
    setLists(next);
    setMessage('List deleted.');
  };

  const removeItem = (list, item) => {
    const next = removeAnimeFromCustomList(list.id, item.id);
    setLists(next);
  };

  return <>
    <PageHeader/>
    <main className="ad-lists-page">
      <Link className="ad-profile-back" to="/">← Back to AniOrbit</Link>
      <div className="ad-page-title"><div><span>YOUR LIBRARY</span><h1>Custom anime lists</h1><p>Make collections for anything you want to keep together.</p></div><b>{lists.length}/12 lists</b></div>
      <form className="ad-list-create" onSubmit={createList}>
        <label>List name<input value={name} onChange={event => setName(event.target.value)} maxLength={32} minLength={2} placeholder="e.g. All-time favourites" required /></label>
        <label>Description <span>(optional)</span><input value={description} onChange={event => setDescription(event.target.value)} maxLength={120} placeholder="What is this collection for?" /></label>
        <button type="submit" disabled={lists.length >= 12}>Create list</button>
      </form>
      {error && <p className="ad-hub-error" role="alert">{error}</p>}
      {message && <p className="ad-hub-message" role="status">{message}</p>}
      {lists.length ? <div className="ad-custom-lists-grid">{lists.map(list => <section className="ad-custom-list-card" key={list.id}>
        <div className="ad-custom-list-heading"><div><h2>{list.name}</h2><p>{list.description || 'Your personal collection'}</p><small>{list.items.length} anime</small></div><button type="button" onClick={() => deleteList(list)} aria-label={'Delete ' + list.name}>×</button></div>
        {list.items.length ? <div className="ad-custom-list-items">{list.items.map(item => <article key={item.id}>
          <Link to={'/anime/' + item.id}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="ad-list-no-image">AO</span>}<span><b>{item.title}</b><small>{[item.format, item.seasonYear].filter(Boolean).join(' · ')}</small></span></Link>
          <button type="button" onClick={() => removeItem(list, item)} aria-label={'Remove ' + item.title + ' from ' + list.name}>×</button>
        </article>)}</div> : <p className="ad-custom-list-empty">This list is empty. Open an anime page and use “Add to list” to save something here.</p>}
      </section>)}</div> : <section className="ad-custom-list-empty-state"><h2>Your collections start here</h2><p>Create your first list, then add anime from its detail page.</p></section>}
      <p className="ad-local-storage-note">Custom lists are saved in this browser, just like your watchlist. They are not public or synced between devices.</p>
    </main>
  </>;
}
