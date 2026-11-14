import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export default function NotificationBell() {
  const [userId, setUserId] = useState(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId || !supabase) { setUnread(0); return; }
    const { count, error } = await supabase.from('member_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);
    if (!error) setUnread(Number(count) || 0);
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user?.id || null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user?.id || null));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setUnread(0); return; }
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [userId, refresh]);

  if (!isSupabaseConfigured || !userId) return null;
  return <Link className="ad-notification-bell" to="/community?tab=notifications" aria-label={unread ? 'Community notifications, ' + unread + ' unread' : 'Community notifications'}>
    <span aria-hidden="true">♢</span><span>Inbox</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
  </Link>;
}
