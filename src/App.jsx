import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { HashRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

const GRAPHQL = 'https://graphql.anilist.co';
const JIKAN = 'https://api.jikan.moe/v4';
const EMBED_TEMPLATE = import.meta.env.VITE_EMBED_TEMPLATE || import.meta.env.VITE_FALLBACK_EMBED_TEMPLATE || '';
const EMBED_NAME = import.meta.env.VITE_EMBED_NAME || import.meta.env.VITE_FALLBACK_EMBED_NAME || 'Embed player';
const LOGO = 'https://raw.githubusercontent.com/fiskryeziu/zoroClone/main/src/assets/images/logo.png';
const HERO_BG = 'https://raw.githubusercontent.com/fiskryeziu/zoroClone/main/src/assets/images/banner.png';

async function anilist(query, variables = {}, signal = AbortSignal.timeout(15000)) {
  const res = await fetch(GRAPHQL, { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({query,variables}), signal });
  if (!res.ok) throw new Error('AniList request failed (' + res.status + ')');
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList error');
  return json.data;
}
const mediaFields = 'id idMal externalLinks { site url } title { romaji english } description(asHtml:false) coverImage { extraLarge large } bannerImage averageScore episodes seasonYear format genres status';
const LIST_QUERY = `query($sort:[MediaSort],$page:Int){ Page(page:$page,perPage:24){ media(type:ANIME,sort:$sort,isAdult:false){ ${mediaFields} } } }`;
const SEARCH_QUERY = `query($search:String){ Page(page:1,perPage:20){ media(type:ANIME,search:$search,isAdult:false,sort:SEARCH_MATCH){ ${mediaFields} } } }`;
const DETAILS_QUERY = `query($id:Int){ Media(id:$id,type:ANIME){ ${mediaFields} } }`;

function buildEmbedFallback(malId, episode, audio) {
  if (!EMBED_TEMPLATE || !malId) return null;
  const raw = EMBED_TEMPLATE
    .replaceAll('{malId}', encodeURIComponent(String(malId)))
    .replaceAll('{episode}', encodeURIComponent(String(episode)))
    .replaceAll('{audio}', audio === 'dub' ? 'dub' : 'sub');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return { server: EMBED_NAME, type: 'embed', embed: url.toString() };
  } catch {
    return null;
  }
}
const titleOf = a => a?.title?.english || a?.title?.romaji || 'Untitled anime';
const imageOf = a => a?.coverImage?.extraLarge || a?.coverImage?.large || '';

function useCatalog() {
  const [data,setData] = useState({trending:[],popular:[],loading:true,error:''});
  useEffect(() => {
    let alive=true;
    const cached=localStorage.getItem('zoro-catalog');
    if(cached){try{const c=JSON.parse(cached); if(Date.now()-c.time<12*60*1000) setData({...c.value,loading:true});}catch{}}
    (async()=>{
      try{
        const [t,p]=await Promise.all([
          anilist(LIST_QUERY,{sort:['TRENDING_DESC'],page:1}),
          anilist(LIST_QUERY,{sort:['POPULARITY_DESC'],page:1})
        ]);
        const value={trending:t.Page.media,popular:p.Page.media};
        localStorage.setItem('zoro-catalog',JSON.stringify({time:Date.now(),value}));
        if(alive)setData({...value,loading:false,error:''});
      }catch(e){if(alive)setData(v=>({...v,loading:false,error:e.message||'Could not load catalogue'}));}
    })();
    return()=>{alive=false};
  },[]);
  return data;
}

