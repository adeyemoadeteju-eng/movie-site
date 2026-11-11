import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

const GRAPHQL = 'https://graphql.anilist.co';
const API_BASE = import.meta.env.VITE_ANIME_API_URL || 'https://anime-api-jqpp.onrender.com';
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
    return { name: EMBED_NAME, type: 'embed', url: url.toString() };
  } catch {
    return null;
  }
}
const titleOf = a => a?.title?.english || a?.title?.romaji || 'Untitled anime';
const imageOf = a => a?.coverImage?.extraLarge || a?.coverImage?.large || '';

function useCatalog() {
  const [data,setData] = useState({trending:[],popular:[],topRated:[],loading:true,error:''});
  useEffect(() => {
    let alive=true;
    const cached=localStorage.getItem('zoroto-catalog');
    if(cached){
      try{
        const c=JSON.parse(cached);
        if(Date.now()-c.time<12*60*1000) {
          setData({...c.value,topRated:c.value.topRated||[],loading:true});
        }
      }catch{}
    }
    (async()=>{
      try{
        const [t,p,r]=await Promise.all([
          anilist(LIST_QUERY,{sort:['TRENDING_DESC'],page:1}),
          anilist(LIST_QUERY,{sort:['POPULARITY_DESC'],page:1}),
          anilist(LIST_QUERY,{sort:['SCORE_DESC'],page:1})
        ]);
        const value={trending:t.Page.media,popular:p.Page.media,topRated:r.Page.media};
        localStorage.setItem('zoroto-catalog',JSON.stringify({time:Date.now(),value}));
        if(alive)setData({...value,loading:false,error:''});
      }catch(e){
        if(alive)setData(v=>({...v,loading:false,error:e.message||'Could not load catalogue'}));
      }
    })();
    return()=>{alive=false};
  },[]);
  return data;
}

function Header(){
 const [menuOpen,setMenuOpen]=useState(false);
 const nav=useNavigate();
 const location=useLocation();
 const goTo=id=>{
   setMenuOpen(false);
   if(location.pathname!=='/'){
     nav('/');
     window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}),220);
   }else{
     document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
   }
 };
 return <header className="top-bar">
   <Link to="/" className="top-bar-brand" aria-label="Zoro.to home" onClick={()=>setMenuOpen(false)}>
     <img src={LOGO} alt="Zoro.to" onError={e=>e.currentTarget.style.display='none'}/>
   </Link>
   <button className="nav-toggle" type="button" aria-label="Toggle navigation" aria-controls="mainNav" aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)}>
     <span></span><span></span><span></span>
   </button>
   <nav className={menuOpen?'top-bar-nav open':'top-bar-nav'} id="mainNav" aria-label="Main navigation">
     <Link to="/" className="top-bar-link" onClick={()=>setMenuOpen(false)}>Home</Link>
     <button type="button" className="top-bar-link" onClick={()=>goTo('search')}>Search</button>
     <button type="button" className="top-bar-link" onClick={()=>goTo('browse')}>Browse</button>
     <button type="button" className="top-bar-link" onClick={()=>goTo('credits')}>Credits</button>
     <a href="https://github.com/adeyemoadeteju-eng/movie-site" className="top-bar-link top-bar-icon" target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub repository">
       <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true" fill="currentColor">
         <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
       </svg>
     </a>
   </nav>
 </header>
}

function SiteFooter(){
 return <footer className="site-footer" id="credits">
   <p>Interface layout based on <a href="https://github.com/phoenixthrush/AniWorld-Downloader" target="_blank" rel="noreferrer">AniWorld Downloader</a>, adapted for this project.</p>
   <p>Copyright © 2024–2026 phoenixthrush, Tmaster055, SiroxCW, and Yezun-hikari. Used under the <a href="https://github.com/adeyemoadeteju-eng/movie-site/blob/main/THIRD_PARTY_LICENSES/AniWorld-Downloader-MIT.txt" target="_blank" rel="noreferrer">MIT License</a>.</p>
 </footer>
}

function Card({anime}){
 const image=imageOf(anime);
 const subtitle=[anime.format,anime.seasonYear].filter(Boolean).join(' · ');
 return <Link className="poster-card" to={'/anime/'+anime.id}>
   <div className="poster-card-image">
     {image?<img loading="lazy" src={image} alt={titleOf(anime)}/>:<div className="poster-fallback">No image</div>}
     {anime.averageScore>0&&<span className="poster-score">★ {anime.averageScore}%</span>}
   </div>
   <div className="info">
     <div className="title" title={titleOf(anime)}>{titleOf(anime)}</div>
     <div className="subtitle">{subtitle||'Anime'}</div>
   </div>
 </Link>
}

