import React,{useEffect,useMemo,useRef,useState} from 'react';
import {HashRouter,Link,Route,Routes,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import AuthControl from './components/AuthControl.jsx';
import CommunitySection from './components/CommunitySection.jsx';
import PresenceIndicator from './components/PresenceIndicator.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import ProfileStatsSync from './components/ProfileStatsSync.jsx';
import CommunityHub from './components/CommunityHub.jsx';
import CustomListsPage from './components/CustomListsPage.jsx';
import CustomListActions from './components/CustomListActions.jsx';
import SchedulePage from './components/SchedulePage.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import TrackingPage from './components/TrackingPage.jsx';

const API=(import.meta.env.VITE_KUHI_API_URL||import.meta.env.VITE_ANIME_API_URL||'https://anime-api-jqpp.onrender.com').replace(/\/+$/,'');
const ANIVEXA_API=(import.meta.env.VITE_ANIVEXA_API_URL||'https://anivexa-api-ypbr.onrender.com').replace(/\/+$/,'');
const ANIVEXA_PROVIDER_ORDER=['reanime','anikoto','animegg','anizone','aniwaves','kaa','senshi','animedunya','animeonsen','anipm','mkissa','animenosub'];
const API_WARMUP_KEY='aniorbit-api-warmup-v1';
const API_WARMUP_INTERVAL=20*60*1000;
const API_CACHE_KEY='animedex-api-cache-v1';
const API_CACHE=new Map();
const API_IN_FLIGHT=new Map();

function apiCacheTtl(path){
 if(path.startsWith('/anime/dub-finder/'))return 6*60*60*1000;
 if(path==='/anime/home')return 2*60*1000;
 if(path.startsWith('/anime/info/'))return 15*60*1000;
 if(path.startsWith('/anime/search?'))return 90*1000;
 if(path.startsWith('/anime/filter?'))return 3*60*1000;
 if(path.startsWith('/anime/schedule?'))return 60*1000;
 if(path==='/anime/genres')return 24*60*60*1000;
 return 0;
}
function readApiCache(path){
 const memory=API_CACHE.get(path);
 if(memory)return memory;
 try{
  const stored=JSON.parse(sessionStorage.getItem(API_CACHE_KEY)||'{}');
  const entry=stored[path];
  if(entry&&entry.data!==undefined){API_CACHE.set(path,entry);return entry;}
 }catch{}
 return null;
}
function writeApiCache(path,data){
 const entry={savedAt:Date.now(),data};
 API_CACHE.set(path,entry);
 try{
  const stored=JSON.parse(sessionStorage.getItem(API_CACHE_KEY)||'{}');
  stored[path]=entry;
  const compact=Object.fromEntries(Object.entries(stored)
   .sort((a,b)=>(b[1]?.savedAt||0)-(a[1]?.savedAt||0))
   .slice(0,16));
  sessionStorage.setItem(API_CACHE_KEY,JSON.stringify(compact));
 }catch{}
}
function requestApi(path,ttl){
 const pending=API_IN_FLIGHT.get(path);
 if(pending)return pending;
 const request=(async()=>{
  const response=await fetch(API+path,{cache:'default',headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Request failed ('+response.status+')');
  if(ttl>0)writeApiCache(path,data);
  return data;
 })();
 const shared=request.finally(()=>{
  if(API_IN_FLIGHT.get(path)===shared)API_IN_FLIGHT.delete(path);
 });
 API_IN_FLIGHT.set(path,shared);
 return shared;
}
async function api(path){
 const ttl=apiCacheTtl(path);
 if(ttl>0){
  const cached=readApiCache(path);
  if(cached){
   const age=Date.now()-cached.savedAt;
   if(age<=ttl)return cached.data;
   if(age<=ttl*5){
    requestApi(path,ttl).catch(()=>{});
    return cached.data;
   }
  }
 }
 return requestApi(path,ttl);
}
function ApiWarmup(){
 useEffect(()=>{
  const ping=()=>{
   const now=Date.now();
   let last=0;
   try{last=Number(localStorage.getItem(API_WARMUP_KEY)||0)}catch{}
   if(now-last<API_WARMUP_INTERVAL)return;
   try{localStorage.setItem(API_WARMUP_KEY,String(now))}catch{}
   fetch(API+'/docs',{method:'GET',mode:'no-cors',cache:'no-store',keepalive:true}).catch(()=>{});
   fetch(ANIVEXA_API+'/',{method:'GET',mode:'no-cors',cache:'no-store',keepalive:true}).catch(()=>{});
  };
  ping();
  const timer=window.setInterval(ping,API_WARMUP_INTERVAL);
  const onVisibility=()=>{if(document.visibilityState==='visible')ping()};
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility)};
 },[]);
 return null;
}
const title=a=>a?.title?.english||a?.title?.romaji||a?.title?.native||a?.name||'Untitled';
const CYBERPUNK_ART=import.meta.env.BASE_URL+'images/cyberpunk-edgerunners.svg';
function isCyberpunkEdgerunners(anime){
 const label=[anime?.title?.english,anime?.title?.romaji,anime?.title?.native,anime?.name].filter(Boolean).join(' ').toLowerCase();
 return String(anime?.id||'')==='156822'||/cyberpunk\s*[:\-]?\s*edgerunners/.test(label);
}
function fallbackArtwork(anime){return isCyberpunkEdgerunners(anime)?CYBERPUNK_ART:'';}
function isAdultAnime(anime){
 if(anime?.isAdult===true)return true;
 if((anime?.genres||[]).some(value=>String(value||'').trim().toLowerCase()==='hentai'))return true;
 return (anime?.tags||[]).some(tag=>String(tag?.name||tag||'').trim().toLowerCase()==='hentai'||tag?.isAdult===true);
}
const imageCandidates=a=>[...new Set([a?.coverImage?.extraLarge,a?.coverImage?.large,a?.image,a?.poster].filter(value=>typeof value==='string'&&value.trim()))];
const image=a=>imageCandidates(a)[0]||fallbackArtwork(a);
function AnimePoster({item,className='',priority=false,alt}){
 const candidates=imageCandidates(item);
 const fallback=fallbackArtwork(item);
 const sources=fallback&&!candidates.includes(fallback)?[...candidates,fallback]:candidates;
 const sourceKey=sources.join('|');
 const [failed,setFailed]=useState(0);
 useEffect(()=>setFailed(0),[item?.id,sourceKey]);
 const src=sources[failed];
 if(!src)return <div className={'ad-no-image '+className} role="img" aria-label={'Artwork unavailable for '+title(item)}><span>No artwork</span></div>;
 return <img className={className} loading={priority?'eager':'lazy'} decoding="async" fetchPriority={priority?'high':'auto'} src={src} alt={alt??title(item)} onError={()=>setFailed(current=>Math.min(current+1,sources.length))}/>;
}
const clean=s=>(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function trailerEmbed(anime){
 const trailer=anime?.trailer;
 if(String(trailer?.site||'').toLowerCase()!=='youtube'||! /^[a-zA-Z0-9_-]{6,}$/.test(String(trailer?.id||'')))return '';
 const id=trailer.id;
 return 'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&mute=1&controls=0&loop=1&playlist='+id+'&playsinline=1&rel=0';
}
const EMBED=import.meta.env.VITE_EMBED_TEMPLATE||import.meta.env.VITE_FALLBACK_EMBED_TEMPLATE||'';
const EMBED_NAME=import.meta.env.VITE_EMBED_NAME||'Embed player';
function fallback(mal,ep,audio){if(!EMBED||!mal)return null;try{const u=new URL(EMBED.replaceAll('{malId}',encodeURIComponent(mal)).replaceAll('{episode}',encodeURIComponent(ep)).replaceAll('{audio}',audio));return u.protocol==='https:'?{name:EMBED_NAME,url:u.href}:null}catch{return null}}


function seasonNumberFor(anime){
 const name=[title(anime),anime?.title?.romaji].filter(Boolean).join(' ');
 const named=name.match(/(?:season|series|\bS)\s*(\d+)/i)||name.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
 if(named)return Math.max(1,Number(named[1]));
 const edges=anime?.relations?.edges||[];
 return edges.some(edge=>edge?.relationType==='PREQUEL'&&edge?.node?.type==='ANIME'&&['TV','ONA'].includes(edge?.node?.format))?2:1;
}

const LIBRARY_KEY='animedex-library-v1';
function emptyLibrary(){return {watchlist:[],history:[],watchedEpisodes:{},notifiedEpisodes:[],tracking:{},episodeProgress:{}};}
function readLibrary(){
 try{
  const saved=JSON.parse(localStorage.getItem(LIBRARY_KEY)||'{}');
  return {...emptyLibrary(),...saved,watchlist:Array.isArray(saved.watchlist)?saved.watchlist:[],history:Array.isArray(saved.history)?saved.history:[],watchedEpisodes:saved.watchedEpisodes&&typeof saved.watchedEpisodes==='object'?saved.watchedEpisodes:{},notifiedEpisodes:Array.isArray(saved.notifiedEpisodes)?saved.notifiedEpisodes:[],tracking:saved.tracking&&typeof saved.tracking==='object'?saved.tracking:{},episodeProgress:saved.episodeProgress&&typeof saved.episodeProgress==='object'?saved.episodeProgress:{}};
 }catch{return emptyLibrary();}
}
function writeLibrary(next){
 const saved={...next,updatedAt:Date.now()};
 try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(saved));}catch{}
 try{window.dispatchEvent(new Event('animedex-library-change'));}catch{}
 return saved;
}
function updateLibrary(update){return writeLibrary(update(readLibrary()));}
function useLibraryData(){
 const [data,setData]=useState(()=>readLibrary());
 useEffect(()=>{
  const refresh=()=>setData(readLibrary());
  window.addEventListener('animedex-library-change',refresh);
  window.addEventListener('storage',refresh);
  return()=>{window.removeEventListener('animedex-library-change',refresh);window.removeEventListener('storage',refresh);};
 },[]);
 return data;
}
function libraryAnime(anime){
 return {
  id:Number(anime?.id)||anime?.id,
  title:{english:anime?.title?.english||anime?.title?.romaji||anime?.title?.native||anime?.name||'Untitled',romaji:anime?.title?.romaji||'',native:anime?.title?.native||''},
  coverImage:{large:anime?.coverImage?.large||anime?.image||anime?.poster||anime?.coverImage?.extraLarge||'',extraLarge:anime?.coverImage?.extraLarge||anime?.coverImage?.large||anime?.image||anime?.poster||''},
  genres:Array.isArray(anime?.genres)?anime.genres.slice(0,8):[],
  studios:Array.isArray(anime?.studios?.nodes)?anime.studios.nodes.map(studio=>studio?.name).filter(Boolean).slice(0,8):[],
  meanScore:Number(anime?.meanScore||anime?.averageScore)||null,
  isAdult:anime?.isAdult===true,
  format:anime?.format||'TV',
  seasonYear:anime?.seasonYear||null,
  status:anime?.status||null,
  episodes:Number(anime?.episodes)||null,
  nextAiringEpisode:anime?.nextAiringEpisode||null
 };
}
function rememberAnime(anime){
 if(!anime?.id||isAdultAnime(anime))return;
 const summary=libraryAnime(anime);
 const recommendations=(anime?.recommendations?.nodes||[]).map(node=>{
  const item=node?.mediaRecommendation||node;
  if(!item?.id)return null;
  return {...libraryAnime(item),meanScore:item.meanScore||item.averageScore||null,recommendationRating:Number(node?.rating)||0};
 }).filter(Boolean).slice(0,10);
 updateLibrary(data=>{
  const previous=data.history.find(item=>String(item.id)===String(anime.id));
  const entry={...previous,...summary,viewedAt:Date.now(),recommendations:recommendations.length?recommendations:(previous?.recommendations||[])};
  return {...data,history:[entry,...data.history.filter(item=>String(item.id)!==String(anime.id))].slice(0,30)};
 });
}
function recordEpisodeStart(id,episode,audio,name){
 const key=String(id),number=Math.max(1,Number(episode)||1);
 updateLibrary(data=>{
  const old=data.history.find(item=>String(item.id)===key)||{...libraryAnime({id:Number(id),title:{english:name||'Anime'}}),recommendations:[]};
  return {...data,history:[{...old,lastEpisode:number,audio:audio==='dub'?'dub':'sub',lastUpdated:Date.now()},...data.history.filter(item=>String(item.id)!==key)].slice(0,30)};
 });
}
function episodeProgressKey(id,episode,audio='sub'){return [String(id),String(Math.max(1,Number(episode)||1)),audio==='dub'?'dub':'sub'].join(':');}
function getEpisodeProgress(library,id,episode,audio='sub'){return library?.episodeProgress?.[episodeProgressKey(id,episode,audio)]||null;}
function saveEpisodeProgress(id,episode,audio,currentTime=0,duration=0,manualPercent=null){
 const key=String(id),number=Math.max(1,Number(episode)||1),progressKey=episodeProgressKey(id,number,audio);
 const safeDuration=Math.max(0,Number(duration)||0),safeTime=Math.max(0,Number(currentTime)||0);
 const percent=manualPercent===null?(safeDuration>0?Math.min(100,Math.max(0,safeTime/safeDuration*100)):0):Math.min(99,Math.max(0,Number(manualPercent)||0));
 updateLibrary(data=>{
  const old=data.history.find(item=>String(item.id)===key)||{...libraryAnime({id:Number(id)}),recommendations:[]};
  const entry={currentTime:safeTime,duration:safeDuration,percent,manual:manualPercent!==null,updatedAt:Date.now()};
  return {...data,episodeProgress:{...data.episodeProgress,[progressKey]:entry},history:[{...old,lastEpisode:number,audio:audio==='dub'?'dub':'sub',progressPercent:percent,lastUpdated:Date.now()},...data.history.filter(item=>String(item.id)!==key)].slice(0,30)};
 });
}
function markEpisodeWatched(id,episode,audio='sub',duration=0){
 const key=String(id),number=Math.max(1,Number(episode)||1),progressKey=episodeProgressKey(id,number,audio);
 updateLibrary(data=>{
  const watched=Array.isArray(data.watchedEpisodes[key])?data.watchedEpisodes[key]:[];
  const nextWatched=[...new Set([...watched,number])].sort((a,b)=>a-b);
  const old=data.history.find(item=>String(item.id)===key)||{...libraryAnime({id:Number(id)}),recommendations:[]};
  const previous=data.episodeProgress[progressKey]||{};
  const completed={...previous,currentTime:Math.max(Number(previous.currentTime)||0,Number(duration)||0),duration:Math.max(Number(previous.duration)||0,Number(duration)||0),percent:100,manual:false,updatedAt:Date.now()};
  return {...data,watchedEpisodes:{...data.watchedEpisodes,[key]:nextWatched},episodeProgress:{...data.episodeProgress,[progressKey]:completed},history:[{...old,lastEpisode:number,lastCompletedEpisode:number,progressPercent:100,lastUpdated:Date.now()},...data.history.filter(item=>String(item.id)!==key)].slice(0,30)};
 });
}
const TRACKING_STATUSES=['Watching','Completed','On Hold','Plan to Watch'];
function updateTrackingStatus(anime,status){
 if(!anime?.id||isAdultAnime(anime))return;
 const key=String(anime.id);
 updateLibrary(data=>{
  const tracking={...data.tracking};
  if(!TRACKING_STATUSES.includes(status))delete tracking[key];
  else tracking[key]={status,anime:libraryAnime(anime),updatedAt:Date.now()};
  return {...data,tracking};
 });
}
function continueEpisode(item,library){
 const last=Math.max(1,Number(item?.lastEpisode)||1);
 const watched=library?.watchedEpisodes?.[String(item?.id)]||[];
 const progress=getEpisodeProgress(library,item?.id,last,item?.audio);
 if(progress&&Number(progress.percent)>=5&&Number(progress.percent)<95&&!watched.includes(last))return last;
 return watched.includes(last)?last+1:last;
}
function getPersonalRecommendations(library){
 const seen=new Set([...(library?.history||[]),...(library?.watchlist||[])].map(item=>String(item.id)));
 const ranked=new Map();
 for(const history of library?.history||[]){
  for(const item of history.recommendations||[]){
   if(!item?.id||seen.has(String(item.id))||isAdultAnime(item))continue;
   const key=String(item.id),current=ranked.get(key)||{item,score:0};
   current.score+=10+Math.min(100,Number(item.recommendationRating)||0)/10;
   ranked.set(key,current);
  }
 }
 return [...ranked.values()].sort((a,b)=>b.score-a.score).slice(0,12).map(entry=>entry.item);
}
function formatAiringTime(timestamp){
 const value=Number(timestamp);
 if(!value)return 'Time not available';
 try{return new Date(value*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}catch{return 'Time not available';}
}
function defaultAudio(){
 try{return JSON.parse(localStorage.getItem('animedex-settings')||'{}').defaultAudio==='dub'?'dub':'sub'}catch{return 'sub'}
}

function sourceServerId(source){return String(source?.provider||source?.name||'unknown').split(/[·|]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');}
const PREFERRED_SERVER_KEY='aniorbit-preferred-servers-v1';
const UNRELIABLE_SERVER_KEY='aniorbit-unreliable-servers-v1';
function readPreferredServers(){try{return JSON.parse(localStorage.getItem(PREFERRED_SERVER_KEY)||'{}')}catch{return {}}}
function savePreferredServer(audio,source){try{const current=readPreferredServers();localStorage.setItem(PREFERRED_SERVER_KEY,JSON.stringify({...current,[audio==='dub'?'dub':'sub']:sourceServerId(source)}));}catch{}}
function isServerReportedUnreliable(source){try{return (JSON.parse(localStorage.getItem(UNRELIABLE_SERVER_KEY)||'[]')).includes(sourceServerId(source))}catch{return false}}
function reportServerUnreliable(source){try{const current=JSON.parse(localStorage.getItem(UNRELIABLE_SERVER_KEY)||'[]');localStorage.setItem(UNRELIABLE_SERVER_KEY,JSON.stringify([...new Set([...current,sourceServerId(source)])]));}catch{}}
function Header({onSearch,onSettings}){
 const [q,setQ]=useState('');
 const nav=useNavigate();
 const submit=e=>{e.preventDefault();const term=q.trim();if(!term)return;if(onSearch)onSearch(e,term);else nav('/?q='+encodeURIComponent(term))};
 return <header className="ad-header"><div className="ad-header-inner"><Link to="/" className="ad-brand" aria-label="AniOrbit home"><span className="ad-wordmark">Ani<span>Orbit</span></span></Link><nav className="ad-nav" aria-label="Main navigation"><Link to="/">Discover</Link><Link to="/community">Community</Link><Link to="/schedule">Schedule</Link><Link to="/lists">My Lists</Link><Link to="/tracking">Tracking</Link></nav><form className="ad-search" onSubmit={submit}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search anime..." aria-label="Search Anime" required/><button aria-label="Search"><span>Search</span><b>↵</b></button></form><PresenceIndicator/><NotificationBell/><AuthControl/>{onSettings&&<button className="ad-settings-trigger" onClick={onSettings} aria-label="Open settings">Settings</button>}</div></header>
}
function Footer(){return <footer className="ad-footer"><div className="ad-footer-inner"><Link to="/" className="ad-footer-brand">Ani<span>Orbit</span></Link><p>Discover your next anime.</p><span className="ad-footer-note">ANIORBIT</span></div></footer>}
function Tile({item,priority=false}){return <Link className="ad-tile" to={'/anime/'+item.id}><div className="ad-poster"><AnimePoster item={item} priority={priority}/><span className="ad-tag">{item?.format||'TV'}</span></div><div className="ad-tile-info"><h3>{title(item)}</h3><span>{(item?.genres||[]).slice(0,2).join(' · ')||item?.seasonYear||''}</span></div></Link>}
function TileGrid({items,loading,emptyLabel='No anime found.'}){return <div className="ad-grid">{items?.length?items.map((x,i)=><Tile key={x.id||i} item={x} priority={i<3}/>):loading?Array.from({length:8},(_,i)=><div className="ad-tile ad-skeleton" key={'skeleton-'+i} role="status" aria-label="Loading anime"><div className="ad-poster"/><div className="ad-tile-info"><span/><span/></div></div>):<div className="ad-empty">{emptyLabel}</div>}</div>}
function ContinuePoster({item}){
 const candidates=imageCandidates(item);
 const [src,setSrc]=useState(candidates[0]||'');
 const [missing,setMissing]=useState(!candidates.length);
 const attempted=useRef(new Set());
 const refreshed=useRef(false);
 const freshArtwork=useRef(null);
 const persistFreshArtwork=()=>{
  const fresh=freshArtwork.current;
  if(!fresh)return;
  freshArtwork.current=null;
  const summary=libraryAnime(fresh);
  updateLibrary(data=>({
   ...data,
   history:data.history.map(entry=>String(entry.id)===String(item.id)?{...entry,coverImage:summary.coverImage}:entry),
   watchlist:data.watchlist.map(entry=>String(entry.id)===String(item.id)?{...entry,coverImage:summary.coverImage}:entry)
  }));
 };
 const retryArtwork=async()=>{
  if(src)attempted.current.add(src);
  const alternate=candidates.find(candidate=>!attempted.current.has(candidate));
  if(alternate){setSrc(alternate);return;}
  if(!refreshed.current&&item?.id){
   refreshed.current=true;
   try{
    const fresh=await api('/anime/info/'+encodeURIComponent(item.id));
    const current=imageCandidates(fresh);
    const replacement=current.find(candidate=>!attempted.current.has(candidate));
    if(replacement){freshArtwork.current=fresh;setSrc(replacement);return;}
   }catch{}
  }
  const localFallback=fallbackArtwork(item);
  if(localFallback&&!attempted.current.has(localFallback)){attempted.current.add(localFallback);setSrc(localFallback);return;}
  setMissing(true);
 };
 if(missing)return <div className="ad-continue-poster ad-continue-poster-empty" role="img" aria-label={'Artwork unavailable for '+title(item)}><span>ANIORBIT</span></div>;
 return <img className="ad-continue-poster" src={src} alt="" loading="lazy" decoding="async" onError={retryArtwork} onLoad={persistFreshArtwork}/>;
}
function Home(){
 const navigate=useNavigate();
 const defaults={autoplayTrailer:true,quickTags:true,accent:'lavender',defaultAudio:'sub',autoServerRecovery:true,dataSaver:false};
 const [prefs,setPrefs]=useState(()=>{try{const {blockEmbedPopups:_legacyEmbedSetting,...saved}=JSON.parse(localStorage.getItem('animedex-settings')||'{}');return {...defaults,...saved}}catch{return defaults}});
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [selectedGenre,setSelectedGenre]=useState('');const [formatFilter,setFormatFilter]=useState('all');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [discovery,setDiscovery]=useState({genre:'',year:'',season:'',format:'',status:'',studio:'',minRating:'',popularity:'',sort:'POPULARITY_DESC'});
 const [discoveryGenres,setDiscoveryGenres]=useState(['Action','Adventure','Comedy','Drama','Fantasy','Mystery','Romance','Sci-Fi']);
 const libraryData=useLibraryData();
 const recommendations=getPersonalRecommendations(libraryData);
 const continueList=libraryData.history.filter(item=>item.lastEpisode&&!isAdultAnime(item));
 const [airingAlerts,setAiringAlerts]=useState([]);
 const [alertMessage,setAlertMessage]=useState('');
 const [notificationPermission,setNotificationPermission]=useState(()=>('Notification' in window?Notification.permission:'unsupported'));
 const followedKey=libraryData.watchlist.map(item=>String(item.id)).sort().join(',');

 const [data,setData]=useState({popular:[],recent:[],loading:true,error:''});
 const [query,setQuery]=useState(new URLSearchParams(location.hash.split('?')[1]||'').get('q')||'');
 const [results,setResults]=useState(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const [slide,setSlide]=useState(0);const request=useRef(0);
 useEffect(()=>{try{localStorage.setItem('animedex-settings',JSON.stringify(prefs));document.documentElement.dataset.accent=prefs.accent||'lavender';document.documentElement.dataset.dataSaver=prefs.dataSaver?'true':'false'}catch{}},[prefs]);
 useEffect(()=>{if(!filtersOpen)return;let live=true;api('/anime/genres').then(data=>{if(live&&Array.isArray(data.genres)&&data.genres.length)setDiscoveryGenres(data.genres.filter(genre=>String(genre).toLowerCase()!=='hentai'))}).catch(()=>{});return()=>{live=false}},[filtersOpen]);
 useEffect(()=>{
  if(!followedKey){setAiringAlerts([]);return;}
  let live=true;
  const refreshSchedule=async()=>{
   try{
    const data=await api('/anime/schedule?page=1&per_page=50');
    if(!live)return;
    const followed=new Set(followedKey.split(','));
    setAiringAlerts((data.results||[]).filter(item=>!isAdultAnime(item)&&followed.has(String(item.id))&&item.next_episode&&item.airingAt));
   }catch{if(live)setAlertMessage('The airing schedule is temporarily unavailable.');}
  };
  refreshSchedule();
  const interval=window.setInterval(refreshSchedule,15*60*1000);
  return()=>{live=false;window.clearInterval(interval);};
 },[followedKey]);
 const enableEpisodeAlerts=async()=>{
  if(!('Notification' in window)){setNotificationPermission('unsupported');setAlertMessage('Browser notifications are not supported here. Your in-site airing list will still work.');return;}
  try{
   const permission=await Notification.requestPermission();
   setNotificationPermission(permission);
   window.dispatchEvent(new Event('animedex-notification-permission-change'));
   setAlertMessage(permission==='granted'?'Episode alerts are enabled while AniOrbit is open.':permission==='denied'?'Notifications are blocked in your browser settings.':'Notification permission was not granted.');
  }catch{setAlertMessage('Could not request notification permission in this browser.');}
 };

 useEffect(()=>{let live=true;api('/anime/home').then(home=>{if(live)setData({popular:(Array.isArray(home.popular)?home.popular:[]).filter(item=>!isAdultAnime(item)),recent:(Array.isArray(home.recent)?home.recent:[]).filter(item=>!isAdultAnime(item)),loading:false,error:''})}).catch(error=>{if(live)setData({popular:[],recent:[],loading:false,error:error.message||'Could not connect to catalogue.'})});return()=>{live=false}},[]);
 const featured=data.popular[slide%Math.max(data.popular.length,1)];
 const search=async (e,term=query)=>{e?.preventDefault();const q=String(term||'').trim();if(!q){setResults(null);setSelectedGenre('');return}setQuery(q);setSelectedGenre('');setFormatFilter('all');const id=++request.current;setBusy(true);setErr('');setResults([]);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');if(id===request.current)setResults((d.results||[]).filter(item=>!isAdultAnime(item)))}catch(x){if(id===request.current)setErr(x.message)}finally{if(id===request.current)setBusy(false)}};
 const filterGenre=async genre=>{const id=++request.current;setSelectedGenre(genre);setFormatFilter('all');setQuery(genre);setBusy(true);setErr('');setResults([]);try{const d=await api('/anime/filter?genre='+encodeURIComponent(genre)+'&page=1&per_page=30');if(id===request.current)setResults((d.results||[]).filter(item=>!isAdultAnime(item)))}catch(e){if(id===request.current)setErr(e.message)}finally{if(id===request.current)setBusy(false)}};
 useEffect(()=>{const q=new URLSearchParams(location.hash.split('?')[1]||'').get('q');if(q){setQuery(q);searchQuery(q)}},[]);

 const applyDiscovery=async e=>{
  e?.preventDefault();
  const id=++request.current;
  const params=new URLSearchParams({page:'1',per_page:'50',sort:discovery.sort||'POPULARITY_DESC'});
  ['genre','year','season','format','status'].forEach(key=>{if(discovery[key])params.set(key,discovery[key]);});
  setBusy(true);setErr('');setResults([]);setSelectedGenre(discovery.genre||'');setQuery('');setFormatFilter('all');
  try{
   const data=await api('/anime/filter?'+params.toString());
   const studio=discovery.studio.trim().toLocaleLowerCase();
   const minRating=Number(discovery.minRating)||0,minPopularity=Number(discovery.popularity)||0;
   const filtered=(data.results||[]).filter(item=>{
    if(isAdultAnime(item))return false;
    const score=Number(item.averageScore||item.meanScore||0),popularity=Number(item.popularity)||0;
    const studios=(item.studios?.nodes||[]).map(node=>node?.name||'').join(' ').toLocaleLowerCase();
    return (!minRating||score>=minRating)&&(!minPopularity||popularity>=minPopularity)&&(!studio||studios.includes(studio));
   });
   if(id===request.current)setResults(filtered);
  }catch(error){if(id===request.current)setErr(error.message||'Could not apply discovery filters.');}
  finally{if(id===request.current)setBusy(false);}
 };

 async function searchQuery(q){setBusy(true);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');setResults((d.results||[]).filter(item=>!isAdultAnime(item)))}catch(e){setErr(e.message)}finally{setBusy(false)}}
 const genres=['Action','Adventure','Comedy','Drama','Fantasy','Mystery','Romance','Sci-Fi'];
 const visibleResults=(results||[]).filter(item=>!isAdultAnime(item)&&(formatFilter==='all'||(formatFilter==='movie'?String(item?.format||'').toUpperCase()==='MOVIE':String(item?.format||'').toUpperCase()!=='MOVIE')));
 return <><Header onSearch={search} onSettings={()=>setSettingsOpen(v=>!v)}/>{settingsOpen&&<div className="ad-settings-panel" role="dialog" aria-label="AniOrbit settings"><div className="ad-settings-head"><b>Settings</b><button onClick={()=>setSettingsOpen(false)} aria-label="Close settings">×</button></div><label><input type="checkbox" checked={prefs.autoplayTrailer} onChange={e=>setPrefs(p=>({...p,autoplayTrailer:e.target.checked}))}/> Autoplay muted trailers</label><label><input type="checkbox" checked={prefs.quickTags} onChange={e=>setPrefs(p=>({...p,quickTags:e.target.checked}))}/> Show quick genre tags</label><label><input type="checkbox" checked={prefs.autoServerRecovery!==false} onChange={e=>setPrefs(p=>({...p,autoServerRecovery:e.target.checked}))}/> Automatically try another direct server if playback fails</label><label><input type="checkbox" checked={Boolean(prefs.dataSaver)} onChange={e=>setPrefs(p=>({...p,dataSaver:e.target.checked}))}/> Reduce data use (disable autoplay trailers and heavy effects)</label><label className="ad-accent-setting">Accent colour<select value={prefs.accent} onChange={e=>setPrefs(p=>({...p,accent:e.target.value}))}><option value="lavender">Lavender</option><option value="blue">Blue</option><option value="mint">Mint</option></select></label><label className="ad-accent-setting">Default audio<select value={prefs.defaultAudio||'sub'} onChange={e=>setPrefs(p=>({...p,defaultAudio:e.target.value}))}><option value="sub">Subtitles (sub)</option><option value="dub">English dub (dub)</option></select></label></div>}<main className="ad-main">{results===null&&<section className="ad-home-intro" aria-label="AniOrbit search">
 <div className="ad-home-intro-brand"><span>Ani</span><span>Orbit</span></div>
 <p className="ad-home-intro-subtitle">Find your next watch.</p>
 <form className="ad-home-search" onSubmit={search}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
  <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anime..." aria-label="Search Anime" autoComplete="off" required/>
  <button type="submit" disabled={busy}>{busy?'Searching':'Search'}<span>↵</span></button>
 </form>
</section>}
 {data.error&&<div className="ad-catalogue-error" role="alert"><span>The catalogue is temporarily unavailable. Your page is still working; try loading the catalogue again.</span><button onClick={()=>window.location.reload()}>Retry</button></div>}
 {results===null?<>
 <section className="ad-hero">{featured?<> {prefs.autoplayTrailer&&!prefs.dataSaver&&trailerEmbed(featured)?<iframe className="ad-hero-trailer" loading="lazy" src={trailerEmbed(featured)} title={title(featured)+" muted trailer preview"} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/>:<img className="ad-hero-bg" src={image(featured)} alt=""/>}<div className="ad-hero-shade"/><div className="ad-hero-content"><div className="ad-spotlight">FEATURED ANIME</div><h1>{title(featured)}</h1><div className="ad-hero-meta"><span className="ad-chip">HD</span><span className="ad-chip">{featured.format||'TV'}</span><span>{featured.seasonYear||''}</span></div><p>{clean(featured.description||featured.synopsis).slice(0,210)||'Discover your next favourite anime.'}</p><div className="ad-hero-actions"><Link className="ad-watch" to={'/anime/'+featured.id}>View details</Link><button className="ad-more" onClick={()=>setSlide((slide+1)%Math.max(data.popular.length,1))}>Next pick</button><button className="ad-more" onClick={()=>{if(data.popular.length){const pick=data.popular[Math.floor(Math.random()*data.popular.length)];navigate('/anime/'+pick.id);}}}>Surprise me</button></div></div><div className="ad-dots">{data.popular.slice(0,6).map((x,i)=><button key={x.id||i} className={i===slide?'active':''} onClick={()=>setSlide(i)} aria-label={'Spotlight '+(i+1)}/>)}</div></>:<div className="ad-hero-empty"><div className="ad-spotlight">ANIORBIT DISCOVER</div><h1>Find your next anime obsession.</h1><p>Explore new worlds, unforgettable characters, and stories worth staying up for.</p></div>}</section>
 {prefs.quickTags&&<section className="ad-quick-tags" aria-label="Browse by genre"><span>Browse by genre</span>{genres.map(genre=><button key={genre} onClick={()=>filterGenre(genre)}>{genre}</button>)}</section>}
 <section className="ad-discovery-panel" aria-label="Advanced anime discovery">
  <div className="ad-discovery-heading"><div><span className="ad-discovery-kicker">FIND SOMETHING TO WATCH</span><h2>Advanced discovery</h2></div><button type="button" className="ad-discovery-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}>{filtersOpen?'Hide filters':'Open filters'} <span>{filtersOpen?'−':'+'}</span></button></div>
  {filtersOpen&&<form className="ad-discovery-form" onSubmit={applyDiscovery}>
   <label>Genre<select value={discovery.genre} onChange={e=>setDiscovery(value=>({...value,genre:e.target.value}))}><option value="">Any genre</option>{discoveryGenres.map(genre=><option key={genre} value={genre}>{genre}</option>)}</select></label>
   <label>Year<input type="number" min="1940" max="2100" placeholder="Any year" value={discovery.year} onChange={e=>setDiscovery(value=>({...value,year:e.target.value}))}/></label>
   <label>Season<select value={discovery.season} onChange={e=>setDiscovery(value=>({...value,season:e.target.value}))}><option value="">Any season</option><option value="WINTER">Winter</option><option value="SPRING">Spring</option><option value="SUMMER">Summer</option><option value="FALL">Fall</option></select></label>
   <label>Format<select value={discovery.format} onChange={e=>setDiscovery(value=>({...value,format:e.target.value}))}><option value="">Any format</option><option value="TV">TV</option><option value="MOVIE">Movie</option><option value="OVA">OVA</option><option value="ONA">ONA</option><option value="SPECIAL">Special</option></select></label>
   <label>Status<select value={discovery.status} onChange={e=>setDiscovery(value=>({...value,status:e.target.value}))}><option value="">Any status</option><option value="RELEASING">Airing</option><option value="FINISHED">Completed</option><option value="NOT_YET_RELEASED">Upcoming</option><option value="CANCELLED">Cancelled</option></select></label>
   <label>Minimum rating<select value={discovery.minRating} onChange={e=>setDiscovery(value=>({...value,minRating:e.target.value}))}><option value="">Any rating</option><option value="60">6/10+</option><option value="70">7/10+</option><option value="80">8/10+</option><option value="90">9/10+</option></select></label>
   <label>Popularity<select value={discovery.popularity} onChange={e=>setDiscovery(value=>({...value,popularity:e.target.value}))}><option value="">Any popularity</option><option value="10000">10,000+ users</option><option value="50000">50,000+ users</option><option value="100000">100,000+ users</option></select></label>
   <label>Studio<input type="search" placeholder="e.g. A-1 Pictures" value={discovery.studio} onChange={e=>setDiscovery(value=>({...value,studio:e.target.value}))}/></label>
   <label>Sort by<select value={discovery.sort} onChange={e=>setDiscovery(value=>({...value,sort:e.target.value}))}><option value="POPULARITY_DESC">Popularity</option><option value="SCORE_DESC">Highest rated</option><option value="TRENDING_DESC">Trending</option><option value="START_DATE_DESC">Newest</option><option value="FAVOURITES_DESC">Most favourited</option></select></label>
   <div className="ad-discovery-actions"><button type="submit" disabled={busy}>{busy?'Searching…':'Apply filters'}</button><button type="button" onClick={()=>setDiscovery({genre:'',year:'',season:'',format:'',status:'',studio:'',minRating:'',popularity:'',sort:'POPULARITY_DESC'})}>Clear</button></div>
   <p>Catalogue filters handle genre, year, season, format, status and sorting. Studio, rating and popularity thresholds refine the returned results.</p>
  </form>}
 </section>

 {continueList.length>0&&<section className="ad-personal-section" aria-label="Continue watching">
  <div className="ad-personal-heading"><div><span className="ad-discovery-kicker">PICK UP WHERE YOU LEFT OFF</span><h2>Continue Watching</h2></div><span>Saved on this device</span></div>
  <div className="ad-continue-grid">{continueList.slice(0,8).map(item=>{const episode=continueEpisode(item,libraryData);const checkpoint=getEpisodeProgress(libraryData,item.id,episode,item.audio);const percent=Math.round(Number(checkpoint?.percent)||0);return <div className="ad-continue-card" key={item.id}><Link className="ad-continue-main" to={'/watch/'+item.id+'/'+episode+'/'+(item.audio||'sub')+'/embed?title='+encodeURIComponent(title(item))}><ContinuePoster item={item}/><span><b>{title(item)}</b><small>Episode {episode} · {(item.audio||'sub').toUpperCase()}{percent>0?' · '+percent+'% saved':''}</small>{percent>0&&<span className="ad-continue-progress" role="progressbar" aria-label={'Episode progress '+percent+' percent'} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><i style={{width:percent+'%'}}/></span>}<em>Continue watching ↗</em></span></Link><button className="ad-continue-remove" type="button" title="Remove from Continue Watching" aria-label={'Remove '+title(item)+' from Continue Watching'} onClick={()=>updateLibrary(data=>({...data,history:data.history.filter(entry=>String(entry.id)!==String(item.id))}))}>×</button></div>})}</div>
 </section>}
 {libraryData.history.some(item=>!isAdultAnime(item))&&<section className="ad-section ad-recently-viewed"><div className="ad-personal-heading"><div><span className="ad-discovery-kicker">YOUR RECENT ACTIVITY</span><h2>Recently Viewed</h2></div></div><TileGrid items={libraryData.history.filter(item=>!isAdultAnime(item)).slice(0,8)} loading={false}/></section>}
  <section className="ad-personal-section ad-custom-list-promo"><div><span className="ad-discovery-kicker">MAKE IT YOURS</span><h2>Organise your anime</h2><p>Create collections for favourites, watch-later picks, hidden gems and anything else.</p></div><Link to="/lists">Manage custom lists →</Link></section>
  {recommendations.length>0&&<section className="ad-section ad-recommendations"><div className="ad-personal-heading"><div><span className="ad-discovery-kicker">BASED ON WHAT YOU VIEWED</span><h2>Picked for You</h2></div></div><TileGrid items={recommendations} loading={false}/></section>}
 {libraryData.watchlist.some(item=>!isAdultAnime(item))&&<section className="ad-section ad-my-list" id="my-list">
  <div className="ad-personal-heading"><div><span className="ad-discovery-kicker">YOUR SAVED SHOWS</span><h2>My Watchlist</h2></div><button className="ad-alert-button" onClick={enableEpisodeAlerts}>{notificationPermission==='granted'?'Episode alerts enabled':'Enable episode alerts'}</button></div>
  <TileGrid items={libraryData.watchlist.filter(item=>!isAdultAnime(item))} loading={false}/>
  <p className="ad-alert-note">Airing reminders use the catalogue's episode timetable. Browser notifications need permission and AniOrbit to remain open.</p>
  {alertMessage&&<p className="ad-alert-message" role="status">{alertMessage}</p>}
  {airingAlerts.length>0?<div className="ad-airing-list"><h3>Upcoming episodes in your list</h3>{airingAlerts.map(item=><div className="ad-airing-item" key={item.id+':'+item.next_episode}><b>{title(item)}</b><span>Episode {item.next_episode} · {formatAiringTime(item.airingAt)}</span></div>)}</div>:<p className="ad-alert-note">No followed shows are currently in the next schedule results.</p>}
 </section>}

 <section className="ad-section"><h2>Most Popular</h2><TileGrid items={data.popular} loading={data.loading} emptyLabel={data.error?'Catalogue unavailable. Select Retry above.':'No anime found.'}/></section>
 <section className="ad-section"><h2>Recently Updated</h2><TileGrid items={data.recent} loading={data.loading} emptyLabel={data.error?'Catalogue unavailable. Select Retry above.':'No anime found.'}/></section>
 </>:<section className="ad-section ad-results">
 <div className="ad-results-head"><div><span className="ad-results-kicker">{selectedGenre?'GENRE':'SEARCH'}</span><h2>{selectedGenre?selectedGenre:'Results for “'+query+'”'}</h2></div>
 <div className="ad-format-filter" role="group" aria-label="Filter results">
  {['all','tv','movie'].map(mode=><button key={mode} type="button" className={formatFilter===mode?'active':''} aria-pressed={formatFilter===mode} onClick={()=>setFormatFilter(mode)}>{mode==='all'?'All':mode==='tv'?'TV':'Movies'}</button>)}
 </div></div>
 {err&&<p className="ad-error">{err}</p>}<TileGrid items={visibleResults} loading={busy}/>
 <button className="ad-reset" onClick={()=>{setResults(null);setErr('');setSelectedGenre('');setFormatFilter('all')}}>Back to Home</button></section>}
 </main><Footer/></>
}

function EpisodeAlertScheduler(){
 const libraryData=useLibraryData();
 const followedKey=libraryData.watchlist.map(item=>String(item.id)).sort().join(',');
 const [permissionVersion,setPermissionVersion]=useState(0);
 useEffect(()=>{
  const refresh=()=>setPermissionVersion(value=>value+1);
  window.addEventListener('animedex-notification-permission-change',refresh);
  return()=>window.removeEventListener('animedex-notification-permission-change',refresh);
 },[]);
 useEffect(()=>{
  if(!followedKey||!('Notification' in window)||Notification.permission!=='granted')return;
  let live=true;
  const timers=new Map();
  const scheduleUpcoming=async()=>{
   try{
    const data=await api('/anime/schedule?page=1&per_page=50');
    if(!live)return;
    const followed=new Set(followedKey.split(','));
    const current=readLibrary();
    const delivered=new Set(current.notifiedEpisodes||[]);
    for(const item of data.results||[]){
     if(isAdultAnime(item)||!followed.has(String(item.id))||!item.next_episode||!item.airingAt)continue;
     const key=String(item.id)+':'+String(item.next_episode);
     if(delivered.has(key)||timers.has(key))continue;
     const when=Number(item.airingAt)*1000,delay=when-Date.now();
     if(!Number.isFinite(when)||delay>7*24*60*60*1000)continue;
     const timer=window.setTimeout(()=>{
      timers.delete(key);
      if(!live||Notification.permission!=='granted')return;
      try{
       new Notification('New episode airing',{body:title(item)+' · Episode '+item.next_episode+' is scheduled now.'});
       const latest=readLibrary();
       if(!(latest.notifiedEpisodes||[]).includes(key)){
        writeLibrary({...latest,notifiedEpisodes:[...(latest.notifiedEpisodes||[]),key].slice(-150)});
       }
      }catch{}
     },Math.max(0,delay));
     timers.set(key,timer);
    }
   }catch{}
  };
  scheduleUpcoming();
  const interval=window.setInterval(scheduleUpcoming,15*60*1000);
  return()=>{
   live=false;
   window.clearInterval(interval);
   for(const timer of timers.values())window.clearTimeout(timer);
   timers.clear();
  };
 },[followedKey,permissionVersion]);
 return null;
}

function Details(){
 const {id}=useParams();const [anime,setAnime]=useState(null);const [loading,setLoading]=useState(true);const [err,setErr]=useState('');const [similar,setSimilar]=useState([]);
 const [episodeList,setEpisodeList]=useState([]);const [episodesLoading,setEpisodesLoading]=useState(false);const [episodesError,setEpisodesError]=useState('');
 const [characters,setCharacters]=useState([]);const [charactersLoading,setCharactersLoading]=useState(false);const [charactersError,setCharactersError]=useState('');const [characterQuery,setCharacterQuery]=useState('');
 const libraryData=useLibraryData();
 const [hideWatchedEpisodes,setHideWatchedEpisodes]=useState(()=>{try{return localStorage.getItem('aniorbit-hide-watched-episodes')==='true'}catch{return false}});
 useEffect(()=>{try{localStorage.setItem('aniorbit-hide-watched-episodes',String(hideWatchedEpisodes))}catch{}},[hideWatchedEpisodes]);
 const trackingStatus=libraryData.tracking?.[String(id)]?.status||'';
 const [watchOptions,setWatchOptions]=useState(null);const [watchOptionsLoading,setWatchOptionsLoading]=useState(false);
 const loadEpisodes=async()=>{
  setEpisodesLoading(true);setEpisodesError('');
  try{
   const data=await api('/anime/episodes/'+encodeURIComponent(id));
   const providers=data?.providers&&typeof data.providers==='object'?Object.values(data.providers):[];
   const candidates=providers.flatMap(provider=>{
    const lists=provider?.episodes||{};
    const sub=Array.isArray(lists.sub)?lists.sub:[];
    const dub=Array.isArray(lists.dub)?lists.dub:[];
    return [sub,dub].filter(list=>list.length).map(list=>list.filter(ep=>Number.isFinite(Number(ep?.number))&&Number(ep.number)>0));
   }).filter(list=>list.length);
   candidates.sort((a,b)=>b.length-a.length);
   const best=candidates[0]||[];
   const unique=new Map();
   for(const ep of best){const number=Number(ep.number);if(!unique.has(number))unique.set(number,{number,title:ep.title||('Episode '+number)});}
   setEpisodeList([...unique.values()].sort((a,b)=>a.number-b.number));
  }catch(e){setEpisodeList([]);setEpisodesError(e.message||'Episode list could not be loaded.');}
  finally{setEpisodesLoading(false);}
 };
 useEffect(()=>{let live=true;setLoading(true);api('/anime/info/'+encodeURIComponent(id)).then(a=>{if(live){setAnime(a);setLoading(false)}}).catch(e=>{if(live){setErr(e.message);setLoading(false)}});return()=>{live=false}},[id]);
 useEffect(()=>{
  let live=true;
  setCharacterQuery('');
  if(!anime?.id||String(anime.id)!==String(id)||isAdultAnime(anime)){setCharacters([]);setCharactersLoading(false);return()=>{live=false};}
  setCharacters([]);setCharactersLoading(true);setCharactersError('');
  api('/anime/anime/'+encodeURIComponent(id)+'/characters?page=1&per_page=24')
   .then(data=>{if(live)setCharacters(Array.isArray(data?.characters)?data.characters.filter(edge=>edge?.node?.id):[]);})
   .catch(error=>{if(live)setCharactersError(error.message||'Character information could not be loaded.');})
   .finally(()=>{if(live)setCharactersLoading(false);});
  return()=>{live=false};
 },[id,anime?.id,anime?.isAdult,anime?.genres?.join('|')]);
 useEffect(()=>{
  if(!anime?.id){setSimilar([]);return}
  const genres=Array.isArray(anime.genres)?anime.genres.filter(Boolean):[];
  const pool=new Map();
  const add=(item,boost=0)=>{
   if(!item?.id||isAdultAnime(item)||String(item.id)===String(id))return;
   const key=String(item.id);
   const overlap=(item.genres||[]).filter(genre=>genres.includes(genre)).length;
   const score=overlap*100+boost;
   const previous=pool.get(key);
   if(!previous||score>previous.score)pool.set(key,{item,score});
  };
  (anime.recommendations?.nodes||[]).forEach(node=>add(node?.mediaRecommendation||node,Number(node?.rating)||0));
  (anime.relations?.edges||[])
   .filter(edge=>['PREQUEL','SEQUEL','SIDE_STORY','SPIN_OFF'].includes(edge?.relationType))
   .forEach(edge=>add(edge?.node,35));
  setSimilar([...pool.values()].sort((a,b)=>b.score-a.score).slice(0,10).map(entry=>entry.item));
 },[anime?.id]);
 useEffect(()=>{if(anime?.id&&String(anime.id)===String(id)&&!isAdultAnime(anime))rememberAnime(anime);},[anime?.id,id]);
 useEffect(()=>{
  if(!anime?.id||String(anime.id)!==String(id))return;
  if(isAdultAnime(anime)){setEpisodeList([]);setEpisodesError('');return;}
  loadEpisodes();
 },[id,anime?.id,anime?.isAdult,anime?.genres?.join('|')]);
 useEffect(()=>{
  let live=true;
  setWatchOptions(null);
  if(!anime?.id||String(anime.id)!==String(id)||isAdultAnime(anime)){setWatchOptionsLoading(false);return()=>{live=false};}
  setWatchOptionsLoading(true);
  api('/anime/dub-finder/'+encodeURIComponent(id)+'?region=CA')
   .then(data=>{if(live)setWatchOptions(data)})
   .catch(error=>{if(live)setWatchOptions({status:'lookup_failed',error:error.message||'Lookup unavailable'})})
   .finally(()=>{if(live)setWatchOptionsLoading(false)});
  return()=>{live=false};
 },[id,anime?.id,anime?.isAdult,anime?.genres?.join('|')]);
 const count=Math.min(Number(anime?.episodes)||0,500);
 const displayedEpisodes=episodeList.length?episodeList:Array.from({length:count},(_,i)=>({number:i+1,title:'Episode '+(i+1)}));
 const visibleEpisodes=hideWatchedEpisodes?displayedEpisodes.filter(ep=>!(libraryData.watchedEpisodes?.[String(id)]||[]).includes(Number(ep.number))):displayedEpisodes;

 const isFollowing=libraryData.watchlist.some(item=>String(item.id)===String(id));
 const toggleFollow=()=>{
  const saved=libraryAnime(anime);
  updateLibrary(data=>({...data,watchlist:data.watchlist.some(item=>String(item.id)===String(id))?data.watchlist.filter(item=>String(item.id)!==String(id)):[saved,...data.watchlist].slice(0,100)}));
 };
 const seasonNumber=seasonNumberFor(anime);
 const seasonLinks=(anime?.relations?.edges||[]).filter(edge=>['PREQUEL','SEQUEL'].includes(edge?.relationType)&&edge?.node?.type==='ANIME'&&['TV','ONA'].includes(edge?.node?.format)&&edge?.node?.id).filter((edge,index,all)=>all.findIndex(other=>String(other.node.id)===String(edge.node.id))===index).sort((a,b)=>(a.relationType==='PREQUEL'?-1:1)-(b.relationType==='PREQUEL'?-1:1));
 const characterSearch=characterQuery.trim().toLowerCase();
 const visibleCharacters=characters.filter(edge=>{
  const node=edge?.node||{};
  const actorNames=(edge?.voiceActors||[]).map(actor=>actor?.name?.full||actor?.name?.native||'').filter(Boolean);
  return [node?.name?.full,node?.name?.userPreferred,node?.name?.native,...actorNames].filter(Boolean).join(' ').toLowerCase().includes(characterSearch);
 });
 return <><Header/>{loading?<div className="ad-loading">Loading anime...</div>:anime&&isAdultAnime(anime)?<main className="ad-detail ad-adult-blocked"><section><span className="ad-discovery-kicker">CONTENT FILTER</span><h1>Title not available</h1><p>Adult and hentai titles are excluded from AniOrbit.</p><Link className="ad-watch" to="/">Back to Discover</Link></section></main>:anime?<main className="ad-detail">
 <div className="ad-detail-backdrop" style={{backgroundImage:'url('+image(anime)+')'}}/>
 <section className="ad-detail-top"><div className="ad-detail-poster"><AnimePoster item={anime} alt={title(anime)}/></div><div className="ad-detail-copy"><h1>{title(anime)}</h1><div className="ad-detail-tags"><span>HD</span><span>{anime.format||'TV'}</span><span>{anime.seasonYear||'—'}</span></div><Link className="ad-watch" to={'/watch/'+id+'/1/'+defaultAudio()+'/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}>▶ &nbsp; Watch Now</Link><button className="ad-follow-button" type="button" onClick={toggleFollow}>{isFollowing?'✓ In your watchlist':'+ Add to watchlist'}</button><label className="ad-tracking-control"><span>My anime status</span><select aria-label="My anime status" value={trackingStatus} onChange={event=>updateTrackingStatus(anime,event.target.value)}><option value="">Not tracking</option>{TRACKING_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select></label><CustomListActions anime={anime}/><p className="ad-synopsis">{clean(anime.description||anime.synopsis)||'No synopsis available.'}</p></div><aside className="ad-info"><h3>Overview:</h3><p>{clean(anime.description||anime.synopsis)||'No overview available.'}</p>{[['Other Names',anime.title?.native||anime.title?.romaji],['Episodes',episodeList.length||anime.episodes||'—'],['Release Year',anime.seasonYear||'—'],['Type',anime.format||'TV'],['Status',anime.status||'—'],['Rating',anime.meanScore||anime.averageScore?((Number(anime.meanScore||anime.averageScore)/10).toFixed(1)+'/10'):'—'],['Studio',(anime.studios?.nodes||[]).filter(studio=>studio?.isAnimationStudio!==false).map(studio=>studio?.name).filter(Boolean).join(', ')||'—']].map(([k,v])=><div className="ad-info-row" key={k}><b>{k}:</b><span>{v||'—'}</span></div>)}<div className="ad-genres"><b>Genres:</b> {(anime.genres||[]).join(', ')}</div></aside></section>
 <section className="ad-section ad-dub-finder" aria-labelledby="ad-dub-heading">
  <div className="ad-dub-heading">
   <div><span className="ad-dub-kicker">OFFICIAL STREAMING LOOKUP · CANADA</span><h2 id="ad-dub-heading">English dub finder</h2></div>
   <span className="ad-dub-auto">Automatic search</span>
  </div>
  {watchOptionsLoading?<p className="ad-dub-message">Checking official streaming listings…</p>:
   watchOptions?.status==='services_found'?<>
    <p className="ad-dub-message">These services list this title in Canada. Streaming catalogues do not report audio tracks, so an English dub is not confirmed—check the provider’s audio options.</p>
    <div className="ad-dub-grid">{watchOptions.providers.map(provider=><div className="ad-dub-provider" key={provider.id}>
     {provider.logoUrl?<img src={provider.logoUrl} alt="" loading="lazy"/>:<span className="ad-dub-logo-fallback">{provider.name?.slice(0,1)||'?'}</span>}
     <span className="ad-dub-provider-copy"><b>{provider.name}</b><small>{(provider.availabilityTypes||[]).join(' · ')}</small></span>
    </div>)}</div>
    {watchOptions.watchGuideUrl&&<a className="ad-dub-guide" href={watchOptions.watchGuideUrl} target="_blank" rel="noopener noreferrer">See full Canadian availability <span>↗</span></a>}
   </>:watchOptions?.status==='no_listings'?<p className="ad-dub-message">No official streaming services were listed for Canada. That does not necessarily mean an English dub does not exist.</p>:
    watchOptions?.status==='unmatched'?<p className="ad-dub-message">The title could not be matched confidently in the streaming catalogue, so no service list is shown rather than risking the wrong series.</p>:
    <p className="ad-dub-message">The official service lookup is temporarily unavailable. Try again later.</p>}
  <p className="ad-dub-footnote">This finder points to licensed service listings; it does not extract or host video files.</p>
 </section>
 <section className="ad-episodes" id="watch"><div className="ad-episodes-heading"><h2>Season {seasonNumber} Episodes</h2><label><input type="checkbox" checked={hideWatchedEpisodes} onChange={event=>setHideWatchedEpisodes(event.target.checked)}/> Hide watched</label></div>{episodesLoading&&!displayedEpisodes.length?<p>Loading episode list...</p>:visibleEpisodes.length?<><div className="ad-episode-grid">{visibleEpisodes.map(ep=><Link key={ep.number} to={'/watch/'+id+'/'+ep.number+'/'+defaultAudio()+'/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}><b>S{seasonNumber} · EP {ep.number}</b><span>{ep.title||title(anime)+' - Episode '+ep.number}</span><i>{(libraryData.watchedEpisodes?.[String(id)]||[]).includes(Number(ep.number))?'✓':'▶'}</i></Link>)}</div>{episodesError&&<p className="ad-error">Live episode data is temporarily unavailable. Showing the episode count from AniList instead.</p>}</>:displayedEpisodes.length?<p className="ad-episodes-empty">All episodes in this list are marked watched. Turn off “Hide watched” to see them again.</p>:<div><p>{episodesError?'The episode list could not be loaded.':'Episode count is not available for this title.'}</p><button className="ad-reset" onClick={loadEpisodes} disabled={episodesLoading}>{episodesLoading?'Retrying...':'Retry episode list'}</button></div>}{seasonLinks.length>0&&<div className="ad-season-nav"><div className="ad-season-heading"><h3>More Seasons</h3><span>Continue the series</span></div><div className="ad-season-grid">{seasonLinks.map(edge=><Link className="ad-season-card" key={edge.node.id} to={'/anime/'+edge.node.id}><img loading="lazy" src={edge.node.coverImage?.extraLarge||edge.node.coverImage?.large||''} alt=""/><span className="ad-season-card-copy"><small>{edge.relationType==='PREQUEL'?'Previous season':'Next season'}</small><b>{edge.node.title?.english||edge.node.title?.romaji||'Related season'}</b>{edge.node.episodes&&<em>{edge.node.episodes} episodes</em>}</span><i>›</i></Link>)}</div></div>}</section>
 <section className="ad-section ad-characters" aria-label="Characters and voice actors">
  <div className="ad-characters-heading"><div><span className="ad-discovery-kicker">MEET THE CAST</span><h2>Characters &amp; voice actors</h2></div><input type="search" aria-label="Search characters and voice actors" placeholder="Search cast…" value={characterQuery} onChange={event=>setCharacterQuery(event.target.value)}/></div>
  {charactersLoading?<p className="ad-characters-message">Loading character information…</p>:charactersError?<p className="ad-characters-message">Character information is temporarily unavailable.</p>:visibleCharacters.length?<div className="ad-characters-grid">{visibleCharacters.slice(0,24).map(edge=>{
   const character=edge.node||{};
   const voiceActor=(edge.voiceActors||[]).find(actor=>actor?.languageV2==='Japanese')||(edge.voiceActors||[])[0];
   const characterName=character.name?.full||character.name?.userPreferred||character.name?.native||'Unknown character';
   const actorName=voiceActor?.name?.full||voiceActor?.name?.native||'';
   return <article className="ad-character-card" key={character.id}>
    {character.image?.large||character.image?.medium?<img src={character.image.large||character.image.medium} alt="" loading="lazy"/>:<span className="ad-character-placeholder">AO</span>}
    <div><b>{characterName}</b><small>{edge.role||'Character'}</small>{actorName&&<em>{voiceActor.languageV2||'Voice actor'}: {actorName}</em>}</div>
   </article>;
  })}</div>:characters.length?<p className="ad-characters-message">No characters or voice actors match “{characterQuery}”.</p>:<p className="ad-characters-message">Character details are not available for this title.</p>}
 </section>
 <section className="ad-section"><h2>Similar Animes</h2><TileGrid items={similar} loading={false}/></section><CommunitySection animeId={String(id)} title={title(anime)}/>
 </main>:<div className="ad-loading ad-error">{err||'Anime could not be loaded.'}</div>}<Footer/></>
}
const ANISKIP_CACHE=new Map();
function formatSkipTime(seconds){
 const value=Math.max(0,Math.floor(Number(seconds)||0));
 const minutes=Math.floor(value/60),remaining=value%60;
 return minutes+':'+String(remaining).padStart(2,'0');
}
function isDirectMedia(source){
 const url=String(source?.url||'');
 const mime=String(source?.type||source?.mimeType||source?.mime_type||'').toLowerCase();
 return /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(url)||/^(?:video\/(?:mp4|webm|x-matroska|mpegurl|vnd\.apple\.mpegurl)|application\/vnd\.apple\.mpegurl)$/.test(mime);
}
const AD_WARNING_KEY='aniorbit-hide-third-party-warning-v1';
function hasHiddenAdWarning(){try{return localStorage.getItem(AD_WARNING_KEY)==='true'}catch{return false}}
function playbackSourceRank(source){
 const key=(String(source?.provider||'')+' '+String(source?.name||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ');
 if(key.includes('vidsrc'))return 0;
 if(key.includes('vidlink'))return 1;
 if(key.includes('2embed'))return 2;
 if(key.includes('anivexa'))return 3;
 if(isDirectMedia(source))return 4;
 if(key.includes('vidcore'))return 10;
 if(key.includes('anikoto'))return 11;
 if(key.includes('vidy'))return 12;
 return 50;
}
function isBrokenPlaybackEmbed(source){
 const key=(String(source?.provider||'')+' '+String(source?.name||'')).toLowerCase().replace(/[^a-z0-9]+/g,' ');
 return key.includes('aniembed')||key.includes('animeembed');
}
function rankPlaybackSources(primary,secondary,own){
 const unique=new Set();
 return [...(primary||[]),...(secondary||[]),...(own?[own]:[])]
  .filter(source=>source?.url&&/^https:\/\//i.test(String(source.url))&&!isBrokenPlaybackEmbed(source))
  .map((source,index)=>({source:{...source,url:String(source.url).trim()},index}))
  .filter(({source})=>{
   if(unique.has(source.url))return false;
   unique.add(source.url);
   return true;
  })
  .sort((a,b)=>(playbackSourceRank(a.source)+(isServerReportedUnreliable(a.source)?100:0))-(playbackSourceRank(b.source)+(isServerReportedUnreliable(b.source)?100:0))||a.index-b.index)
  .map(item=>item.source);
}
function normalizeAnivexaWatchPayload(payload,provider){
 const providerName=provider.charAt(0).toUpperCase()+provider.slice(1);
 const rows=[];
 if(Array.isArray(payload?.streams))rows.push(...payload.streams.map(item=>({item,kind:'stream'})));
 if(payload?.stream_url)rows.unshift({item:{url:payload.stream_url,type:'hls',server:payload.server||providerName},kind:'stream'});
 if(Array.isArray(payload?.embeds))rows.push(...payload.embeds.map(item=>({item,kind:'embed'})));
 if(Array.isArray(payload?.allServers))rows.push(...payload.allServers.map(item=>({item:{url:item.embed,name:item.name},kind:'embed'})));
 const output=[];
 const seen=new Set();
 for(const row of rows){
  const item=row.item||{};
  const url=String(item.url||item.src||item.file||item.embed||'').trim();
  if(!/^https:\/\//i.test(url)||seen.has(url))continue;
  if(item.headers&&Object.keys(item.headers).length)continue;
  const rawType=String(item.type||item.mimeType||item.mime_type||'').toLowerCase();
  if(rawType.includes('dash')||/\.mpd(?:$|[?#])/i.test(url))continue;
  const hls=rawType==='hls'||rawType==='m3u8'||/\.m3u8(?:$|[?#])/i.test(url);
  const media=/\.(?:mp4|webm)(?:$|[?#])/i.test(url)||rawType.startsWith('video/');
  const type=hls?'application/vnd.apple.mpegurl':media?(rawType||'video/mp4'):'embed';
  const serverName=item.server||item.name||providerName;
  output.push({name:'Anivexa · '+providerName+' · '+serverName,provider:'anivexa',type,url});
  seen.add(url);
 }
 output.sort((a,b)=>Number(isDirectMedia(b))-Number(isDirectMedia(a)));
 return output;
}
async function fetchAnivexaPlayback(anilistId,episode,audio,signal){
 const providerPath=ANIVEXA_PROVIDER_ORDER.join('/');
 const response=await fetch(ANIVEXA_API+'/episodes/'+providerPath+'/'+encodeURIComponent(anilistId)+'?map=false',{
  cache:'no-store',headers:{Accept:'application/json'},signal
 });
 if(!response.ok)throw new Error('Anivexa episodes request failed ('+response.status+')');
 const payload=await response.json();
 const candidates=[];
 const routePattern=/^watch\/(mkissa|reanime|anikoto|animegg|animenosub|anizone|aniwaves|senshi|kaa|animedunya|animeonsen|anipm)\/\d+\/(sub|dub)\/\1-\d+$/i;
 for(const provider of ANIVEXA_PROVIDER_ORDER){
  const episodes=payload?.[provider]?.episodes?.[audio];
  if(!Array.isArray(episodes))continue;
  const item=episodes.find(row=>Number(row?.number)===Number(episode));
  const route=String(item?.id||'').replace(/^\/+/, '');
  if(item&&routePattern.test(route))candidates.push({provider,route});
 }
 if(!candidates.length)return [];
 const localController=new AbortController();
 const combinedSignal=signal?AbortSignal.any([signal,localController.signal]):localController.signal;
 const jobs=candidates.map(async candidate=>{
  const result=await fetch(ANIVEXA_API+'/'+candidate.route,{
   cache:'no-store',headers:{Accept:'application/json'},signal:combinedSignal
  });
  const body=await result.json().catch(()=>null);
  if(!result.ok||!body||body.error)throw new Error(body?.error||'Anivexa provider unavailable');
  const sources=normalizeAnivexaWatchPayload(body,candidate.provider);
  if(!sources.length)throw new Error('Anivexa provider returned no browser-playable source');
  return sources[0];
 });
 try{
  const firstUsable=await Promise.any(jobs);
  localController.abort();
  return [firstUsable];
 }catch{
  localController.abort();
  return [];
 }
}
async function getOpeningSkip(mal,episode,signal){
 if(!/^\d+$/.test(String(mal||'')))return null;
 const key=String(mal)+':'+String(episode);
 const cached=ANISKIP_CACHE.get(key);
 if(cached&&Date.now()-cached.savedAt<24*60*60*1000)return cached.data;
 const url='https://api.aniskip.com/v2/skip-times/'+encodeURIComponent(mal)+'/'+encodeURIComponent(episode)+'?types%5B%5D=op&episodeLength=0';
 const response=await fetch(url,{headers:{Accept:'application/json'},signal});
 if(!response.ok)throw new Error('Opening timestamps are unavailable ('+response.status+').');
 const payload=await response.json();
 const result=(Array.isArray(payload?.results)?payload.results:[]).find(item=>item?.skipType==='op'&&Number.isFinite(Number(item?.interval?.start))&&Number.isFinite(Number(item?.interval?.end))&&Number(item.interval.end)>Number(item.interval.start));
 const data=payload?.found&&result?{start:Number(result.interval.start),end:Number(result.interval.end)}:null;
 ANISKIP_CACHE.set(key,{savedAt:Date.now(),data});
 return data;
}
 async function getEndingSkip(mal,episode,signal){
 if(!/^\d+$/.test(String(mal||'')))return null;
 const key='ending:'+String(mal)+':'+String(episode);
 const cached=ANISKIP_CACHE.get(key);
 if(cached&&Date.now()-cached.savedAt<24*60*60*1000)return cached.data;
 const url='https://api.aniskip.com/v2/skip-times/'+encodeURIComponent(mal)+'/'+encodeURIComponent(episode)+'?types%5B%5D=ed&episodeLength=0';
 const response=await fetch(url,{headers:{Accept:'application/json'},signal});
 if(!response.ok)throw new Error('Ending timestamps are unavailable ('+response.status+').');
 const payload=await response.json();
 const result=(Array.isArray(payload?.results)?payload.results:[]).find(item=>item?.skipType==='ed'&&Number.isFinite(Number(item?.interval?.start))&&Number.isFinite(Number(item?.interval?.end))&&Number(item.interval.end)>Number(item.interval.start));
 const data=payload?.found&&result?{start:Number(result.interval.start),end:Number(result.interval.end)}:null;
 ANISKIP_CACHE.set(key,{savedAt:Date.now(),data});
 return data;
}
function DirectMediaPlayer({source,intro,outro,autoSkip,onAutoSkip,id,episode,audio,autoNext,onEnded,speed,onPlaybackError}){
 const videoRef=useRef(null),hlsRef=useRef(null),skippedRef=useRef(false),outroSkippedRef=useRef(false),errorReported=useRef(false);
 const [currentTime,setCurrentTime]=useState(0),[playerError,setPlayerError]=useState('');
 const reportPlaybackError=()=>{
  if(errorReported.current)return;
  errorReported.current=true;
  setPlayerError('This direct video source could not be loaded. Trying another direct server if available…');
  onPlaybackError?.(source);
 };
 const [resumeAt,setResumeAt]=useState(null);
 const lastSavedAt=useRef(0);
 const url=source.url;
 useEffect(()=>{
  const video=videoRef.current;
  if(!video)return;
  let cancelled=false;
  let hls=null;
  setPlayerError('');
  const onMetadata=()=>{
   const saved=getEpisodeProgress(readLibrary(),id,episode,audio);
   if(saved&&Number(saved.currentTime)>8&&Number(saved.percent)<95&&video.duration>Number(saved.currentTime)+10)setResumeAt(Number(saved.currentTime));
   video.playbackRate=Number(speed)||1;
  };
  video.addEventListener('loadedmetadata',onMetadata);
  const attach=async()=>{
   if(/\.m3u8(?:$|[?#])/i.test(url)){
    if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=url;return;}
    try{
     const module=await import('hls.js');
     if(cancelled)return;
     const Hls=module.default;
     if(Hls.isSupported()){
      hls=new Hls({enableWorker:true,lowLatencyMode:false});
      hlsRef.current=hls;
      hls.on(Hls.Events.ERROR,(_,data)=>{if(data?.fatal&&!cancelled)reportPlaybackError();});
      hls.loadSource(url);hls.attachMedia(video);
     }else{video.src=url;}
    }catch{if(!cancelled)reportPlaybackError();}
   }else{video.src=url;}
  };
  attach();
  return()=>{
   cancelled=true;
   video.removeEventListener('loadedmetadata',onMetadata);
   if(video.duration>0&&video.currentTime>0)saveEpisodeProgress(id,episode,audio,video.currentTime,video.duration);
   if(hls){hls.destroy();if(hlsRef.current===hls)hlsRef.current=null;}
   video.pause();video.removeAttribute('src');video.load();
  };
 },[url,id,episode,audio]);
 useEffect(()=>{skippedRef.current=false;outroSkippedRef.current=false;setCurrentTime(0);setResumeAt(null);lastSavedAt.current=0;},[url,intro?.start,intro?.end,outro?.start,outro?.end]);
 useEffect(()=>{const video=videoRef.current;if(video)video.playbackRate=Number(speed)||1;},[speed]);
 const seekToEnd=(segment=intro,flag=skippedRef)=>{
  const video=videoRef.current;
  if(!video||!segment)return;
  try{video.currentTime=segment.end;flag.current=true;setCurrentTime(segment.end);onAutoSkip?.();}catch{setPlayerError('The player is not ready to seek yet.');}
 };
 const onTimeUpdate=()=>{
  const video=videoRef.current;
  if(!video)return;
  const now=video.currentTime||0;
  setCurrentTime(now);
  if(video.duration>0&&Date.now()-lastSavedAt.current>=5000){saveEpisodeProgress(id,episode,audio,now,video.duration);lastSavedAt.current=Date.now();}
  if(autoSkip&&intro&&!skippedRef.current&&now>=intro.start&&now<intro.end)seekToEnd(intro,skippedRef);
  if(autoSkip&&outro&&!outroSkippedRef.current&&now>=outro.start&&now<outro.end)seekToEnd(outro,outroSkippedRef);
 };
 const canOfferSkip=!!intro&&!skippedRef.current&&currentTime<intro.end;
 const canOfferOutro=!!outro&&!outroSkippedRef.current&&currentTime>=outro.start&&currentTime<outro.end;
 const handleKeys=event=>{
  const video=videoRef.current;
  if(!video||event.target!==video)return;
  if(event.code==='Space'){event.preventDefault();if(video.paused)video.play().catch(()=>{});else video.pause();}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+(event.key==='ArrowRight'?10:-10)));}
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();video.volume=Math.min(1,Math.max(0,video.volume+(event.key==='ArrowUp'?.05:-.05)));}
 };
 const resume=()=>{const video=videoRef.current;if(video&&resumeAt!==null){video.currentTime=Math.min(resumeAt,Math.max(0,(video.duration||resumeAt)-2));video.play().catch(()=>{});}setResumeAt(null);};
 const restart=()=>{const video=videoRef.current;if(video)video.currentTime=0;setResumeAt(null);};
 return <div className="ad-direct-player"><video ref={videoRef} controls playsInline preload="metadata" onTimeUpdate={onTimeUpdate} onPause={()=>{const video=videoRef.current;if(video?.duration>0)saveEpisodeProgress(id,episode,audio,video.currentTime,video.duration)}} onEnded={()=>{if(videoRef.current?.duration>0)saveEpisodeProgress(id,episode,audio,videoRef.currentTime,videoRef.current.duration);onEnded?.();}} onKeyDown={handleKeys} onError={reportPlaybackError}/>{resumeAt!==null&&<div className="ad-resume-prompt" role="dialog" aria-label="Resume playback"><span>Saved progress: {formatSkipTime(resumeAt)}</span><button type="button" onClick={resume}>Resume</button><button type="button" onClick={restart}>Start over</button></div>}{canOfferSkip&&<button className="ad-skip-intro" type="button" onClick={()=>seekToEnd(intro,skippedRef)}>Skip intro · {formatSkipTime(intro.start)}–{formatSkipTime(intro.end)} <span>↗</span></button>}{canOfferOutro&&<button className="ad-skip-intro ad-skip-outro" type="button" onClick={()=>seekToEnd(outro,outroSkippedRef)}>Skip outro · {formatSkipTime(outro.start)}–{formatSkipTime(outro.end)} <span>↗</span></button>}{playerError&&<p className="ad-player-error" role="status">{playerError}</p>}<small className="ad-player-shortcuts">Shortcuts: Space to play/pause · ←/→ seek 10s · ↑/↓ volume</small></div>;
}
function Watch(){
 const {id,episode,audio}=useParams();const [params]=useSearchParams();const navigate=useNavigate();
 const mal=params.get('mal')||'';const name=params.get('title')||'Anime';
 const [sources,setSources]=useState([]);const [active,setActive]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [showAdWarning,setShowAdWarning]=useState(()=>!hasHiddenAdWarning());
 const [dontShowAdWarning,setDontShowAdWarning]=useState(false);
 const continueToVideo=()=>{if(dontShowAdWarning){try{localStorage.setItem(AD_WARNING_KEY,'true')}catch{}}setShowAdWarning(false);setDontShowAdWarning(false)};
 const selectServer=index=>{setActive(index);if(!hasHiddenAdWarning()){setDontShowAdWarning(false);setShowAdWarning(true)}};
 const [intro,setIntro]=useState(null),[introStatus,setIntroStatus]=useState('checking');
 const [outro,setOutro]=useState(null);
 const [autoSkip,setAutoSkip]=useState(()=>{try{return localStorage.getItem('animedex-auto-skip-intro')!=='false'}catch{return true}});
 const own=fallback(mal,episode,audio);
 const [markedWatched,setMarkedWatched]=useState(()=>((readLibrary().watchedEpisodes?.[String(id)]||[]).includes(Number(episode))));
 const libraryData=useLibraryData();
 const episodeNumber=Math.max(1,Number(episode)||1);
 const episodeProgress=getEpisodeProgress(libraryData,id,episodeNumber,audio);
 const [manualCheckpoint,setManualCheckpoint]=useState(()=>Math.round(Number(getEpisodeProgress(readLibrary(),id,episodeNumber,audio)?.percent)||0));
 const [checkpointMessage,setCheckpointMessage]=useState('');
 const [autoNext,setAutoNext]=useState(()=>{try{return localStorage.getItem('aniorbit-auto-next')!=='false'}catch{return true}});
 const [playbackSpeed,setPlaybackSpeed]=useState(()=>{try{const value=Number(localStorage.getItem('aniorbit-playback-speed')||1);return [0.75,1,1.25,1.5,1.75,2].includes(value)?value:1}catch{return 1}});
 const [preferredMessage,setPreferredMessage]=useState('');
 useEffect(()=>{setManualCheckpoint(Math.round(Number(getEpisodeProgress(readLibrary(),id,episodeNumber,audio)?.percent)||0));setCheckpointMessage('');},[id,episodeNumber,audio]);
 const previousPath='/watch/'+id+'/'+Math.max(1,episodeNumber-1)+'/'+audio+'/embed?mal='+encodeURIComponent(mal)+'&title='+encodeURIComponent(name);
 const nextPath='/watch/'+id+'/'+(episodeNumber+1)+'/'+audio+'/embed?mal='+encodeURIComponent(mal)+'&title='+encodeURIComponent(name);
  const switchAudio=mode=>{if(mode===audio)return;try{const saved=JSON.parse(localStorage.getItem('animedex-settings')||'{}');localStorage.setItem('animedex-settings',JSON.stringify({...saved,defaultAudio:mode}));}catch{}navigate('/watch/'+id+'/'+episodeNumber+'/'+mode+'/embed?mal='+encodeURIComponent(mal)+'&title='+encodeURIComponent(name));};
 useEffect(()=>{try{localStorage.setItem('aniorbit-auto-next',String(autoNext))}catch{}},[autoNext]);
 useEffect(()=>{try{localStorage.setItem('aniorbit-playback-speed',String(playbackSpeed))}catch{}},[playbackSpeed]);
 const saveEmbedCheckpoint=()=>{saveEpisodeProgress(id,episodeNumber,audio,0,0,manualCheckpoint);setCheckpointMessage('Checkpoint saved on this device. This is a manual estimate for embedded players.');};
 const handleDirectEnded=()=>{markEpisodeWatched(id,episodeNumber,audio);setMarkedWatched(true);if(autoNext)navigate(nextPath);};
 const makePreferred=()=>{if(source){savePreferredServer(audio,source);setPreferredMessage((source.name||'This server')+' is now your preferred '+audio+' server.');}};
 const reportUnreliable=()=>{if(source){reportServerUnreliable(source);setPreferredMessage((source.name||'This server')+' is marked as unreliable on this device and will be ranked lower.');}};
 const nextServerIndex=(directOnly=false)=>{
  for(let offset=1;offset<=sources.length;offset++){
   const index=(active+offset)%sources.length;
   const candidate=sources[index];
   if(index!==active&&candidate&&(!directOnly||isDirectMedia(candidate))&&!isServerReportedUnreliable(candidate))return index;
  }
  return -1;
 };
 const tryNextServer=()=>{
  const next=nextServerIndex(false);
  if(next>=0)selectServer(next);
  else setPreferredMessage('No other playback servers are available.');
 };
 const handleDirectPlaybackError=failedSource=>{
  if(failedSource)reportServerUnreliable(failedSource);
  let enabled=true;
  try{enabled=JSON.parse(localStorage.getItem('animedex-settings')||'{}').autoServerRecovery!==false}catch{}
  if(!enabled){setPreferredMessage('The direct stream failed and was marked unreliable. Choose another server below.');return;}
  const next=nextServerIndex(true);
  if(next>=0){setPreferredMessage('The direct stream failed. Trying '+(sources[next].name||'the next direct server')+'.');setActive(next);}
  else setPreferredMessage('The direct stream failed. No untried direct server is available; choose another server below.');
 };
 useEffect(()=>{recordEpisodeStart(id,episode,audio,name);setMarkedWatched((readLibrary().watchedEpisodes?.[String(id)]||[]).includes(Number(episode)));},[id,episode,audio]);
 useEffect(()=>{
  let live=true;
  const controller=new AbortController();
  setIntro(null);setOutro(null);setIntroStatus('checking');
  if(!mal){setIntroStatus('unavailable');return()=>{live=false;controller.abort()};}
  const timer=window.setTimeout(()=>controller.abort(),10000);
  Promise.allSettled([
   getOpeningSkip(mal,episode,controller.signal),
   getEndingSkip(mal,episode,controller.signal)
  ]).then(([openingResult,endingResult])=>{
   if(!live)return;
   if(openingResult.status==='fulfilled'){
    setIntro(openingResult.value);
    setIntroStatus(openingResult.value?'found':'not-found');
   }else setIntroStatus('unavailable');
   if(endingResult.status==='fulfilled')setOutro(endingResult.value);
  }).finally(()=>window.clearTimeout(timer));
  return()=>{live=false;controller.abort();window.clearTimeout(timer)};
 },[mal,episode]);
 useEffect(()=>{try{localStorage.setItem('animedex-auto-skip-intro',String(autoSkip))}catch{}},[autoSkip]);
 useEffect(()=>{setDontShowAdWarning(false);setShowAdWarning(!hasHiddenAdWarning())},[id,episode,audio]);
 useEffect(()=>{
  let live=true;
  let primaryDone=false;
  let anivexaDone=false;
  let primaryError='';
  let primarySources=[];
  let anivexaSources=[];
  let anivexaTimer=null;
  const anivexaController=new AbortController();
  setLoading(true);setError('');setSources([]);setActive(0);
  const refresh=()=>{
   if(!live)return;
   const ranked=rankPlaybackSources(primarySources,anivexaSources,own);
   setSources(ranked);
   if(ranked.length){const preferred=readPreferredServers()[audio==='dub'?'dub':'sub'];const preferredIndex=preferred?ranked.findIndex(item=>sourceServerId(item)===preferred&&!isServerReportedUnreliable(item)):-1;setActive(preferredIndex>=0?preferredIndex:0);setLoading(false);setError('');return;}
   if(primaryDone&&anivexaDone){
    setLoading(false);
    setError(primaryError||'No playback source is available from either server.');
   }
  };
  const startPlayback=()=>{
   if(!live)return;
   anivexaTimer=window.setTimeout(()=>anivexaController.abort(),40000);
   api('/anime/playback/'+encodeURIComponent(id)+'?episode='+encodeURIComponent(episode)+'&type='+encodeURIComponent(audio))
    .then(data=>{
     if(!live)return;
     primarySources=Array.isArray(data?.sources)?data.sources:[];
     primaryDone=true;
     refresh();
    })
    .catch(error=>{
     if(!live)return;
     primaryError=error?.message||'The main playback API is unavailable.';
     primaryDone=true;
     refresh();
    });
   fetchAnivexaPlayback(id,episode,audio,anivexaController.signal)
    .then(list=>{if(live)anivexaSources=list})
    .catch(()=>{})
    .finally(()=>{anivexaDone=true;if(anivexaTimer)window.clearTimeout(anivexaTimer);refresh()});
  };
  api('/anime/info/'+encodeURIComponent(id))
   .then(metadata=>{
    if(!live)return;
    if(isAdultAnime(metadata)){
     setLoading(false);
     setError('Adult and hentai titles are excluded from AniOrbit.');
     return;
    }
    startPlayback();
   })
   .catch(()=>{
    if(!live)return;
    setLoading(false);
    setError('Could not verify this title. Return to Discover and try again.');
   });
  return()=>{
   live=false;
   anivexaController.abort();
   if(anivexaTimer)window.clearTimeout(anivexaTimer);
  };
 },[id,episode,audio,mal]);
 const source=sources[active];
 const direct=source&&isDirectMedia(source);
 const skipMessage=introStatus==='found'?'Opening detected: '+formatSkipTime(intro.start)+'–'+formatSkipTime(intro.end):introStatus==='checking'?'Checking opening timestamps…':introStatus==='not-found'?'No verified opening timestamps were found for this episode.':'Opening timestamps are unavailable for this title.';
 return <><Header/><main className="ad-watch-page"><Link to={'/anime/'+id} className="ad-back">‹ BACK TO ANIME</Link><h1>{name} - Episode {episode} <small>{audio.toUpperCase()}</small></h1>
 <div className="ad-watch-audio" role="group" aria-label="Audio preference"><span>Audio</span><button type="button" className={audio==='sub'?'active':''} aria-pressed={audio==='sub'} onClick={()=>switchAudio('sub')}>Subtitles</button><button type="button" className={audio==='dub'?'active':''} aria-pressed={audio==='dub'} onClick={()=>switchAudio('dub')}>Dub</button><small>Saved as your default for future episodes.</small></div>
  <div className="ad-watch-progress">
  <div className="ad-episode-nav"><button type="button" disabled={episodeNumber<=1} onClick={()=>navigate(previousPath)}>← Previous episode</button><button type="button" className="ad-skip-episode" onClick={()=>navigate(nextPath)}>Skip episode <span>→</span></button></div>
  <button type="button" className={markedWatched?'is-watched':''} onClick={()=>{markEpisodeWatched(id,episode,audio);setMarkedWatched(true);}}>{markedWatched?'✓ Episode watched':'Mark episode as watched'}</button>
  <span>{episodeProgress?.percent>0?Math.round(episodeProgress.percent)+'% saved on this device'+(episodeProgress.manual?' · manual embed checkpoint':' · automatic video progress'):'Progress is saved on this device. Embedded players do not expose their playback position to AniOrbit.'}</span>
  {episodeProgress?.percent>0&&<div className="ad-watch-progress-bar" role="progressbar" aria-label="Saved episode progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(episodeProgress.percent)}><i style={{width:Math.min(100,episodeProgress.percent)+'%'}}/></div>}
 </div>
 <section className="ad-intro-settings" aria-label="Intro skipping settings">
  <div><b>Automatic intro skip</b><small>{skipMessage}</small></div>
  <label><input type="checkbox" checked={autoSkip} onChange={event=>setAutoSkip(event.target.checked)}/> Auto-skip intro and outro</label>
  <label><input type="checkbox" checked={autoNext} onChange={event=>setAutoNext(event.target.checked)}/> Auto-next (direct videos only)</label>
  {direct&&<label className="ad-speed-control">Speed<select aria-label="Playback speed" value={playbackSpeed} onChange={event=>setPlaybackSpeed(Number(event.target.value))}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select></label>}
 </section>
 {loading?<div className="ad-player-message">Preparing playback...</div>:source?<>
  {showAdWarning?<section className="ad-ad-warning" role="dialog" aria-modal="true" aria-labelledby="ad-ad-warning-title">
   <div className="ad-ad-warning-card">
    <span className="ad-ad-warning-kicker">PLAYER SAFETY NOTICE</span>
    <h2 id="ad-ad-warning-title">Before you watch</h2>
    <p>This video is hosted by a third-party player. It may show pop-ups, redirects, or misleading download buttons. For safer browsing, consider using a reputable ad blocker or content blocker. Never download files, install extensions, or enter personal details because a video player asks you to.</p>
    <label><input type="checkbox" checked={dontShowAdWarning} onChange={event=>setDontShowAdWarning(event.target.checked)}/> Do not show this warning again</label>
    <button type="button" onClick={continueToVideo}>Continue to video</button>
   </div>
  </section>:direct?<DirectMediaPlayer key={source.url} source={source} intro={intro} outro={outro} autoSkip={autoSkip} id={id} episode={episodeNumber} audio={audio} autoNext={autoNext} onEnded={handleDirectEnded} onPlaybackError={handleDirectPlaybackError} speed={playbackSpeed}/>:<>
   <div className="ad-player"><iframe key={source.url} src={source.url} title={source.name||'Episode player'} allow={source.provider==='vidy'?'encrypted-media; autoplay *; fullscreen *':'autoplay; fullscreen; picture-in-picture; encrypted-media'} allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
   {intro&&<p className="ad-embed-skip-note">Opening timestamps: {formatSkipTime(intro.start)}–{formatSkipTime(intro.end)}. This server uses an external embedded player that does not expose seeking controls, so AniOrbit cannot automatically jump over the intro here. Choose a direct video server if one is offered.</p>}
  </>}
  {!direct&&!showAdWarning&&<section className="ad-embed-checkpoint" aria-label="Manual embedded playback checkpoint"><div><b>Save your place in this episode</b><small>Embedded players do not share their timeline with AniOrbit. Move this slider to roughly match the player, then save it manually.</small></div><label><span>{manualCheckpoint}%</span><input aria-label="Manual episode progress" type="range" min="0" max="95" step="5" value={manualCheckpoint} onChange={event=>setManualCheckpoint(Number(event.target.value))}/></label><button type="button" onClick={saveEmbedCheckpoint}>Save checkpoint</button>{checkpointMessage&&<p role="status">{checkpointMessage}</p>}</section>}
  <div className="ad-servers">
   <div className="ad-servers-heading"><div><b>CHOOSE A SERVER</b><small>Top picks first · switch if one does not work</small></div><span>{sources.length} AVAILABLE</span></div>
   <div className="ad-server-grid">{sources.slice(0,4).map((s,i)=><button type="button" key={s.url} className={active===i?'active':''} onClick={()=>selectServer(i)}><span className="ad-server-number">0{i+1}</span><span className="ad-server-copy"><strong>{s.name||'Server '+(i+1)}</strong><small>{i===0?'First choice':i===3&&s.provider==='anivexa'?'Backup API':'Alternative'}</small></span>{active===i&&<span className="ad-server-active">ACTIVE</span>}</button>)}</div>
   {sources.length>4&&<details className="ad-server-more" open={active>=4}><summary><span>More servers</span><small>{sources.length-4} additional options</small></summary><div className="ad-server-secondary">{sources.slice(4).map((s,offset)=>{const i=offset+4;return <button type="button" key={s.url} className={active===i?'active':''} onClick={()=>selectServer(i)}><span>{s.name||'Server '+(i+1)}</span>{active===i&&<small>ACTIVE</small>}</button>})}</div></details>}
   {source&&<div className="ad-server-tools"><button type="button" onClick={tryNextServer} disabled={sources.length<2}>Try next server</button><button type="button" onClick={makePreferred}>Use as preferred server</button><button type="button" onClick={reportUnreliable}>Mark as not working</button><span>{isServerReportedUnreliable(source)?'Marked unreliable on this device. ':''}{preferredMessage}</span></div>}
  </div>
 </>:<p className="ad-error">{error||'No source available.'}</p>}
 <div className="ad-watch-bottom-nav"><button type="button" disabled={episodeNumber<=1} onClick={()=>navigate(previousPath)}>← Previous episode</button><button type="button" onClick={()=>navigate(nextPath)}>Next episode →</button></div>
 <CommunitySection animeId={String(id)} title={name} episodeNumber={episodeNumber}/>
 </main><Footer/></>
}

class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('AniOrbit render error:',error,info)}
 render(){
  if(this.state.error)return <main className="ad-fatal" role="alert"><div><h1>AniOrbit couldn't finish loading.</h1><p>A page component ran into a problem. Reload the site to start a fresh session.</p><button onClick={()=>window.location.reload()}>Reload AniOrbit</button><details><summary>Technical details</summary><pre>{String(this.state.error)}</pre></details></div></main>;
  return this.props.children;
 }
}
function NotFound(){return <main className="ad-fatal"><div><h1>Page not found</h1><p>This AniOrbit page does not exist.</p><Link className="ad-watch" to="/">Return home</Link></div></main>}
function App(){return <AppErrorBoundary><HashRouter><ApiWarmup/><EpisodeAlertScheduler/><ProfileStatsSync/><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<Details/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="/user/:username" element={<ProfilePage/>}/><Route path="/community" element={<CommunityHub/>}/><Route path="/schedule" element={<SchedulePage/>}/><Route path="/lists" element={<CustomListsPage/>}/><Route path="/tracking" element={<TrackingPage/>}/><Route path="*" element={<NotFound/>}/></Routes></HashRouter></AppErrorBoundary>}
export default App;
