import React,{useEffect,useState} from 'react';
import {isSupabaseConfigured,supabase} from '../lib/supabase.js';

export default function AuthControl(){
 const [open,setOpen]=useState(false);
 const [mode,setMode]=useState('login');
 const [session,setSession]=useState(null);
 const [profile,setProfile]=useState(null);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [username,setUsername]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [bio,setBio]=useState('');
 const [favoriteAnime,setFavoriteAnime]=useState('');
 const [isPublic,setIsPublic]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(false);

 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  supabase.auth.getSession().then(({data})=>{if(active)setSession(data.session)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setMessage('');setError('')});
  return()=>{active=false;subscription.unsubscribe()};
 },[]);

 useEffect(()=>{
  if(!session?.user||!supabase){setProfile(null);return}
  let active=true;
  supabase.from('profiles').select('username,display_name,bio,favorite_anime,is_public').eq('id',session.user.id).single()
   .then(({data,error:loadError})=>{
    if(!active)return;
    if(loadError){setError('Your account is signed in, but its profile could not be loaded. '+loadError.message);return}
    setProfile(data);setUsername(data.username||'');setDisplayName(data.display_name||'');setBio(data.bio||'');setFavoriteAnime(data.favorite_anime||'');setIsPublic(Boolean(data.is_public));
   });
  return()=>{active=false};
 },[session?.user?.id]);

 const submit=async event=>{
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(mode==='signup'){
    const {data,error:authError}=await supabase.auth.signUp({email:email.trim(),password});
    if(authError)throw authError;
    if(data.session)setMessage('Your AniOrbit account is ready. You can edit your profile below.');
    else setMessage('Check your email for the confirmation link, then return here to sign in.');
   }else if(mode==='login'){
    const {error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(authError)throw authError;
    setMessage('You are signed in.');
   }else{
    const {error:authError}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+window.location.pathname});
    if(authError)throw authError;
    setMessage('If an account exists for that email, a password reset link has been sent.');
   }
  }catch(e){setError(e.message||'Authentication could not be completed.')}
  finally{setBusy(false)}
 };

 const saveProfile=async event=>{
  event.preventDefault();if(!session?.user)return;
  setBusy(true);setError('');setMessage('');
  try{
   const cleanUsername=username.trim();
   if(!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername))throw new Error('Username must be 3–24 characters and use only letters, numbers, or underscores.');
   const payload={username:cleanUsername,display_name:displayName.trim().slice(0,40),bio:bio.trim().slice(0,240),favorite_anime:favoriteAnime.trim().slice(0,120)||null,is_public:isPublic,updated_at:new Date().toISOString()};
   const {data,error:saveError}=await supabase.from('profiles').update(payload).eq('id',session.user.id).select('username,display_name,bio,favorite_anime,is_public').single();
   if(saveError)throw saveError;
   setProfile(data);setEditing(false);setMessage('Profile saved.');
  }catch(e){setError(e.message||'Your profile could not be saved.')}
  finally{setBusy(false)}
 };

 const signOut=async()=>{setBusy(true);setError('');try{const {error:signOutError}=await supabase.auth.signOut();if(signOutError)throw signOutError;setProfile(null);setMessage('You are signed out.')}catch(e){setError(e.message||'Could not sign out.')}finally{setBusy(false)}};

 if(!isSupabaseConfigured)return <span className="ad-auth-unavailable" title="Supabase configuration is missing">Accounts unavailable</span>;
 return <>
  <button type="button" className="ad-settings-trigger ad-account-trigger" onClick={()=>{setOpen(true);setError('');setMessage('')}}>{session?.user?(profile?.display_name||profile?.username||'Account'):'Sign in'}</button>
  {open&&<div className="ad-auth-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
   <section className="ad-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-auth-title">
    <div className="ad-auth-heading"><div><span className="ad-auth-kicker">YOUR ANIORBIT ACCOUNT</span><h2 id="ad-auth-title">{session?.user?'Your account':mode==='signup'?'Create your account':mode==='reset'?'Reset password':'Welcome back'}</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close account dialog">×</button></div>
    {session?.user?<>
     <div className="ad-auth-signed-in"><span className="ad-auth-avatar">{(profile?.display_name||profile?.username||session.user.email||'A').slice(0,1).toUpperCase()}</span><div><b>{profile?.display_name||profile?.username||'AniOrbit member'}</b><small>{session.user.email}</small></div></div>
     {profile&&<form className="ad-profile-form" onSubmit={saveProfile}>
      <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} required disabled={!editing}/></label>
      <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={40} disabled={!editing}/></label>
      <label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={240} rows={3} disabled={!editing}/></label>
      <label>Favourite anime<input value={favoriteAnime} onChange={e=>setFavoriteAnime(e.target.value)} maxLength={120} disabled={!editing}/></label>
      <label className="ad-profile-privacy"><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} disabled={!editing}/> Allow my profile to be visible to other signed-in members</label>
      <p className="ad-auth-help">Your profile is private by default. Don't add your real name, school, location, or other personal details.</p>
      {editing?<div className="ad-auth-actions"><button type="submit" disabled={busy}>{busy?'Saving…':'Save profile'}</button><button type="button" className="secondary" onClick={()=>{setEditing(false);if(profile){setUsername(profile.username||'');setDisplayName(profile.display_name||'');setBio(profile.bio||'');setFavoriteAnime(profile.favorite_anime||'');setIsPublic(Boolean(profile.is_public))}}}>Cancel</button></div>:<button type="button" className="ad-auth-primary" onClick={()=>setEditing(true)}>Edit profile</button>}
     </form>}
     <button type="button" className="ad-auth-signout" onClick={signOut} disabled={busy}>Sign out</button>
    </>:<>
     <div className="ad-auth-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');setMessage('');setError('')}}>Sign in</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setMessage('');setError('')}}>Create account</button></div>
     <form className="ad-profile-form" onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      {mode!=='reset'&&<label>Password<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></label>}
      {mode==='signup'&&<p className="ad-auth-help">Use a password of at least 8 characters. Your public profile starts private; you can choose a username after signing in.</p>}
      <button type="submit" className="ad-auth-primary" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button>
     </form>
     {mode==='login'&&<button type="button" className="ad-auth-text-button" onClick={()=>{setMode('reset');setMessage('');setError('')}}>Forgot password?</button>}
     {mode==='reset'&&<button type="button" className="ad-auth-text-button" onClick={()=>{setMode('login');setMessage('');setError('')}}>Back to sign in</button>}
    </>}
    {message&&<p className="ad-auth-message" role="status">{message}</p>}
    {error&&<p className="ad-auth-error" role="alert">{error}</p>}
   </section>
  </div>}
 </>;
}
