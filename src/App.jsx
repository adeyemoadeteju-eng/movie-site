import React, { useEffect, useState } from 'react';
import { HashRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

const API = (import.meta.env.VITE_KUHI_API_URL || 'https://anime-api-jqpp.onrender.com').replace(/\/$/, '');
const GRAPHQL = 'https://graphql.anilist.co';
const JIKAN = 'https://api.jikan.moe/v4';
const VIDSRC_TEMPLATE = import.meta.env.VITE_VIDSRC_TEMPLATE || '';
const EMBED_TEMPLATE = import.meta.env.VITE_EMBED_TEMPLATE || '';
const EMBED_NAME = import.meta.env.VITE_EMBED_NAME || 'Embed player';
const FALLBACK_EMBED_TEMPLATE = import.meta.env.VITE_FALLBACK_EMBED_TEMPLATE || '';
const FALLBACK_EMBED_NAME = import.meta.env.VITE_FALLBACK_EMBED_NAME || 'Backup player';
const SUPEREMBED_TEMPLATE = import.meta.env.VITE_SUPEREMBED_TEMPLATE || '';
const SUPEREMBED_NAME = import.meta.env.VITE_SUPEREMBED_NAME || 'SuperEmbed';
const ARCHIVE_TEMPLATE = import.meta.env.VITE_ARCHIVE_TEMPLATE || '';
const ARCHIVE_NAME = import.meta.env.VITE_ARCHIVE_NAME || 'Archive.org';
const TWOEMBED_DOMAIN = (import.meta.env.VITE_2EMBED_DOMAIN || 'https://www.2embed.cc').replace(/\/$/, '');
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

function externalIds(links = []) {
  const ids = { imdbId: '', tmdbId: '' };
  for (const item of links) {
    const url = String(item?.url || '');
    const site = String(item?.site || '').toLowerCase();
    const imdb = url.match(/\b(tt\d{7,})\b/i);
    const tmdb = url.match(/(?:themoviedb\.org\/(?:anime|tv|movie)\/|tmdb(?:id)?[=/])([0-9]+)/i);
    if (imdb && !ids.imdbId) ids.imdbId = imdb[1];
    if (tmdb && !ids.tmdbId) ids.tmdbId = tmdb[1];
    if (site.includes('imdb') && /^tt\d{7,}$/i.test(url) && !ids.imdbId) ids.imdbId = url;
    if (site.includes('tmdb') && /^\d+$/.test(url) && !ids.tmdbId) ids.tmdbId = url;
  }
  return ids;
}

function buildTemplateEmbed(template, server, values, required = ['episode']) {
  if (!template || required.some(key => !values[key])) return null;
  const tokens = [...template.matchAll(/\{(anilistId|malId|imdbId|tmdbId|id|season|episode|audio)\}/g)].map(match => match[1]);
  if (tokens.some(key => !values[key])) return null;
  const raw = template.replace(/\{(anilistId|malId|imdbId|tmdbId|id|season|episode|audio)\}/g,
    (_, key) => encodeURIComponent(String(values[key] ?? '')));
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return { server, type: 'embed', embed: url.toString() };
  } catch {
    return null;
  }
}

