import React, { useCallback, useEffect, useRef, useState } from 'react';
import { syncCloudLibrary } from '../lib/cloudLibrarySync.js';

const LIBRARY_EVENT = 'animedex-library-change';
const LISTS_EVENT = 'aniorbit-custom-lists-change';
const WATCHED_KEYS = new Set(['animedex-library-v1', 'aniorbit-custom-lists-v1']);

function messageFor(action) {
  if (action === 'uploaded') return 'This device’s library has been saved to your account.';
  if (action === 'merged') return 'Your cloud library and this device’s library have been combined.';
  if (action === 'downloaded') return 'Your latest cloud library is now on this device.';
  if (action === 'account-switched') return 'This account’s cloud library is loaded. The previous device library was kept separate.';
  return 'Your library is up to date.';
}

export default function CloudLibrarySync({ userId }) {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('Connecting to your private cloud library…');
  const [lastSynced, setLastSynced] = useState('');
  const running = useRef(false);
  const queued = useRef(false);
  const timer = useRef(null);
  const mounted = useRef(true);

  const syncNow = useCallback(async () => {
    if (!userId) return;
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    setMessage('Syncing your AniOrbit library…');
    try {
      const result = await syncCloudLibrary(userId);
      if (!mounted.current) return;
      setStatus('synced');
      setMessage(messageFor(result.action));
      setLastSynced(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (error) {
      if (!mounted.current) return;
      setStatus('error');
      setMessage((error?.message || 'Cloud sync could not be completed.') + ' Your local library is still available on this device.');
    } finally {
      running.current = false;
      if (queued.current && mounted.current) {
        queued.current = false;
        syncNow();
      }
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    void syncNow();

    const scheduleSync = () => {
      if (running.current) {
        queued.current = true;
        return;
      }
      setStatus('pending');
      setMessage('A library change was detected. Saving it to your account…');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { void syncNow(); }, 1100);
    };

    const onStorage = event => {
      if (!event.key || WATCHED_KEYS.has(event.key)) scheduleSync();
    };
    const onFocus = () => { void syncNow(); };
    window.addEventListener(LIBRARY_EVENT, scheduleSync);
    window.addEventListener(LISTS_EVENT, scheduleSync);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => { void syncNow(); }, 45000);

    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      window.clearInterval(interval);
      window.removeEventListener(LIBRARY_EVENT, scheduleSync);
      window.removeEventListener(LISTS_EVENT, scheduleSync);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [syncNow]);

  const label = status === 'syncing' || status === 'checking' ? 'Syncing'
    : status === 'pending' ? 'Changes waiting'
      : status === 'error' ? 'Sync paused'
        : 'Cloud sync on';

  return <section className={'ao-cloud-sync ao-cloud-sync-' + status} aria-label="Cloud library sync">
    <div className="ao-cloud-sync-top">
      <div>
        <span className="ao-cloud-sync-kicker">PRIVATE CLOUD LIBRARY</span>
        <h3>Cloud saves</h3>
      </div>
      <span className="ao-cloud-sync-status"><i aria-hidden="true"/>{label}</span>
    </div>
    <p className="ao-cloud-sync-message" role="status" aria-live="polite">{message}</p>
    <div className="ao-cloud-sync-bottom">
      <small>{lastSynced ? 'Last checked at ' + lastSynced : 'Watchlist, history, tracking, episode progress and custom lists'}</small>
      <button type="button" onClick={() => { window.clearTimeout(timer.current); void syncNow(); }} disabled={status === 'syncing' || status === 'checking'}>
        {status === 'syncing' || status === 'checking' ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
    <p className="ao-cloud-sync-privacy">Only you can access this saved library through your account. It is not shown on your public profile.</p>
  </section>;
}
