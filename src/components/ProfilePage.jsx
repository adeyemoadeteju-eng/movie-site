import React,{useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {isSupabaseConfigured,supabase} from '../lib/supabase.js';

export default function ProfilePage(){
 const {username}=useParams();
 const [profile,setProfile]=useState(null);
 const [stats,setStats]=useState(null);
 const [avatar,setAvatar]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [signedIn,setSignedIn]=useState(false);

 useEffect(()=>{
  if(!isSupabaseConfigured){setError('Profiles are currently unavailable.');setLoading(false);return;}
  let active=true;
  (async()=>{
   const {data:sessionData}=await supabase.auth.getSession();
   if(!active)return;
   setSignedIn(Boolean(sessionData.session?.user));
   if(!sessionData.session?.user){setError('Sign in to view community profiles.');setLoading(false);return;}
   const {data,error:profileError}=await supabase.from('profiles')
    .select('id,username,display_name,bio,favorite_anime,is_public,avatar_path,created_at')
    .eq('username',username).maybeSingle();
   if(!active)return;
   if(profileError||!data){setError('This profile could not be found.');setLoading(false);return;}
   if(!data.is_public&&data.id!==sessionData.session.user.id){setError('This member keeps their profile private.');setLoading(false);return;}
   setProfile(data);
   const {data:statsData}=await supabase.from('profile_stats')
    .select('watchlist_count,history_count,continue_count,episodes_watched_count,updated_at')
    .eq('user_id',data.id).maybeSingle();
   if(active)setStats(statsData||{watchlist_count:0,history_count:0,continue_count:0,episodes_watched_count:0});
   if(data.avatar_path){
    const {data:signed}=await supabase.storage.from('avatars').createSignedUrl(data.avatar_path,3600);
    if(active)setAvatar(signed?.signedUrl||'');
   }
   if(active)setLoading(false);
  })().catch(e=>{if(active){setError(e.message||'Could not load this profile.');setLoading(false);}});
  return()=>{active=false;};
 },[username]);


 useEffect(()=>{
  if(!profile?.id||!supabase)return;
  const refresh=async()=>{
   const {data}=await supabase.from('profile_stats').select('watchlist_count,history_count,continue_count,episodes_watched_count,updated_at').eq('user_id',profile.id).maybeSingle();
   if(data)setStats(data);
  };
  window.addEventListener('aniorbit-profile-stats-updated',refresh);
  return()=>window.removeEventListener('aniorbit-profile-stats-updated',refresh);
 },[profile?.id]);

 if(loading)return <main className="ad-profile-page"><p>Loading member profile…</p></main>;
 if(error)return <main className="ad-profile-page"><Link to="/">← AniOrbit</Link><section className="ad-profile-card"><h1>Profile unavailable</h1><p>{error}</p>{!signedIn&&<p><Link to="/">Return to AniOrbit and sign in using the account menu.</Link></p>}</section></main>;
 const name=profile.display_name||profile.username;
 const joined=profile.created_at?new Date(profile.created_at).toLocaleDateString(undefined,{month:'long',year:'numeric'}):'AniOrbit member';
 const values=[
  ['Episodes watched',stats?.episodes_watched_count??0],
  ['Anime in history',stats?.history_count??0],
  ['On watchlist',stats?.watchlist_count??0],
  ['Currently watching',stats?.continue_count??0]
 ];
 return <main className="ad-profile-page">
  <Link className="ad-profile-back" to="/">← Back to AniOrbit</Link>
  <section className="ad-profile-card">
   <div className="ad-profile-hero">
    <div className="ad-profile-avatar">{avatar?<img src={avatar} alt=""/>:<span>{name.slice(0,1).toUpperCase()}</span>}</div>
    <div className="ad-profile-identity"><span className="ad-profile-kicker">ANIORBIT MEMBER</span><h1>{name}</h1><p>@{profile.username} · Joined {joined}</p></div>
   </div>
   {profile.bio&&<p className="ad-profile-bio">{profile.bio}</p>}
   {profile.favorite_anime&&<p className="ad-profile-favourite"><span>FAVOURITE ANIME</span><b>{profile.favorite_anime}</b></p>}
   <div className="ad-profile-stats"><h2>Viewing statistics</h2><div>{values.map(([label,value])=><article key={label}><strong>{Number(value).toLocaleString()}</strong><span>{label}</span></article>)}</div><small>Statistics update when this member uses AniOrbit while signed in.</small></div>
  </section>
 </main>;
}
