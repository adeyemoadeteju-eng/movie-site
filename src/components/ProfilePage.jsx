import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

function activityText(item) {
  if (item.activity_type === 'watchlist') return 'added this anime to their watchlist';
  if (item.activity_type === 'episode_watched') return 'marked an episode as watched';
  return 'started watching';
}

export default function ProfilePage() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [viewerId, setViewerId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Profiles are currently unavailable.');
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      const currentViewer = sessionData.session?.user?.id || null;
      setViewerId(currentViewer);
      setSignedIn(Boolean(currentViewer));
      if (!currentViewer) {
        setError('Sign in to view community profiles.');
        setLoading(false);
        return;
      }

      const { data, error: profileError } = await supabase.from('profiles')
        .select('id,username,display_name,bio,favorite_anime,is_public,avatar_path,created_at')
        .eq('username', username).maybeSingle();
      if (!active) return;
      if (profileError || !data) {
        setError('This profile could not be found.');
        setLoading(false);
        return;
      }
      if (!data.is_public && data.id !== currentViewer) {
        setError('This member keeps their profile private.');
        setLoading(false);
        return;
      }
      setProfile(data);

      const [statsResult, followersResult, followingResult, relationResult, activityResult] = await Promise.all([
        supabase.from('profile_stats').select('watchlist_count,history_count,continue_count,episodes_watched_count,updated_at').eq('user_id', data.id).maybeSingle(),
        supabase.from('member_follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', data.id),
        supabase.from('member_follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', data.id),
        currentViewer !== data.id
          ? supabase.from('member_follows').select('follower_id').eq('follower_id', currentViewer).eq('following_id', data.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('member_activity').select('id,activity_type,anime_id,anime_title,anime_image,detail,created_at').eq('user_id', data.id).order('created_at', { ascending: false }).limit(8)
      ]);
      if (!active) return;
      setStats(statsResult.data || { watchlist_count: 0, history_count: 0, continue_count: 0, episodes_watched_count: 0 });
      setFollowersCount(Number(followersResult.count) || 0);
      setFollowingCount(Number(followingResult.count) || 0);
      setIsFollowing(Boolean(relationResult.data));
      setActivity(activityResult.data || []);
      if (data.avatar_path) {
        const { data: signed } = await supabase.storage.from('avatars').createSignedUrl(data.avatar_path, 3600);
        if (active) setAvatar(signed?.signedUrl || '');
      }
      if (active) setLoading(false);
    })().catch(reason => {
      if (active) {
        setError(reason.message || 'Could not load this profile.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    if (!profile?.id || !supabase) return;
    const refresh = async () => {
      const { data } = await supabase.from('profile_stats')
        .select('watchlist_count,history_count,continue_count,episodes_watched_count,updated_at')
        .eq('user_id', profile.id).maybeSingle();
      if (data) setStats(data);
    };
    window.addEventListener('aniorbit-profile-stats-updated', refresh);
    return () => window.removeEventListener('aniorbit-profile-stats-updated', refresh);
  }, [profile?.id]);

  const toggleFollow = async () => {
    if (!viewerId || !profile || followBusy) return;
    setFollowBusy(true);
    setFollowError('');
    try {
      const result = isFollowing
        ? await supabase.from('member_follows').delete().eq('follower_id', viewerId).eq('following_id', profile.id)
        : await supabase.from('member_follows').insert({ follower_id: viewerId, following_id: profile.id });
      if (result.error) throw result.error;
      setIsFollowing(!isFollowing);
      setFollowersCount(value => Math.max(0, value + (isFollowing ? -1 : 1)));
    } catch (reason) {
      setFollowError(reason.message || 'The follow setting could not be changed.');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) return <main className="ad-profile-page"><p>Loading member profile…</p></main>;
  if (error) return <main className="ad-profile-page"><Link to="/">← AniOrbit</Link><section className="ad-profile-card"><h1>Profile unavailable</h1><p>{error}</p>{!signedIn && <p><Link to="/">Return to AniOrbit and sign in using the account menu.</Link></p>}</section></main>;

  const name = profile.display_name || profile.username;
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'AniOrbit member';
  const values = [
    ['Episodes watched', stats?.episodes_watched_count ?? 0],
    ['Anime in history', stats?.history_count ?? 0],
    ['On watchlist', stats?.watchlist_count ?? 0],
    ['Currently watching', stats?.continue_count ?? 0]
  ];

  return <main className="ad-profile-page">
    <Link className="ad-profile-back" to="/community">← Back to Community</Link>
    <section className="ad-profile-card">
      <div className="ad-profile-hero">
        <div className="ad-profile-avatar">{avatar ? <img src={avatar} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="ad-profile-identity"><span className="ad-profile-kicker">ANIORBIT MEMBER</span><h1>{name}</h1><p>@{profile.username} · Joined {joined}</p></div>
      </div>
      <div className="ad-profile-social">
        <span><b>{followersCount.toLocaleString()}</b> Followers</span>
        <span><b>{followingCount.toLocaleString()}</b> Following</span>
        {viewerId && viewerId !== profile.id && profile.is_public && <button type="button" disabled={followBusy} onClick={toggleFollow}>{followBusy ? 'Saving…' : isFollowing ? '✓ Following' : '＋ Follow'}</button>}
      </div>
      {followError && <p className="ad-hub-error" role="alert">{followError}</p>}
      {profile.bio && <p className="ad-profile-bio">{profile.bio}</p>}
      {profile.favorite_anime && <p className="ad-profile-favourite"><span>FAVOURITE ANIME</span><b>{profile.favorite_anime}</b></p>}
      {activity.length > 0 && <section className="ad-profile-activity"><h2>Recent activity</h2>{activity.map(item => <Link key={item.id} to={'/anime/' + item.anime_id} className="ad-profile-activity-item">
        {item.anime_image ? <img src={item.anime_image} alt="" loading="lazy" /> : <span className="ad-list-no-image">AO</span>}
        <span><b>{item.anime_title}</b><small>{activityText(item)}{item.detail ? ' · ' + item.detail : ''}</small></span>
        <time>{new Date(item.created_at).toLocaleDateString()}</time>
      </Link>)}</section>}
      <div className="ad-profile-stats"><h2>Viewing statistics</h2><div>{values.map(([label, value]) => <article key={label}><strong>{Number(value).toLocaleString()}</strong><span>{label}</span></article>)}</div><small>Statistics update when this member uses AniOrbit while signed in.</small></div>
    </section>
  </main>;
}