function Home(){
 const {trending,popular,topRated,loading,error}=useCatalog();
 const [activeList,setActiveList]=useState('trending');
 const [searchQuery,setSearchQuery]=useState('');
 const [searchResults,setSearchResults]=useState(null);
 const [searching,setSearching]=useState(false);
 const [searchError,setSearchError]=useState('');
 const nav=useNavigate();
 const lists={
   trending:{label:'Trending',items:trending},
   popular:{label:'Popular',items:popular},
   topRated:{label:'Top Rated',items:topRated}
 };
 const active=lists[activeList]||lists.trending;
 const visibleItems=searchResults!==null?searchResults:active.items;
 const isSearching=searchResults!==null;

 const changeList=key=>{
   setActiveList(key);
   setSearchResults(null);
   setSearchError('');
   setSearchQuery('');
 };

 const submitSearch=async event=>{
   event.preventDefault();
   const term=searchQuery.trim();
   if(!term){
     setSearchError('Enter an anime title to search.');
     setSearchResults(null);
     return;
   }
   setSearching(true);
   setSearchError('');
   try{
     const result=await anilist(SEARCH_QUERY,{search:term});
     setSearchResults(result.Page.media||[]);
   }catch(e){
     setSearchResults([]);
     setSearchError(e.message||'Search could not be completed.');
   }finally{
     setSearching(false);
   }
 };

 const openRandom=()=>{
   const pool=visibleItems.length?visibleItems:[...trending,...popular,...topRated];
   if(!pool.length)return;
   const anime=pool[Math.floor(Math.random()*pool.length)];
   nav('/anime/'+anime.id);
 };

 return <><Header/><main className="page">
   <div className="container">
     <h1 className="page-title">Browse anime</h1>

     <div className="segmented" role="tablist" aria-label="Browse anime by ranking">
       <div className="segmented-track">
         <div className="segmented-thumb" style={{width:'33.333%',transform:'translateX('+(activeList==='trending'?0:activeList==='popular'?100:200)+'%)'}}/>
         {Object.entries(lists).map(([key,value])=><button key={key} type="button" role="tab" aria-selected={activeList===key} className={activeList===key?'segmented-btn active':'segmented-btn'} onClick={()=>changeList(key)}>{value.label}</button>)}
       </div>
     </div>

     <form id="search" className="search-bar" onSubmit={submitSearch}>
       <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} type="search" placeholder="Search anime..." aria-label="Search anime"/>
       <button className="btn btn-primary" type="submit" disabled={searching}>{searching?'Searching...':'Search'}</button>
       <button className="btn btn-secondary" type="button" onClick={openRandom} disabled={!visibleItems.length&&!trending.length&&!popular.length&&!topRated.length}>Random</button>
     </form>

     {loading&&<div className="spinner active">Loading anime...</div>}
     {error&&<div className="notice">{error}. Refresh to try again.</div>}
     {searchError&&<div className="notice">{searchError}</div>}

     <div id="browse">
       <section className="browse-section">
         <h2 className="browse-heading">{isSearching?'Search results':active.label+' anime'}</h2>
         {searching?<div className="spinner active">Searching anime...</div>
          :visibleItems.length>0
            ?<div className="browse-grid">{visibleItems.map(anime=><Card key={anime.id} anime={anime}/>)}</div>
            :isSearching
              ?<div className="empty-state">No anime matched that search.</div>
              :!loading?<div className="empty-state">No titles are available right now.</div>:null}
         {isSearching&&<div className="genre-more"><button className="btn btn-secondary" type="button" onClick={()=>{setSearchResults(null);setSearchError('');setSearchQuery('');}}>Back to browsing</button></div>}
       </section>
     </div>
   </div>
 </main><SiteFooter/></>
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
 const navigate=useNavigate();
 const [anime,setAnime]=useState(null);
 const [malData,setMalData]=useState(null);
 const [episodes,setEpisodes]=useState([]);
 const [audio,setAudio]=useState('sub');
 const [loading,setLoading]=useState(true);
 const [err,setErr]=useState('');

 useEffect(()=>{
   const previousOverflow=document.body.style.overflow;
   document.body.style.overflow='hidden';
   const onKeyDown=event=>{if(event.key==='Escape')navigate('/')};
   window.addEventListener('keydown',onKeyDown);
   return()=>{
     document.body.style.overflow=previousOverflow;
     window.removeEventListener('keydown',onKeyDown);
   };
 },[navigate]);

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
   if(!anime?.idMal)return;
   let alive=true;
   const key='zoroto-jikan-'+anime.idMal;
   const load=async()=>{
     try{
       const saved=JSON.parse(localStorage.getItem(key)||'null');
       if(saved?.data&&Date.now()-saved.time<24*60*60*1000){setMalData(saved.data);return;}
     }catch{}
     const response=await fetch(JIKAN+'/anime/'+encodeURIComponent(anime.idMal)+'/full',{
       headers:{Accept:'application/json'},
       signal:AbortSignal.timeout(10000)
     });
     if(!response.ok)throw new Error('Jikan returned HTTP '+response.status);
     const json=await response.json();
     if(!json?.data)throw new Error('Jikan returned no anime details');
     try{localStorage.setItem(key,JSON.stringify({time:Date.now(),data:json.data}));}catch{}
     if(alive)setMalData(json.data);
   };
   load().catch(()=>{});
   return()=>{alive=false};
 },[anime?.idMal]);

 useEffect(()=>{
   if(!anime){setEpisodes([]);return;}
   const count=Number(anime.episodes)||0;
   setEpisodes(Array.from({length:Math.min(count,500)},(_,i)=>({number:i+1,title:'Episode '+(i+1)})));
 },[anime?.id,anime?.episodes]);

 const close=()=>navigate('/');
 const summary=anime?.description?.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 return <div className="overlay open" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
   <section className="modal" role="dialog" aria-modal="true" aria-label={anime?titleOf(anime):'Anime details'}>
     <button className="modal-close" type="button" aria-label="Close" onClick={close}>×</button>
     {loading?<div className="skeleton-view" aria-live="polite" aria-busy="true">
       <div className="skeleton-header">
         <div className="skeleton skeleton-poster"/>
         <div className="skeleton-meta">
           <div className="skeleton skeleton-title"/>
           <div className="skeleton skeleton-line"/>
           <div className="skeleton skeleton-line"/>
           <div className="skeleton skeleton-line"/>
           <div className="skeleton skeleton-line"/>
         </div>
       </div>
       <div className="skeleton-controls"><div className="skeleton skeleton-field"/></div>
       <div className="skeleton-rows">
         {Array.from({length:6},(_,i)=><div className="skeleton skeleton-row" key={i}/>)}
       </div>
       <div className="skeleton-status">Loading anime details…</div>
     </div>:anime?<>
       <div className="series-header">
         <img src={imageOf(anime)} alt={titleOf(anime)}/>
         <div className="series-meta">
           <h2>{titleOf(anime)}</h2>
           <div className="series-genres">{(anime.genres||[]).join(' · ')}</div>
           <div className="series-year">{anime.seasonYear||'—'} · {anime.format||'Anime'} · {anime.episodes||'?'} episodes</div>
           <div className="series-desc">{summary||'No description is available for this title.'}</div>
           <div className="hero-meta">
             <span>★ {anime.averageScore||'—'}%</span>
             {malData?.score&&<span>MAL {malData.score}</span>}
             {malData?.rank&&<span>Rank #{malData.rank}</span>}
           </div>
         </div>
       </div>

       <div className="control-row">
         <label className="field">
           <span className="field-label">Audio</span>
           <select value={audio} onChange={event=>setAudio(event.target.value)}>
             <option value="sub">Japanese Sub</option>
             <option value="dub">English Dub</option>
           </select>
         </label>
       </div>

       <div className="episodes-header">
         <h3>Episodes</h3>
         <span className="episode-count">{episodes.length} available</span>
       </div>
       {episodes.length?<div className="season-accordion">
         <div className="season-section">
           <div className="season-header expanded">
             <span className="season-label"><span className="arrow expanded">▶</span> Episodes ({episodes.length})</span>
           </div>
           <div className="season-body expanded">
             {episodes.map(ep=><Link key={ep.number} className="episode-item episode-item-link" to={'/watch/'+id+'/'+encodeURIComponent(ep.number)+'/'+audio+'/embed?mal='+encodeURIComponent(anime.idMal||'')+'&title='+encodeURIComponent(titleOf(anime))}>
               <span className="ep-num">EP {ep.number}</span>
               <span className="ep-main"><span className="ep-title">{ep.title}</span></span>
               <span className="episode-open">Watch ›</span>
             </Link>)}
           </div>
         </div>
       </div>:<div className="accordion-message">AniList has not provided an episode count for this title.</div>}
       {err&&<div className="notice">Anime details warning: {err}</div>}
     </>:<div className="notice">{err||'Anime could not be loaded.'}</div>}
   </section>
 </div>
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
 const navigate=useNavigate();
 const [searchParams]=useSearchParams();
 const malId=searchParams.get('mal')||'';
 const titleFromUrl=searchParams.get('title')||'Episode';
 const [sources,setSources]=useState([]);
 const [active,setActive]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [title,setTitle]=useState(titleFromUrl);
 const [matchCandidates,setMatchCandidates]=useState([]);
 const ownEmbed=useMemo(()=>buildEmbedFallback(malId,episode,audio),[malId,episode,audio]);
 useEffect(()=>{
   let alive=true;
   setSources([]);setActive(0);setError('');setLoading(true);setMatchCandidates([]);setTitle(titleFromUrl);
   (async()=>{
     try{
       const response=await fetch(`${API_BASE}/anime/playback/${encodeURIComponent(id)}?episode=${encodeURIComponent(episode)}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
       const payload=await response.json().catch(()=>({}));
       if(!response.ok){
         const detail=payload?.detail;
         if(response.status===409 && detail && typeof detail==='object'){
           if(alive){
             setMatchCandidates(detail.candidates||[]);
             setError(detail.message||'TMDB could not verify the correct show and season.');
           }
           return;
         }
         throw new Error(typeof detail==='string'?detail:'Playback sources could not be prepared.');
       }
       const available=(payload.sources||[]).filter(s=>s?.url && /^https:\/\//i.test(s.url));
       // Prefer TMDB-matched backend sources; the MAL-based embed is backup only.
       const combined=[...available,...(ownEmbed?[ownEmbed]:[])];
       if(!combined.length)throw new Error('No embed sources were returned and no backup embed is configured.');
       if(alive)setSources(combined);
     }catch(e){
       if(alive){
         if(ownEmbed)setSources([ownEmbed]);
         else setError(e?.message||'Playback could not be loaded.');
       }
     }finally{
       if(alive)setLoading(false);
     }
   })();
   return()=>{alive=false;};
 },[id,episode,audio,malId,ownEmbed,titleFromUrl]);
 const source=sources[active];
 const playerUrl=source?.url||'';
 const changeAudio=next=>{
   if(next===audio)return;
   const query=searchParams.toString();
   navigate('/watch/'+encodeURIComponent(id)+'/'+encodeURIComponent(episode)+'/'+next+'/embed'+(query?'?'+query:''),{replace:true});
 };
 return <><Header/><main className="watch-page"><Link to={'/anime/'+id} className="back">‹ BACK TO ANIME</Link><div className="section-title"><h1>{title} {episode} <small>{audio.toUpperCase()}</small></h1><div className="controls"><label htmlFor="watch-audio">AUDIO</label><select id="watch-audio" value={audio==='dub'?'dub':'sub'} onChange={e=>changeAudio(e.target.value)}><option value="sub">Sub</option><option value="dub">Dub</option></select></div></div>
 {loading?<div className="player-message"><div className="spinner"/>Preparing playback sources…</div>
 :source?<><div className="player"><iframe key={playerUrl} title={source.name||'Episode player'} src={playerUrl} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div><div className="server-list" aria-label="Choose playback source"><b>SWITCH SOURCE:</b>{sources.map((item,index)=><button type="button" key={item.url} className={index===active?'selected':''} aria-pressed={index===active} onClick={()=>setActive(index)}>{item.name||('Source '+(index+1))}</button>)}</div><div className="notice">Using {source.name||'selected source'}. The configured backup embed receives the selected Sub/Dub setting; other providers may require changing audio in their own player controls.</div></>
 :<div className="notice">{error||'No playback source is available.'}{matchCandidates.length>0&&<><p>TMDB candidates to verify:</p><ul>{matchCandidates.map(c=><li key={c.tmdbId}>{c.title} ({c.year||'year unknown'})</li>)}</ul></>}</div>}
 </main><SiteFooter/></>;
}
function AppRouter(){
 const location=useLocation();
 const isWatch=location.pathname.startsWith('/watch/');
 return isWatch
   ?<Routes><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<Watch/>}/></Routes>
   :<><Home/><Routes><Route path="/anime/:id" element={<AnimeDetails/>}/></Routes></>;
}
function App(){return <HashRouter><AppRouter/></HashRouter>}
export default App;
