import React,{useEffect,useState} from 'react';
import {isSupabaseConfigured,supabase} from '../lib/supabase.js';

export default function PresenceIndicator(){
 const [session,setSession]=useState(null);
 const [optedIn,setOptedIn]=useState(false);
 const [online,setOnline]=useState(0);

 useEffect(()=>{
  if(!isSupabaseConfigured||!supabase)return;
  let active=true;
  supabase.auth.getSession().then(({data})=>{if(active)setSession(data.session)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
  return()=>{active=false;subscription.unsubscribe()};
 },[]);

 useEffect(()=>{
  if(!session?.user){setOptedIn(false);return}
  let active=true;
  const loadPreference=async()=>{
   const {data,error}=await supabase.from('profiles').select('show_online').eq('id',session.user.id).maybeSingle();
   if(active&&!error)setOptedIn(Boolean(data?.show_online));
  };
  loadPreference();
  window.addEventListener('aniorbit-presence-setting-change',loadPreference);
  return()=>{active=false;window.removeEventListener('aniorbit-presence-setting-change',loadPreference)};
 },[session?.user?.id]);

 useEffect(()=>{
  if(!isSupabaseConfigured||!supabase)return;
  const key=globalThis.crypto?.randomUUID?.()||('guest-'+Math.random().toString(36).slice(2));
  const channel=supabase.channel('aniorbit-online-members',{config:{presence:{key}}});
  const updateCount=()=>{
   const state=channel.presenceState();
   const count=Object.values(state).flat().filter(entry=>entry?.online===true).length;
   setOnline(count);
  };
  channel.on('presence',{event:'sync'},updateCount);
  channel.subscribe(async status=>{
   if(status==='SUBSCRIBED'){
    if(optedIn)await channel.track({online:true});
    updateCount();
   }
  });
  return()=>{
   channel.untrack().catch(()=>{});
   supabase.removeChannel(channel);
  };
 },[optedIn]);

 if(!isSupabaseConfigured)return null;
 return <span className="ad-presence" aria-live="polite"><i aria-hidden="true"/>{online} online</span>;
}
