import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';
import PageHeader from './PageHeader.jsx';

const TABS = [
  ['feed', 'Activity feed'],
  ['members', 'Find members'],
  ['notifications', 'Notifications']
];

function memberName(profile) {
  return profile?.display_name || profile?.username || 'AniOrbit member';
}

function activityLabel(item) {
  if (item.activity_type === 'watchlist') return 'added an anime to their watchlist';
  if (item.activity_type === 'episode_watched') return 'marked an episode as watched';
  return 'started watching';
}

function notificationLabel(item) {
  if (item.notification_type === 'new_follower') return 'started following you';
  if (item.notification_type === 'comment_liked') return 'liked your comment';
  return 'interacted with you';
}

export default function CommunityHub() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'feed';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [members, setMembers] = useState({});
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [feed, setFeed] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [avatarUrls, setAvatarUrls] = useState({});
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const load = useCallback(async () => {
    if (!session?.user || !supabase) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const uid = session.user.id;
      const [followingResult, followersResult, suggestionsResult, notificationResult] = await Promise.all([
        supabase.from('member_follows').select('following_id,created_at').eq('follower_id', uid).order('created_at', { ascending: false }),
        supabase.from('member_follows').select('follower_id,created_at').eq('following_id', uid).order('created_at', { ascending: false }),
        supabase.from('profiles').select('id,username,display_name,bio,avatar_path,is_public').eq('is_public', true).neq('id', uid).order('created_at', { ascending: false }).limit(40),
        supabase.from('member_notifications').select('id,actor_id,notification_type,reference_id,episode_number,created_at,read_at').eq('recipient_id', uid).order('created_at', { ascending: false }).limit(40)
      ]);
      for (const result of [followingResult, followersResult, suggestionsResult, notificationResult]) {
        if (result.error) throw result.error;
      }
      const followingRows = followingResult.data || [];
      const followerRows = followersResult.data || [];
      const suggestionRows = suggestionsResult.data || [];
      const notificationRows = notificationResult.data || [];
      const followingIds = [...new Set(followingRows.map(row => row.following_id))];
      const followerIds = [...new Set(followerRows.map(row => row.follower_id))];
      const feedResult = followingIds.length
        ? await supabase.from('member_activity').select('id,user_id,activity_type,anime_id,anime_title,anime_image,detail,created_at').in('user_id', followingIds).order('created_at', { ascending: false }).limit(50)
        : { data: [], error: null };
      if (feedResult.error) throw feedResult.error;
      const feedRows = feedResult.data || [];
      const allIds = [...new Set([
        ...followingIds, ...followerIds, ...suggestionRows.map(row => row.id),
        ...notificationRows.map(row => row.actor_id).filter(Boolean), ...feedRows.map(row => row.user_id)
      ])];
      const profileResult = allIds.length
        ? await supabase.from('profiles').select('id,username,display_name,bio,avatar_path,is_public').in('id', allIds)
        : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      const profileMap = Object.fromEntries((profileResult.data || []).map(profile => [profile.id, profile]));
      const visibleFollowing = followingIds.map(id => profileMap[id]).filter(Boolean);
      const visibleFollowers = followerIds.map(id => profileMap[id]).filter(Boolean);
      const followedSet = new Set(followingIds);
      const visibleSuggestions = suggestionRows.filter(profile => !followedSet.has(profile.id));
      const uniquePaths = [...new Set((profileResult.data || []).map(profile => profile.avatar_path).filter(Boolean))];
      const signed = await Promise.all(uniquePaths.map(async path => {
        const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
        return [path, data?.signedUrl || ''];
      }));
      setMembers(profileMap);
      setFollowing(visibleFollowing);
      setFollowers(visibleFollowers);
      setSuggestions(visibleSuggestions);
      setFeed(feedRows);
      setNotifications(notificationRows);
      setAvatarUrls(Object.fromEntries(signed));
    } catch (reason) {
      setError(reason.message || 'The community page could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => { if (session?.user) load(); else setLoading(false); }, [session?.user?.id, load]);

  const changeTab = next => setParams(next === 'feed' ? {} : { tab: next });
  const follow = async profile => {
    if (!session?.user || busyId) return;
    setBusyId(profile.id);
    setError('');
    setMessage('');
    try {
      const { error: followError } = await supabase.from('member_follows').insert({ follower_id: session.user.id, following_id: profile.id });
      if (followError) throw followError;
      setMessage('You are now following ' + memberName(profile) + '.');
      await load();
    } catch (reason) {
      setError(reason.code === '23505' ? 'You already follow this member.' : reason.message || 'Could not follow this member.');
    } finally {
      setBusyId('');
    }
  };

  const unfollow = async profile => {
    if (!session?.user || busyId) return;
    setBusyId(profile.id);
    setError('');
    try {
      const { error: removeError } = await supabase.from('member_follows').delete().eq('follower_id', session.user.id).eq('following_id', profile.id);
      if (removeError) throw removeError;
      setMessage('You unfollowed ' + memberName(profile) + '.');
      await load();
    } catch (reason) {
      setError(reason.message || 'Could not unfollow this member.');
    } finally {
      setBusyId('');
    }
  };

  const markRead = async id => {
    const { error: updateError } = await supabase.from('member_notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (updateError) setError(updateError.message || 'Could not mark notification as read.');
    else setNotifications(current => current.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  };

  const markAllRead = async () => {
    if (!session?.user) return;
    const { error: updateError } = await supabase.from('member_notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', session.user.id).is('read_at', null);
    if (updateError) setError(updateError.message || 'Could not update notifications.');
    else setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  };

  const visibleSuggestions = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    return term ? suggestions.filter(profile => (profile.username || '').toLowerCase().includes(term) || memberName(profile).toLowerCase().includes(term)) : suggestions;
  }, [suggestions, memberSearch]);

  if (!isSupabaseConfigured) return <main className="ad-community-hub"><section className="ad-community-card"><h1>Community</h1><p>Community accounts are not configured on this build.</p></section></main>;
  if (!session?.user) return <main className="ad-community-hub"><section className="ad-community-card"><span className="ad-hub-kicker">ANIORBIT COMMUNITY</span><h1>Meet other anime fans</h1><p>Sign in to follow members, see their public activity and receive notifications.</p><Link className="ad-hub-primary" to="/">Return to AniOrbit and sign in</Link></section></main>;

  const unread = notifications.filter(item => !item.read_at).length;
  const memberCard = profile => <article className="ad-hub-member" key={profile.id}>
    <Link to={'/user/' + encodeURIComponent(profile.username)} className="ad-hub-member-main">
      <span className="ad-hub-avatar">{profile.avatar_path && avatarUrls[profile.avatar_path] ? <img src={avatarUrls[profile.avatar_path]} alt="" /> : memberName(profile).slice(0, 1).toUpperCase()}</span>
      <span><b>{memberName(profile)}</b><small>@{profile.username}</small><em>{profile.bio || 'AniOrbit member'}</em></span>
    </Link>
    {following.some(item => item.id === profile.id)
      ? <button type="button" className="secondary" disabled={busyId === profile.id} onClick={() => unfollow(profile)}>{busyId === profile.id ? '…' : 'Following'}</button>
      : <button type="button" disabled={busyId === profile.id} onClick={() => follow(profile)}>{busyId === profile.id ? '…' : '＋ Follow'}</button>}
  </article>;

  return <>
    <PageHeader/>
    <main className="ad-community-hub">
      <div className="ad-hub-title"><div><span className="ad-hub-kicker">ANIORBIT COMMUNITY</span><h1>Your anime circle</h1><p>Follow members, discover what they are watching and keep up with interactions.</p></div><Link className="ad-hub-profile-link" to="/">← Discover anime</Link></div>
      <div className="ad-hub-stats"><article><b>{following.length}</b><span>Following</span></article><article><b>{followers.length}</b><span>Followers shown</span></article><article><b>{unread}</b><span>Unread</span></article></div>
      <div className="ad-hub-tabs" role="tablist" aria-label="Community sections">
        {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => changeTab(key)}>{label}{key === 'notifications' && unread > 0 ? ' (' + unread + ')' : ''}</button>)}
      </div>
      {error && <p className="ad-hub-error" role="alert">{error}</p>}
      {message && <p className="ad-hub-message" role="status">{message}</p>}
      {loading ? <p className="ad-hub-empty">Loading your community…</p> : tab === 'feed' ? <>
        {feed.length ? <div className="ad-hub-feed">{feed.map(item => {
          const profile = members[item.user_id];
          return <article className="ad-hub-feed-item" key={item.id}>
            <Link to={'/user/' + encodeURIComponent(profile?.username || '')} className="ad-hub-avatar">{profile?.avatar_path && avatarUrls[profile.avatar_path] ? <img src={avatarUrls[profile.avatar_path]} alt="" /> : memberName(profile).slice(0, 1).toUpperCase()}</Link>
            <div><p><Link to={'/user/' + encodeURIComponent(profile?.username || '')}>{memberName(profile)}</Link> {activityLabel(item)}</p><Link className="ad-hub-feed-anime" to={'/anime/' + item.anime_id}>{item.anime_image ? <img src={item.anime_image} alt="" loading="lazy" /> : <span>AO</span>}<span><b>{item.anime_title}</b><small>{item.detail || 'View anime'}</small></span></Link><time>{new Date(item.created_at).toLocaleString()}</time></div>
          </article>;
        })}</div> : <section className="ad-hub-empty-card"><h2>Your feed starts with a follow</h2><p>Follow public members to see anime they add, start watching or mark as watched.</p><button type="button" onClick={() => changeTab('members')}>Find members</button></section>}
      </> : tab === 'members' ? <>
        <label className="ad-hub-search">Find members<input type="search" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Search visible usernames or display names…" /></label>
        <section className="ad-hub-member-section"><div className="ad-hub-section-title"><h2>People you follow</h2><span>{following.length}</span></div>{following.length ? following.map(profile => memberCard(profile)) : <p className="ad-hub-empty">You are not following anyone yet.</p>}</section>
        <section className="ad-hub-member-section"><div className="ad-hub-section-title"><h2>Followers</h2><span>{followers.length}</span></div>{followers.length ? followers.map(profile => memberCard(profile)) : <p className="ad-hub-empty">No visible followers yet.</p>}</section>
        <section className="ad-hub-member-section"><div className="ad-hub-section-title"><h2>Discover members</h2><span>{visibleSuggestions.length}</span></div>{visibleSuggestions.length ? visibleSuggestions.map(profile => memberCard(profile)) : <p className="ad-hub-empty">No matching public profiles were found.</p>}</section>
      </> : <>
        <div className="ad-hub-section-title"><h2>Your inbox</h2>{unread > 0 && <button type="button" onClick={markAllRead}>Mark all as read</button>}</div>
        {notifications.length ? <div className="ad-hub-notifications">{notifications.map(item => {
          const profile = item.actor_id ? members[item.actor_id] : null;
          const target = item.notification_type === 'comment_liked' && item.reference_id ? '/anime/' + item.reference_id : profile?.username ? '/user/' + encodeURIComponent(profile.username) : '/community';
          return <article className={!item.read_at ? 'unread' : ''} key={item.id}>
            <span className="ad-hub-avatar">{profile?.avatar_path && avatarUrls[profile.avatar_path] ? <img src={avatarUrls[profile.avatar_path]} alt="" /> : memberName(profile).slice(0, 1).toUpperCase()}</span>
            <div><p><b>{memberName(profile)}</b> {notificationLabel(item)}{item.notification_type === 'comment_liked' ? ' on ' + (item.episode_number ? 'episode ' + item.episode_number : 'an anime discussion') : ''}.</p><time>{new Date(item.created_at).toLocaleString()}</time></div>
            <Link to={target} onClick={() => !item.read_at && markRead(item.id)}>Open</Link>
          </article>;
        })}</div> : <p className="ad-hub-empty">No notifications yet. New followers and likes on your comments will appear here.</p>}
      </>}
      <p className="ad-hub-privacy-note">Only public profiles and activity are shown here. Private profile details stay hidden. You can change your profile visibility in Account settings.</p>
    </main>
  </>;
}