function buildPlayerSources(values) {
  const ids = externalIds(values.externalLinks);
  const tokens = {
    anilistId: values.anilistId,
    malId: values.malId,
    imdbId: values.imdbId || ids.imdbId,
    tmdbId: values.tmdbId || ids.tmdbId,
    id: values.imdbId || ids.imdbId || values.tmdbId || ids.tmdbId,
    season: values.season || 1,
    episode: values.episode,
    audio: values.audio === 'dub' ? 'dub' : 'sub'
  };
  const candidates = [
    buildTemplateEmbed(VIDSRC_TEMPLATE, 'VidSrc', tokens),
    (tokens.id ? {
      server: '2Embed',
      type: 'embed',
      embed: TWOEMBED_DOMAIN + '/embedtv/' + encodeURIComponent(tokens.id) + '&s=' +
        encodeURIComponent(String(tokens.season)) + '&e=' + encodeURIComponent(String(tokens.episode))
    } : null),
    buildTemplateEmbed(EMBED_TEMPLATE, EMBED_NAME, tokens),
    buildTemplateEmbed(SUPEREMBED_TEMPLATE, SUPEREMBED_NAME, tokens),
    buildTemplateEmbed(FALLBACK_EMBED_TEMPLATE, FALLBACK_EMBED_NAME, tokens),
    buildTemplateEmbed(ARCHIVE_TEMPLATE, ARCHIVE_NAME, tokens, ['episode'])
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter(source => {
    if (seen.has(source.embed)) return false;
    seen.add(source.embed);
    return true;
  });
}
const titleOf = a => a?.title?.english || a?.title?.romaji || 'Untitled anime';
const imageOf = a => a?.coverImage?.extraLarge || a?.coverImage?.large || '';

function useKeepWarm() {
  useEffect(() => {
    let stopped = false;
    const ping = () => {
      if (!stopped && document.visibilityState === 'visible') {
        fetch(API+'/', { method:'GET', cache:'no-store', signal:AbortSignal.timeout(12000) }).catch(()=>{});
      }
    };
    ping();
    const interval = setInterval(ping, 10 * 60 * 1000);
    const onVisibility = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stopped = true; clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
}

function useCatalog() {
  const [data,setData] = useState({trending:[],popular:[],loading:true,error:''});
  useEffect(() => {
    let alive=true;
    let cached = null;
    try { cached = localStorage.getItem('zoro-catalog'); } catch {}
    if(cached){try{const c=JSON.parse(cached); if(Date.now()-c.time<12*60*1000) setData({...c.value,loading:true});}catch{}}
    (async()=>{
      try{
        const [t,p]=await Promise.all([
          anilist(LIST_QUERY,{sort:['TRENDING_DESC'],page:1}),
          anilist(LIST_QUERY,{sort:['POPULARITY_DESC'],page:1})
        ]);
        const value={trending:t.Page.media,popular:p.Page.media};
        try { localStorage.setItem('zoro-catalog',JSON.stringify({time:Date.now(),value})); } catch {}
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
         return <Link key={number} className="episode" to={'/watch/'+id+'/'+encodeURIComponent(number)+'/'+audio+'/embed?mal='+encodeURIComponent(anime.idMal||'')+'&imdb='+encodeURIComponent(externalIds(anime.externalLinks).imdbId)+'&tmdb='+encodeURIComponent(externalIds(anime.externalLinks).tmdbId)+'&season=1&title='+encodeURIComponent(titleOf(anime))}>
           <span>EP {number}</span><b>Episode {number}</b><small>▶ OPEN EMBED</small>
         </Link>;
       }):<div className="notice">AniList has not provided an episode count for this title.</div>}
       {err&&<div className="notice">Anime details warning: {err}</div>}
     </section>
   </>:<div className="notice">{err||'Anime could not be loaded.'}</div>}
 </main></>
}
function Watch(){
 const {id,episode,audio}=useParams();
 const [searchParams]=useSearchParams();
 const malId=searchParams.get('mal')||'';
 const displayTitle=searchParams.get('title')||'Episode';
 const imdbId=searchParams.get('imdb')||'';
 const tmdbId=searchParams.get('tmdb')||'';
 const season=searchParams.get('season')||'1';
 const [selected,setSelected]=useState(0);
 const [frameLoading,setFrameLoading]=useState(true);
 const [frameError,setFrameError]=useState(false);
 const [frameVersion,setFrameVersion]=useState(0);
 const players=buildPlayerSources({anilistId:id,malId,imdbId,tmdbId,season,episode,audio});
 const active=players[selected]||players[0]||null;

 useEffect(()=>{
   setSelected(0);
   setFrameLoading(true);
   setFrameError(false);
   setFrameVersion(v=>v+1);
 },[id,episode,audio,malId]);

 const choosePlayer=index=>{
   setSelected(index);
   setFrameLoading(true);
   setFrameError(false);
 };

 const reloadPlayer=()=>{
   setFrameLoading(true);
   setFrameError(false);
   setFrameVersion(v=>v+1);
 };

 return <><Header/><main className="watch-page">
   <Link to={'/anime/'+id} className="back">‹ BACK TO ANIME</Link>
   <h1>{displayTitle} · Episode {episode} <small>{audio.toUpperCase()}</small></h1>
   {active?<>
     {frameLoading&&<div className="player-message"><div className="spinner"/>Opening {active.server} player…</div>}
     <div className="player">
       <iframe key={active.embed+'-'+frameVersion} title={active.server+' episode player'} src={active.embed}
         allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
         allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
         onLoad={()=>{setFrameLoading(false);setFrameError(false);}}
         onError={()=>{setFrameLoading(false);setFrameError(true);}}/>
     </div>
     {players.length>1&&<div className="server-list"><b>SOURCE</b>
       {players.map((source,index)=><button type="button" key={source.embed}
         className={index===selected?'selected':''} onClick={()=>choosePlayer(index)}>
         {source.server}
       </button>)}
     </div>}
     {frameError&&<div className="notice">This player reported a loading error. Try another source above or reload the current player.</div>}
     <div className="server-list"><button type="button" onClick={reloadPlayer}>Reload player</button>
       <a className="muted" href={active.embed} target="_blank" rel="noreferrer">Open player separately ↗</a>
     </div>
   </>:<div className="notice">
     No VidSrc embed source is configured for this episode. Add your HTTPS VidSrc URL template as the GitHub Actions variable VITE_VIDSRC_TEMPLATE. It must contain {'{malId}'} and {'{episode}'}; {'{audio}'} is optional. The episode list will still load without it.
   </div>}
 </main></>;
}
function App(){useKeepWarm();return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<AnimeDetails/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<Home/>}/></Routes></HashRouter>}
export default App;
