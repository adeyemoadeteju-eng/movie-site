import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';

const API = (import.meta.env.VITE_KUHI_API_URL || 'https://anime-api-jqpp.onrender.com').replace(/\/$/, '');
const GRAPHQL = 'https://graphql.anilist.co';
const JIKAN = 'https://api.jikan.moe/v4';
const TMDB_API_KEY = '0d7d64fb0d37c316134f390928a55d6f';
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
 const [episodeData,setEpisodeData]=useState(null);
 const [episodes,setEpisodes]=useState([]);
 const [provider,setProvider]=useState('');
 const [audio,setAudio]=useState('sub');
 const [loading,setLoading]=useState(true);
 const [episodeLoading,setEpisodeLoading]=useState(true);
 const [err,setErr]=useState('');
 const [episodeErr,setEpisodeErr]=useState('');
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
   let alive=true;
   const cacheKey='zoro-episodes-'+id;
   let hasCached=false;
   setEpisodeData(null);
   setEpisodes([]);
   setProvider('');
   setEpisodeLoading(true);
   setEpisodeErr('');
   // Show a previously loaded episode list immediately while refreshing it.
   try{
     const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');
     if(saved?.payload && Date.now()-saved.time<12*60*60*1000){
       const parsed=readEpisodePayload(saved.payload,'sub');
       const first=parsed.names[0]||'';
       setEpisodeData(parsed);
       setProvider(first);
       setEpisodes(first?parsed.getList(parsed.providers[first],'sub'):parsed.getList(parsed.root,'sub'));
       setEpisodeLoading(false);
       hasCached=true;
     }
   }catch{}
   (async()=>{
     try{
       const response=await fetch(API+'/anime/episodes/'+encodeURIComponent(id),{
         signal:AbortSignal.timeout(30000),
         headers:{Accept:'application/json'}
       });
       if(!response.ok) throw new Error('Episode service returned HTTP '+response.status);
       const payload=await response.json();
       if(!alive)return;
       try{localStorage.setItem(cacheKey,JSON.stringify({time:Date.now(),payload}));}catch{}
       const parsed=readEpisodePayload(payload,'sub');
       setEpisodeData(parsed);
       const first=parsed.names[0]||'';
       setProvider(first);
       const list=first ? parsed.getList(parsed.providers[first],'sub') : parsed.getList(parsed.root,'sub');
       setEpisodes(list);
       setEpisodeErr(list.length?'':'The episode API responded, but no sub episodes were found. Try Dub or another provider. Providers returned: '+(parsed.names.join(', ')||'none')+'.');
     }catch(e){
       if(alive && !hasCached) setEpisodeErr(e?.message||'Could not load episodes.');
     }finally{
       if(alive && !hasCached)setEpisodeLoading(false);
     }
   })();
   return()=>{alive=false};
 },[id]);
 useEffect(()=>{
   if(!episodeData || !provider)return;
   const value=episodeData.providers[provider];
   const list=episodeData.getList(value,audio);
   setEpisodes(list);
   setEpisodeErr(list.length?'':'No '+audio+' episodes were returned by '+provider+'. Try another provider or audio option.');
 },[provider,audio,episodeData]);
 return <><Header/><main className="detail-page">
   {loading?<div className="loading"><div className="spinner"/>Loading anime and episodes…</div>:anime?<>
     <div className="detail-hero" style={{backgroundImage:anime.bannerImage?'linear-gradient(90deg,#202125 5%,rgba(32,33,37,.75)),url('+anime.bannerImage+')':'none'}}>
       <img src={imageOf(anime)}/><div><h1>{titleOf(anime)}</h1><p>{anime.description?.replace(/<[^>]*>/g,'').slice(0,500)}</p><div className="hero-meta"><span>★ {anime.averageScore||'—'}%</span><span>{anime.format}</span><span>{anime.episodes||'?'} episodes</span></div><div className="id-mapping"><b>EXTERNAL IDs</b><span>AniList: {anime.id}</span><span>MAL: {anime.idMal||'Not listed'}</span><span>MAL score: {malData?.score??'Loading…'}</span><span>MAL rank: {malData?.rank?'#'+malData.rank:'—'}</span><span>MAL popularity: {malData?.popularity?'#'+malData.popularity:'—'}</span></div></div>
     </div>
     <section className="episodes">
       <div className="section-title"><h2>EPISODES</h2><div className="controls">
         <select value={provider} onChange={e=>setProvider(e.target.value)} disabled={!episodeData?.names?.length}>
           {episodeData?.names?.length ? episodeData.names.map(p=><option key={p} value={p}>{p}</option>) : <option value="">No providers</option>}
         </select>
         <select value={audio} onChange={e=>setAudio(e.target.value)}><option value="sub">Sub</option><option value="dub">Dub</option></select>
       </div></div>
       {episodeLoading?<div className="loading"><div className="spinner"/>Fetching episode list…</div>:episodes.length?episodes.map((ep,i)=>{
         const number=ep.number ?? ep.episodeNumber ?? ep.sourceNumber ?? (i+1);
         const routeProvider=provider||'';
         return <Link key={ep.id||number||i} className="episode" to={'/watch/'+id+'/'+encodeURIComponent(number)+'/'+audio+'/'+encodeURIComponent(routeProvider)}>
           <img src={ep.image||ep.thumbnail||ep.snapshot||''} onError={e=>e.currentTarget.style.visibility='hidden'}/>
           <span>EP {number}</span><b>{ep.title||ep.name||'Episode '+number}</b><small>▶ WATCH</small>
         </Link>;
       }):<div className="notice">{episodeErr||'No episodes are available for this selection.'}</div>}
       {err&&<div className="notice">Anime details warning: {err}</div>}
     </section>
   </>:<div className="notice">{err||'Anime could not be loaded.'}</div>}
 </main></>
}
function Watch(){
 const {id,episode,audio,provider}=useParams();
 const [streams,setStreams]=useState([]);
 const [selected,setSelected]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [usingFallback,setUsingFallback]=useState(false);

 async function resolveEmbedFallback() {
   if (!EMBED_TEMPLATE) return null;
   try {
     const detail=await anilist(DETAILS_QUERY,{id:Number(id)},AbortSignal.timeout(8000));
     return buildEmbedFallback(detail?.Media?.idMal,episode,audio);
   } catch { return null; }
 }

 useEffect(()=>{
   let alive=true;
   setLoading(true); setError(''); setStreams([]); setSelected(0); setUsingFallback(false);
   (async()=>{
     try {
       const response=await fetch(API+'/anime/extract/'+encodeURIComponent(id)+'?e='+encodeURIComponent(episode)+'&type='+encodeURIComponent(audio)+'&provider='+encodeURIComponent(provider||''),{
         signal:AbortSignal.timeout(35000), headers:{Accept:'application/json'}
       });
       if(!response.ok) throw new Error('Stream service returned HTTP '+response.status);
       const payload=await response.json();
       const extracted=Array.isArray(payload?.streams)?payload.streams:[];
       if(!alive)return;
       if(extracted.length) {
         setStreams(extracted);
         const active=extracted.findIndex(s=>s?.isActive);
         setSelected(active>=0?active:0);
         return;
       }
       const fallback=await resolveEmbedFallback();
       if(!alive)return;
       if(fallback) { setStreams([fallback]); setUsingFallback(true); }
       else setError('No playable source was returned. '+(EMBED_TEMPLATE?'The configured backup embed could not be resolved.':'No backup embed is configured.'));
     } catch(e) {
       if(!alive)return;
       const fallback=await resolveEmbedFallback();
       if(!alive)return;
       if(fallback) { setStreams([fallback]); setUsingFallback(true); }
       else setError(e?.name==='TimeoutError'?'Stream request timed out. No backup embed is configured or available.':(e?.message||'Could not load playback sources.'));
     } finally { if(alive)setLoading(false); }
   })();
   return()=>{alive=false};
 },[id,episode,audio,provider]);

 const stream=streams[selected];
 const onPlayerError=async()=>{
   if(usingFallback)return;
   const fallback=await resolveEmbedFallback();
   if(fallback) { setStreams([fallback]); setSelected(0); setUsingFallback(true); setError(''); }
   else setError('This video source could not play. Try another available source.');
 };
 return <><Header/><main className="watch-page"><Link to={'/anime/'+id} className="back">‹ BACK TO ANIME</Link><h1>Episode {episode} <small>{audio.toUpperCase()}</small></h1>{loading?<div className="player-message"><div className="spinner"/>Connecting to playback source…</div>:stream?<><div className="player">{stream.type==='embed'||stream.embed?<iframe title="Video player" src={stream.embed||stream.url} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer-when-downgrade"/>:<video controls autoPlay src={stream.url} onError={onPlayerError}/>}</div><div className="server-list"><b>SOURCE</b>{streams.map((s,i)=><button className={i===selected?'selected':''} onClick={()=>setSelected(i)} key={i}>{s.server||'Server '+(i+1)}{s.isActive?' • ACTIVE':''}</button>)}</div>{usingFallback&&<p className="muted">Using your configured backup embed.</p>}</>:<div className="notice">{error}<p>Try returning to the episode list and selecting another available source.</p></div>}</main></>
}
function App(){useKeepWarm();return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<AnimeDetails/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<Home/>}/></Routes></HashRouter>}
export default App;
