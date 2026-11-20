import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';
import { readCustomLists, customListsEventName } from '../lib/customLists.js';
import PageHeader from './PageHeader.jsx';

function safeItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => item?.id && item?.title && !item.isAdult)
    .slice(0, 40).map(item => ({
      id: String(item.id).slice(0, 80),
      title: String(item.title).slice(0, 180),
      image: /^https:\/\//i.test(String(item.image || '')) ? String(item.image).slice(0, 2048) : '',
      format: String(item.format || 'TV').slice(0, 20),
      seasonYear: Number(item.seasonYear) || null,
      genres: Array.isArray(item.genres) ? item.genres.filter(value => typeof value === 'string').slice(0, 8) : []
    }));
}

export default function SharedListsPage() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [localLists, setLocalLists] = useState(readCustomLists);
  const [sharedLists, setSharedLists] = useState([]);
  const [shared, setShared] = useState(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async userId => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      if (id) {
        const { data, error: readError } = await supabase.from('shared_anime_lists')
          .select('id,owner_id,name,description,items,created_at,is_public')
          .eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!data || (!data.is_public && data.owner_id !== userId)) throw new Error('This shared list is unavailable or private.');
        setShared(data);
      } else {
        const { data, error: readError } = await supabase.from('shared_anime_lists')
          .select('id,name,description,items,created_at,is_public')
          .eq('owner_id', userId).order('created_at', { ascending: false }).limit(40);
        if (readError) throw readError;
        setSharedLists(data || []);
      }
    } catch (reason) {
      setError(reason.message || 'Shared lists could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session || null);
      await load(data.session?.user?.id);
    };
    start().catch(reason => {
      if (active) { setError(reason.message || 'Account session could not be checked.'); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      load(next?.user?.id);
    });
    const refresh = () => setLocalLists(readCustomLists());
    window.addEventListener(customListsEventName(), refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(customListsEventName(), refresh);
    };
  }, [load]);

  const createShare = async event => {
    event.preventDefault();
    if (!session?.user || busy) return;
    const list = localLists.find(item => item.id === selected);
    if (!list) { setError('Choose one of your local collections first.'); return; }
    const items = safeItems(list.items);
    if (!items.length) { setError('Add some non-adult anime to this collection before sharing it.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data, error: insertError } = await supabase.from('shared_anime_lists')
        .insert({
          owner_id: session.user.id,
          name: String(list.name).slice(0, 48),
          description: String(list.description || '').slice(0, 240),
          items,
          is_public: true
        }).select('id').single();
      if (insertError) throw insertError;
      setMessage('Your list is now shareable.');
      setSelected('');
      await load(session.user.id);
      const url = window.location.origin + window.location.pathname + '#/shared-lists/' + data.id;
      try { await navigator.clipboard.writeText(url); setMessage('Share link copied to your clipboard.'); }
      catch { setMessage('Your share link is ready below.'); }
    } catch (reason) {
      setError(reason.message || 'Your list could not be shared.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async listId => {
    const url = window.location.origin + window.location.pathname + '#/shared-lists/' + listId;
    try { await navigator.clipboard.writeText(url); setMessage('Share link copied to your clipboard.'); }
    catch { setMessage(url); }
  };

  const removeShare = async listId => {
    if (!session?.user || !window.confirm('Stop sharing this collection?')) return;
    setBusy(true);
    setError('');
    try {
      const { error: deleteError } = await supabase.from('shared_anime_lists')
        .delete().eq('id', listId).eq('owner_id', session.user.id);
      if (deleteError) throw deleteError;
      setSharedLists(current => current.filter(item => item.id !== listId));
      setMessage('Sharing stopped.');
    } catch (reason) {
      setError(reason.message || 'The share could not be removed.');
    } finally { setBusy(false); }
  };

  if (!isSupabaseConfigured) return <><PageHeader/><main className="ao-shared-page"><h1>Shared collections</h1><p>Shared collections are not configured on this build.</p></main></>;
  if (!session?.user) return <><PageHeader/><main className="ao-shared-page"><Link className="ao-profile-back" to="/">← Back to AniOrbit</Link><section className="ao-shared-panel"><h1>Shared collections</h1><p>Sign in to create, view and manage shared anime collections.</p></section></main></>;

  if (id) return <><PageHeader/><main className="ao-shared-page"><Link className="ao-profile-back" to="/shared-lists">← Your shared collections</Link>
    {loading ? <p className="ao-shared-note">Loading shared collection…</p> : error ? <p className="ao-shared-error" role="alert">{error}</p> : shared && <section className="ao-shared-panel">
      <span className="ao-shared-kicker">ANIORBIT COMMUNITY COLLECTION</span><h1>{shared.name}</h1><p>{shared.description || 'A collection shared with the AniOrbit community.'}</p>
      <div className="ao-shared-items">{safeItems(shared.items).map(item => <Link to={'/anime/' + item.id} key={item.id}><span>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i>AO</i>}</span><b>{item.title}</b><small>{[item.format, item.seasonYear].filter(Boolean).join(' · ')}</small></Link>)}</div>
      {!safeItems(shared.items).length && <p className="ao-shared-note">This collection has no available titles.</p>}
    </section>}
  </main></>;

  return <><PageHeader/><main className="ao-shared-page"><Link className="ao-profile-back" to="/lists">← Back to My Lists</Link>
    <div className="ao-page-title"><div><span>SHARE YOUR PICKS</span><h1>Shared collections</h1><p>Publish a copy of one of your local lists so signed-in members can explore it.</p></div></div>
    <section className="ao-shared-panel">
      <h2>Create a share link</h2>
      {!localLists.length ? <p className="ao-shared-note">Create a collection in My Lists first.</p> : <form className="ao-shared-form" onSubmit={createShare}>
        <label>Choose a collection<select value={selected} onChange={event => setSelected(event.target.value)} required><option value="">Select a local list…</option>{localLists.map(list => <option value={list.id} key={list.id}>{list.name} ({safeItems(list.items).length} shareable anime)</option>)}</select></label>
        <button type="submit" disabled={busy || !selected}>{busy ? 'Sharing…' : 'Create share link'}</button>
      </form>}
      <p className="ao-shared-note">A share is a snapshot. Changes to your private local list will not alter an already shared copy. Adult-tagged titles are excluded.</p>
    </section>
    {error && <p className="ao-shared-error" role="alert">{error}</p>}
    {message && <p className="ao-shared-message" role="status">{message}</p>}
    <section className="ao-shared-panel"><h2>Your shared collections</h2>
      {loading ? <p className="ao-shared-note">Loading your collections…</p> : sharedLists.length ? <div className="ao-shared-own-list">{sharedLists.map(list => <article key={list.id}>
        <div><b>{list.name}</b><small>{safeItems(list.items).length} anime · {new Date(list.created_at).toLocaleDateString()}</small><Link to={'/shared-lists/' + list.id}>Open collection →</Link></div>
        <button type="button" onClick={() => copyLink(list.id)}>Copy link</button><button type="button" disabled={busy} onClick={() => removeShare(list.id)}>Stop sharing</button>
      </article>)}</div> : <p className="ao-shared-note">You have not shared a collection yet.</p>}
    </section>
  </main></>;
}