function Header(){
 const [q,setQ]=useState(''); const [results,setResults]=useState([]); const [busy,setBusy]=useState(false); const nav=useNavigate();
 useEffect(()=>{if(q.trim().length<2){setResults([]);return;} const timer=setTimeout(async()=>{setBusy(true);try{const d=await anilist(SEARCH_QUERY,{search:q.trim()});setResults(d.Page.media||[]);}catch{setResults([])}finally{setBusy(false)}},350);return()=>clearTimeout(timer)},[q]);
 const go=id=>{setQ('');setResults([]);nav('/anime/'+id)};
 return <header className="topbar"><Link to="/" className="brand"><img src={LOGO} onError={e=>e.currentTarget.style.display='none'} alt="ZoroClone"/><span>ZORO<span className="lime">CLONE</span></span></Link><nav><Link to="/">Home</Link><a href="#trending">Trending</a><a href="#popular">Popular</a></nav><div className="searchbox"><span>⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search anime..."/>{q&&<button onClick={()=>setQ('')}>×</button>}{q.length>1&&<div className="search-results">{busy?<p>Searching…</p>:results.map(a=><button key={a.id} onClick={()=>go(a.id)}><img src={imageOf(a)}/><span>{titleOf(a)}</span></button>)}</div>}</div></header>
}
function Card({anime}){return <Link className="anime-card" to={'/anime/'+anime.id}><div className="poster"><img loading="lazy" src={imageOf(anime)} alt={titleOf(anime)}/><span className="score">★ {anime.averageScore?anime.averageScore+'%':'—'}</span></div><b>{titleOf(anime)}</b><small>{anime.format||'ANIME'} {anime.seasonYear?'• '+anime.seasonYear:''}</small></Link>}
function Shelf({id,title,items}){return <section className="shelf" id={id}><div className="section-title"><h2>{title}</h2><span>VIEW ALL　›</span></div><div className="card-row">{items.map(a=><Card key={a.id} anime={a}/>)}</div></section>}
function Home(){
 const {trending,popular,loading,error}=useCatalog(); const hero=trending[0];
 return <><Header/><main>
 <section className="hero" style={{backgroundImage:hero?.bannerImage?'linear-gradient(90deg,#202125 3%,rgba(32,33,37,.78) 48%,rgba(32,33,37,.08)),url('+hero.bannerImage+')':'linear-gradient(90deg,#202125,#34363c)'}}>
 <div className="hero-content"><div className="eyebrow">#1　ANIME STREAMING EXPERIENCE</div><h1>{hero?titleOf(hero):'Discover your next anime'}</h1><div className="hero-meta"><span>★ {hero?.averageScore?hero.averageScore+'%':'FEATURED'}</span><span>{hero?.format||'ANIME'}</span><span>{hero?.seasonYear||'2026'}</span></div><p>{hero?.description?.replace(/<[^>]*>/g,'').slice(0,230)||'Explore trending anime, discover new favourites, and find your next series.'}</p>{hero&&<Link className="primary-btn" to={'/anime/'+hero.id}>▶　WATCH NOW</Link>}</div><div className="hero-count">01 <i>/ 24</i></div></section>
 {loading&&<div className="loading"><div className="spinner"/>Waking up the anime catalogue…</div>}
 {error&&<div className="notice">Catalogue connection issue: {error}. Refresh to try again.</div>}
 {trending.length>0&&<Shelf id="trending" title="TRENDING NOW" items={trending}/>}
 {popular.length>0&&<Shelf id="popular" title="MOST POPULAR" items={popular}/>}
 <footer>© ZoroClone · Discover anime powered by AniList</footer></main></>
}
function readEpisodePayload(payload, audio) {
  const root = payload?.data?.data || payload?.data || payload?.result || payload || {};
  const rawProviders = root.providers || root.sources || {};
  const providers = Array.isArray(rawProviders)
    ? Object.fromEntries(rawProviders.map((p, i) => [p.name || p.id || ('provider-' + i), p]))
    : rawProviders;
  const names = Object.keys(providers || {});
  const getList = (value, audioKey = audio) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const candidate = value[audioKey] ?? value[audioKey.toUpperCase()] ?? value.episodes?.[audioKey] ?? value.episodes?.[audioKey.toUpperCase()] ?? value.episodes;
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') return Object.values(candidate).filter(x => x && typeof x === 'object');
    return [];
  };
  return { providers, names, getList, root };
}
function AnimeDetails(){
 const {id}=useParams();
 const [anime,setAnime]=useState(null);
 const [malData,setMalData]=useState(null);
 const [episodes,setEpisodes]=useState([]);
 const [audio,setAudio]=useState('sub');
 const [loading,setLoading]=useState(true);
 const [err,setErr]=useState('');
 useEffect(()=>{
   let alive=true;
   setAnime(null);
   setMalData(null);
   setLoading(true);
   setErr('');
   anilist(DETAILS_QUERY,{id:Number(id)})
     .then(detail=>{
       if(!alive)return;
       if(!detail?.Media) throw new Error('AniList could not find this anime.');
       setAnime(detail.Media);
       setLoading(false);
     })
     .catch(e=>{
       if(alive){
         setErr(e?.message||'Anime could not be loaded.');
         setLoading(false);
       }
     });
   return()=>{alive=false};
 },[id]);

 useEffect(()=>{
   if(!anime?.idMal) return;
   let alive=true;
   const key='zoro-jikan-'+anime.idMal;
   const load=async()=>{
     try{
       const saved=JSON.parse(localStorage.getItem(key)||'null');
       if(saved?.data && Date.now()-saved.time<24*60*60*1000){ setMalData(saved.data); return; }
     }catch{}
     const response=await fetch(JIKAN+'/anime/'+encodeURIComponent(anime.idMal)+'/full',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
     if(!response.ok) throw new Error('Jikan returned HTTP '+response.status);
     const json=await response.json();
     if(!json?.data) throw new Error('Jikan returned no anime details');
     try{localStorage.setItem(key,JSON.stringify({time:Date.now(),data:json.data}));}catch{}
     if(alive)setMalData(json.data);
   };
   load().catch(()=>{});
   return()=>{alive=false};
 },[anime?.idMal]);
 useEffect(()=>{
   if(!anime) { setEpisodes([]); return; }
   const count=Number(anime.episodes)||0;
   setEpisodes(Array.from({length:Math.min(count,500)},(_,i)=>({number:i+1,title:'Episode '+(i+1)})));
 },[anime?.id,anime?.episodes]);
 return <><Header/><main className="detail-page">
   {loading?<div className="loading"><div className="spinner"/>Loading anime and episodes…</div>:anime?<>
     <div className="detail-hero" style={{backgroundImage:anime.bannerImage?'linear-gradient(90deg,#202125 5%,rgba(32,33,37,.75)),url('+anime.bannerImage+')':'none'}}>
       <img src={imageOf(anime)}/><div><h1>{titleOf(anime)}</h1><p>{anime.description?.replace(/<[^>]*>/g,'').slice(0,500)}</p><div className="hero-meta"><span>★ {anime.averageScore||'—'}%</span><span>{anime.format}</span><span>{anime.episodes||'?'} episodes</span></div><div className="id-mapping"><b>EXTERNAL IDs</b><span>AniList: {anime.id}</span><span>MAL: {anime.idMal||'Not listed'}</span><span>MAL score: {malData?.score??'Loading…'}</span><span>MAL rank: {malData?.rank?'#'+malData.rank:'—'}</span><span>MAL popularity: {malData?.popularity?'#'+malData.popularity:'—'}</span></div></div>
     </div>
     <section className="episodes">
       <div className="section-title"><h2>EPISODES</h2><div className="controls">
         <select value={audio} onChange={e=>setAudio(e.target.value)}><option value="sub">Sub</option><option value="dub">Dub</option></select>
       </div></div>
       {episodes.length?episodes.map((ep,i)=>{
         const number=ep.number;
         return <Link key={number} className="episode" to={'/watch/'+id+'/'+encodeURIComponent(number)+'/'+audio+'/embed?mal='+encodeURIComponent(anime.idMal||'')}>
           <span>EP {number}</span><b>Episode {number}</b><small>▶ OPEN EMBED</small>
         </Link>;
       }):<div className="notice">AniList has not provided an episode count for this title.</div>}
       {err&&<div className="notice">Anime details warning: {err}</div>}
     </section>
   </>:<div className="notice">{err||'Anime could not be loaded.'}</div>}
 </main></>
}
function StreamPlayer({stream,onError}) {
 const videoRef=useRef(null);
 useEffect(()=>{
   const video=videoRef.current;
   if(!video || !stream?.url)return;
   const isHls=stream.type==='hls'||/\\.m3u8(?:$|[?#])/i.test(stream.url);
   let hls=null;
   let recoveredNetwork=false;
   let recoveredMedia=false;
   if(isHls && Hls.isSupported()) {
     hls=new Hls({
       enableWorker:true,
       lowLatencyMode:false,
       backBufferLength:60,
       maxBufferLength:30,
       maxMaxBufferLength:60,
       manifestLoadingTimeOut:15000,
       fragLoadingTimeOut:20000,
       manifestLoadingMaxRetry:2,
       fragLoadingMaxRetry:2
     });
     hls.attachMedia(video);
     hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(stream.url));
     hls.on(Hls.Events.ERROR,(_,data)=>{
       if(!data.fatal)return;
       if(data.type===Hls.ErrorTypes.NETWORK_ERROR && !recoveredNetwork) {
         recoveredNetwork=true;
         hls.startLoad();
       } else if(data.type===Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
         recoveredMedia=true;
         hls.recoverMediaError();
       } else {
         onError?.(data);
       }
     });
   } else {
     video.src=stream.url;
     if(isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
       onError?.(new Error('This browser cannot play HLS streams.'));
     }
   }
   return()=>{
     if(hls)hls.destroy();
     video.removeAttribute('src');
     video.load();
   };
 },[stream?.url,stream?.type]);
 return <video ref={videoRef} controls autoPlay playsInline onError={onError}/>;
}

function Watch(){
 const {id,episode,audio}=useParams();
 const [searchParams]=useSearchParams();
 const routeMalId=searchParams.get('mal');
 const [anime,setAnime]=useState(null);
 const [loading,setLoading]=useState(!routeMalId);
 const [error,setError]=useState('');
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
   let alive=true;
   setFailed(false);
   if(routeMalId) {
     setLoading(false);
     setError('');
     return()=>{alive=false};
   }
   setLoading(true);setError('');
   anilist(DETAILS_QUERY,{id:Number(id)},AbortSignal.timeout(10000))
     .then(data=>{if(alive)setAnime(data?.Media||null);})
     .catch(e=>{if(alive)setError(e?.message||'Could not load anime details.');})
     .finally(()=>{if(alive)setLoading(false);});
   return()=>{alive=false};
 },[id,routeMalId]);
 const malId=routeMalId||anime?.idMal;
 const embed=buildEmbedFallback(malId,episode,audio);
 return <><Header/><main className="watch-page"><Link to={'/anime/'+id} className="back">‹ BACK TO ANIME</Link><h1>{anime?titleOf(anime):'Episode'} {episode} <small>{audio.toUpperCase()}</small></h1>{loading?<div className="player-message"><div className="spinner"/>Preparing embed player…</div>:embed&&!failed?<div className="player"><iframe title="Episode player" src={embed.embed} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(true)}/></div>:<div className="notice">{failed?'The embed provider could not be loaded.':'Embed playback is not configured yet.'} {error&&<p>{error}</p>}<p>Set VITE_EMBED_TEMPLATE in the frontend deployment settings to an authorized HTTPS embed URL containing {'{malId}'}, {'{episode}'}, and optionally {'{audio}'}.</p></div>}</main></>;
}
function App(){return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<AnimeDetails/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<Home/>}/></Routes></HashRouter>}
export default App;
