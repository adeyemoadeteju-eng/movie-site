import React,{useEffect,useState} from 'react';
import {isSupabaseConfigured,supabase} from '../lib/supabase.js';
import ModerationPanel from './ModerationPanel.jsx';

export default function AuthControl(){
 const [open,setOpen]=useState(false);
 const [mode,setMode]=useState('login');
 const [session,setSession]=useState(null);
 const [profile,setProfile]=useState(null);
 const [avatarUrl,setAvatarUrl]=useState('');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [username,setUsername]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [bio,setBio]=useState('');
 const [favoriteAnime,setFavoriteAnime]=useState('');
 const [isPublic,setIsPublic]=useState(false);
 const [showOnline,setShowOnline]=useState(false);
 const [isModerator,setIsModerator]=useState(false);
 const [blockedMembers,setBlockedMembers]=useState([]);
 const [resendAvailable,setResendAvailable]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(false);
 const [moderationOpen,setModerationOpen]=useState(false);

 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  supabase.auth.getSession().then(({data})=>{if(active)setSession(data.session)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{setSession(next);setMessage('');setError('');if(event==='PASSWORD_RECOVERY'){setRecoveryMode(true);setOpen(true)}});
  return()=>{active=false;subscription.unsubscribe()};
 },[]);

 useEffect(()=>{
  if(!session?.user||!supabase){setProfile(null);setAvatarUrl('');setIsModerator(false);setBlockedMembers([]);return}
  let active=true;
  supabase.from('profiles').select('username,display_name,bio,favorite_anime,is_public,avatar_path,show_online').eq('id',session.user.id).single()
   .then(async({data,error:loadError})=>{
    if(!active)return;
    if(loadError){setError('Your account is signed in, but its profile could not be loaded. '+loadError.message);return}
    setProfile(data);setUsername(data.username||'');setDisplayName(data.display_name||'');setBio(data.bio||'');setFavoriteAnime(data.favorite_anime||'');setIsPublic(Boolean(data.is_public));setShowOnline(Boolean(data.show_online));
    if(data.avatar_path){
     const {data:signed}=await supabase.storage.from('avatars').createSignedUrl(data.avatar_path,3600);
     if(active)setAvatarUrl(signed?.signedUrl||'');
    }else setAvatarUrl('');
   });
  supabase.from('user_blocks').select('blocked_id,blocked_username,created_at').eq('blocker_id',session.user.id).order('created_at',{ascending:false})
   .then(({data})=>{if(active)setBlockedMembers(data||[]);});
  supabase.rpc('is_community_moderator').then(({data})=>{if(active)setIsModerator(Boolean(data));});
  return()=>{active=false};
 },[session?.user?.id]);

 const submit=async event=>{
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   if(mode==='signup'){
    const {data,error:authError}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+window.location.pathname}});
    if(authError)throw authError;
    setResendAvailable(!data.session);
    if(data.session)setMessage('Your AniOrbit account is ready. You can edit your profile below.');
    else setMessage('Check your email for the confirmation link, then return here to sign in.');
   }else if(mode==='login'){
    setResendAvailable(false);
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


 const resendConfirmation=async()=>{
  if(!email.trim()){setError('Enter your email address first.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const {error:resendError}=await supabase.auth.resend({
    type:'signup',
    email:email.trim(),
    options:{emailRedirectTo:window.location.origin+window.location.pathname}
   });
   if(resendError)throw resendError;
   setMessage('A confirmation email has been requested. Check your inbox and spam folder. If it still does not arrive, the project may need a custom SMTP provider.');
  }catch(e){setError(e.message||'The confirmation email could not be requested.');}
  finally{setBusy(false);}
 };

 const updatePassword=async event=>{
  event.preventDefault();
  if(newPassword.length<8){setError('Your new password must be at least 8 characters.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const {error:updateError}=await supabase.auth.updateUser({password:newPassword});
   if(updateError)throw updateError;
   setRecoveryMode(false);setNewPassword('');setMessage('Your password has been updated.');
  }catch(e){setError(e.message||'Your password could not be updated.');}
  finally{setBusy(false);}
 };

 const saveProfile=async event=>{
  event.preventDefault();if(!session?.user)return;
  setBusy(true);setError('');setMessage('');
  try{
   const cleanUsername=username.trim();
   if(!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername))throw new Error('Username must be 3–24 characters and use only letters, numbers, or underscores.');
   const payload={username:cleanUsername,display_name:displayName.trim().slice(0,40),bio:bio.trim().slice(0,240),favorite_anime:favoriteAnime.trim().slice(0,120)||null,is_public:isPublic,show_online:showOnline,updated_at:new Date().toISOString()};
   const {data,error:saveError}=await supabase.from('profiles').update(payload).eq('id',session.user.id).select('username,display_name,bio,favorite_anime,is_public,avatar_path,show_online').single();
   if(saveError)throw saveError;
   setProfile(data);setEditing(false);window.dispatchEvent(new Event('aniorbit-presence-setting-change'));setMessage('Profile saved.');
  }catch(e){setError(e.message||'Your profile could not be saved.')}
  finally{setBusy(false)}
 };

 const uploadAvatar=async event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||!session?.user)return;
  const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if(!allowed[file.type]){setError('Choose a JPG, PNG, or WebP image.');return;}
  if(file.size>2*1024*1024){setError('Avatar images must be 2 MB or smaller.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const path=session.user.id+'/'+crypto.randomUUID()+'.'+allowed[file.type];
   const {error:uploadError}=await supabase.storage.from('avatars').upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:false});
   if(uploadError)throw uploadError;
   const {data,error:updateError}=await supabase.from('profiles').update({avatar_path:path,updated_at:new Date().toISOString()}).eq('id',session.user.id).select('username,display_name,bio,favorite_anime,is_public,avatar_path,show_online').single();
   if(updateError)throw updateError;
   setProfile(data);
   const {data:signed}=await supabase.storage.from('avatars').createSignedUrl(path,3600);
   setAvatarUrl(signed?.signedUrl||'');
   setMessage('Avatar updated.');
  }catch(e){setError(e.message||'The avatar could not be uploaded.');}
  finally{setBusy(false);}
 };

 const unblockMember=async member=>{
  setBusy(true);setError('');setMessage('');
  try{
   const {error:removeError}=await supabase.from('user_blocks').delete().eq('blocker_id',session.user.id).eq('blocked_id',member.blocked_id);
   if(removeError)throw removeError;
   setBlockedMembers(current=>current.filter(item=>item.blocked_id!==member.blocked_id));
   setMessage(member.blocked_username+' was unblocked.');
  }catch(e){setError(e.message||'The member could not be unblocked.');}
  finally{setBusy(false);}
 };
 const signOut=async()=>{setBusy(true);setError('');try{const {error:signOutError}=await supabase.auth.signOut();if(signOutError)throw signOutError;setProfile(null);setBlockedMembers([]);setMessage('You are signed out.')}catch(e){setError(e.message||'Could not sign out.')}finally{setBusy(false)}};

 if(!isSupabaseConfigured)return <span className="ad-auth-unavailable" title="Supabase configuration is missing">Accounts unavailable</span>;
 return <>
  <button type="button" className="ad-settings-trigger ad-account-trigger" onClick={()=>{setOpen(true);setError('');setMessage('')}} aria-label={session?.user?'Open your AniOrbit profile':'Sign in to AniOrbit'} title={session?.user?'Your account and profile settings':'Sign in'}>{session?.user?<><span className="ad-account-avatar">{avatarUrl?<img src={avatarUrl} alt="" />:(profile?.display_name||profile?.username||session.user.email||'A').slice(0,1).toUpperCase()}</span><span className="ad-account-name">{profile?.display_name||profile?.username||'Account'}</span></>:<><span className="ad-account-guest" aria-hidden="true">◉</span><span>Sign in</span></>}</button>
  {open&&<div className="ad-auth-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
   <section className="ad-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-auth-title">
    <div className="ad-auth-heading"><div><span className="ad-auth-kicker">YOUR ANIORBIT ACCOUNT</span><h2 id="ad-auth-title">{recoveryMode?'Choose a new password':session?.user?'Your account':mode==='signup'?'Create your account':mode==='reset'?'Reset password':'Welcome back'}</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close account dialog">×</button></div>
    {session?.user&&recoveryMode?<form className="ad-profile-form" onSubmit={updatePassword}>
     <label>New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event=>setNewPassword(event.target.value)} required/></label>
     <p className="ad-auth-help">Choose a new password with at least 8 characters.</p>
     <button type="submit" className="ad-auth-primary" disabled={busy}>{busy?'Updating…':'Update password'}</button>
    </form>:session?.user?<>
     <div className="ad-auth-signed-in"><span className="ad-auth-avatar">{avatarUrl?<img src={avatarUrl} alt="Your avatar"/>:(profile?.display_name||profile?.username||session.user.email||'A').slice(0,1).toUpperCase()}</span><div><b>{profile?.display_name||profile?.username||'AniOrbit member'}</b><small>{session.user.email}</small></div></div>
     {profile&&<form className="ad-profile-form" onSubmit={saveProfile}>
      <div className="ad-avatar-control"><label htmlFor="ad-avatar-upload">Profile avatar</label><input id="ad-avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={busy}/><small>JPG, PNG, or WebP · 2 MB max · visible to signed-in members when used in comments</small></div>
      <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} required disabled={!editing}/></label>
      <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={40} disabled={!editing}/></label>
      <label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={240} rows={3} disabled={!editing}/></label>
      <label>Favourite anime<input value={favoriteAnime} onChange={e=>setFavoriteAnime(e.target.value)} maxLength={120} disabled={!editing}/></label>
      <label className="ad-profile-privacy"><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} disabled={!editing}/> Allow my profile details to be visible to other signed-in members</label>
      <label className="ad-profile-privacy"><input type="checkbox" checked={showOnline} onChange={e=>setShowOnline(e.target.checked)} disabled={!editing}/> Include me in the anonymous online member count while I’m here</label>
      <p className="ad-auth-help">Your profile is private by default. The online count never shows names or last-seen times. Don't add your real name, school, location, or other personal details.</p>
      {editing?<div className="ad-auth-actions"><button type="submit" disabled={busy}>{busy?'Saving…':'Save profile'}</button><button type="button" className="secondary" onClick={()=>{setEditing(false);if(profile){setUsername(profile.username||'');setDisplayName(profile.display_name||'');setBio(profile.bio||'');setFavoriteAnime(profile.favorite_anime||'');setIsPublic(Boolean(profile.is_public));setShowOnline(Boolean(profile.show_online))}}}>Cancel</button></div>:<button type="button" className="ad-auth-primary" onClick={()=>setEditing(true)}>Edit profile</button>}
     </form>}
     {blockedMembers.length>0&&<div className="ad-blocked-list"><b>Blocked members</b>{blockedMembers.map(member=><div key={member.blocked_id}><span>{member.blocked_username||'AniOrbit member'}</span><button type="button" disabled={busy} onClick={()=>unblockMember(member)}>Unblock</button></div>)}</div>}
     {isModerator&&<button type="button" className="ad-auth-signout" onClick={()=>setModerationOpen(true)}>Open moderation queue</button>}
     <button type="button" className="ad-auth-signout" onClick={signOut} disabled={busy}>Sign out</button>
    </>:<>
     <div className="ad-auth-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');setMessage('');setError('')}}>Sign in</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setMessage('');setError('')}}>Create account</button></div>
     <form className="ad-profile-form" onSubmit={submit}>
      <label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      {mode!=='reset'&&<label>Password<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></label>}
      {mode==='signup'&&<p className="ad-auth-help">Use a password of at least 8 characters. Your public profile starts private; you can choose a username after signing in.</p>}
      <button type="submit" className="ad-auth-primary" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='reset'?'Send reset link':'Sign in'}</button>
     </form>
     {mode==='signup'&&resendAvailable&&<button type="button" className="ad-auth-text-button" onClick={resendConfirmation} disabled={busy}>Resend confirmation email</button>}
     {mode==='login'&&<button type="button" className="ad-auth-text-button" onClick={()=>{setMode('reset');setMessage('');setError('')}}>Forgot password?</button>}
     {mode==='reset'&&<button type="button" className="ad-auth-text-button" onClick={()=>{setMode('login');setMessage('');setError('')}}>Back to sign in</button>}
    </>}
    {message&&<p className="ad-auth-message" role="status">{message}</p>}
    {error&&<p className="ad-auth-error" role="alert">{error}</p>}
   </section>
  </div>}
  {moderationOpen&&<ModerationPanel onClose={()=>setModerationOpen(false)}/>}
 </>;
}
