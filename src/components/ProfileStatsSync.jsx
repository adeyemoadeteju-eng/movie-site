import {useEffect} from 'react';
import {supabase} from '../lib/supabase.js';

const LIBRARY_KEY='animedex-library-v1';
function readCounts(){
 try{
  const data=JSON.parse(localStorage.getItem(LIBRARY_KEY)||'{}');
  const history=Array.isArray(data.history)?data.history:[];
  const watchlist=Array.isArray(data.watchlist)?data.watchlist:[];
  const watched=data.watchedEpisodes&&typeof data.watchedEpisodes==='object'?data.watchedEpisodes:{};
  return {
   watchlist_count:watchlist.length,
   history_count:history.length,
   continue_count:history.filter(item=>item?.lastEpisode).length,
   episodes_watched_count:Object.values(watched).reduce((sum,items)=>sum+(Array.isArray(items)?new Set(items).size:0),0),
   updated_at:new Date().toISOString()
  };
 }catch{return {watchlist_count:0,history_count:0,continue_count:0,episodes_watched_count:0,updated_at:new Date().toISOString()};}
}
export default function ProfileStatsSync(){
 useEffect(()=>{
  if(!supabase)return;
  let userId=null,active=true,busy=false,queued=false;
  const sync=async()=>{
   if(!userId||busy)return;
   busy=true;
   try{const {error}=await supabase.from('profile_stats').upsert({user_id:userId,...readCounts()},{onConflict:'user_id'});if(error)console.warn('AniOrbit profile stats sync:',error.message);}
   finally{busy=false;if(queued){queued=false;sync();}}
  };
  const refresh=()=>{if(busy){queued=true;return;}sync();};
  supabase.auth.getSession().then(({data})=>{if(!active)return;userId=data.session?.user?.id||null;if(userId)refresh();});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{userId=session?.user?.id||null;if(userId)refresh();});
  window.addEventListener('animedex-library-change',refresh);
  window.addEventListener('storage',refresh);
  return()=>{active=false;subscription.unsubscribe();window.removeEventListener('animedex-library-change',refresh);window.removeEventListener('storage',refresh);};
 },[]);
 return null;
}
