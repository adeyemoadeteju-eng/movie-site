import React,{useEffect,useMemo,useRef,useState} from 'react';
import {HashRouter,Link,Route,Routes,useNavigate,useParams,useSearchParams} from 'react-router-dom';

const API=(import.meta.env.VITE_KUHI_API_URL||import.meta.env.VITE_ANIME_API_URL||'https://anime-api-jqpp.onrender.com').replace(/\/+$/,'');
const API_CACHE_KEY='animedex-api-cache-v1';
const API_CACHE=new Map();
const API_IN_FLIGHT=new Map();

function apiCacheTtl(path){
 if(path.startsWith('/anime/dub-finder/'))return 6*60*60*1000;
 if(path==='/anime/home')return 2*60*1000;
 if(path.startsWith('/anime/info/'))return 15*60*1000;
 if(path.startsWith('/anime/search?'))return 90*1000;
 if(path.startsWith('/anime/filter?'))return 3*60*1000;
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
const title=a=>a?.title?.english||a?.title?.romaji||a?.title?.native||a?.name||'Untitled';
const image=a=>a?.coverImage?.extraLarge||a?.coverImage?.large||a?.image||a?.poster||'';
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

function Header({onSearch,onSettings}){
 const [q,setQ]=useState('');
 const nav=useNavigate();
 const submit=e=>{e.preventDefault();const term=q.trim();if(!term)return;if(onSearch)onSearch(e,term);else nav('/?q='+encodeURIComponent(term))};
 return <header className="ad-header"><div className="ad-header-inner"><Link to="/" className="ad-brand" aria-label="AnimeDex home"><span className="ad-wordmark">Anime<span>Dex</span></span></Link><nav className="ad-nav" aria-label="Main navigation"><Link to="/">Discover</Link></nav><form className="ad-search" onSubmit={submit}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search anime..." aria-label="Search Anime" required/><button aria-label="Search"><span>Search</span><b>↵</b></button></form>{onSettings&&<button className="ad-settings-trigger" onClick={onSettings} aria-label="Open settings">Settings</button>}</div></header>
}
function Footer(){return <footer className="ad-footer"><div className="ad-footer-inner"><Link to="/" className="ad-footer-brand">Anime<span>Dex</span></Link><p>Discover your next anime.</p><span className="ad-footer-note">ANIMEDEX</span></div></footer>}
function Tile({item,priority=false}){return <Link className="ad-tile" to={'/anime/'+item.id}><div className="ad-poster">{image(item)?<img loading={priority?'eager':'lazy'} decoding="async" fetchPriority={priority?'high':'auto'} src={image(item)} alt={title(item)}/>:<div className="ad-no-image"><span>No artwork</span></div>}<span className="ad-tag">{item?.format||'TV'}</span></div><div className="ad-tile-info"><h3>{title(item)}</h3><span>{(item?.genres||[]).slice(0,2).join(' · ')||item?.seasonYear||''}</span></div></Link>}
function TileGrid({items,loading,emptyLabel='No anime found.'}){return <div className="ad-grid">{items?.length?items.map((x,i)=><Tile key={x.id||i} item={x} priority={i<3}/>):<div className="ad-empty">{loading?'Loading anime...':emptyLabel}</div>}</div>}
function Home(){
 const defaults={autoplayTrailer:true,quickTags:true,accent:'lavender'};
 const [prefs,setPrefs]=useState(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem('animedex-settings')||'{}')}}catch{return defaults}});
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [selectedGenre,setSelectedGenre]=useState('');const [formatFilter,setFormatFilter]=useState('all');
 const [data,setData]=useState({popular:[],recent:[],loading:true,error:''});
 const [query,setQuery]=useState(new URLSearchParams(location.hash.split('?')[1]||'').get('q')||'');
 const [results,setResults]=useState(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const [slide,setSlide]=useState(0);const request=useRef(0);
 useEffect(()=>{try{localStorage.setItem('animedex-settings',JSON.stringify(prefs));document.documentElement.dataset.accent=prefs.accent||'lavender'}catch{}},[prefs]);
 useEffect(()=>{let live=true;api('/anime/home').then(home=>{if(live)setData({popular:Array.isArray(home.popular)?home.popular:[],recent:Array.isArray(home.recent)?home.recent:[],loading:false,error:''})}).catch(error=>{if(live)setData({popular:[],recent:[],loading:false,error:error.message||'Could not connect to catalogue.'})});return()=>{live=false}},[]);
 const featured=data.popular[slide%Math.max(data.popular.length,1)];
 const search=async (e,term=query)=>{e?.preventDefault();const q=String(term||'').trim();if(!q){setResults(null);setSelectedGenre('');return}setQuery(q);setSelectedGenre('');setFormatFilter('all');const id=++request.current;setBusy(true);setErr('');setResults([]);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');if(id===request.current)setResults(d.results||[])}catch(x){if(id===request.current)setErr(x.message)}finally{if(id===request.current)setBusy(false)}};
 const filterGenre=async genre=>{const id=++request.current;setSelectedGenre(genre);setFormatFilter('all');setQuery(genre);setBusy(true);setErr('');setResults([]);try{const d=await api('/anime/filter?genre='+encodeURIComponent(genre)+'&page=1&per_page=30');if(id===request.current)setResults(d.results||[])}catch(e){if(id===request.current)setErr(e.message)}finally{if(id===request.current)setBusy(false)}};
 useEffect(()=>{const q=new URLSearchParams(location.hash.split('?')[1]||'').get('q');if(q){setQuery(q);searchQuery(q)}},[]);
 async function searchQuery(q){setBusy(true);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');setResults(d.results||[])}catch(e){setErr(e.message)}finally{setBusy(false)}}
 const genres=['Action','Adventure','Comedy','Drama','Fantasy','Mystery','Romance','Sci-Fi'];
 const visibleResults=(results||[]).filter(item=>formatFilter==='all'||(formatFilter==='movie'?String(item?.format||'').toUpperCase()==='MOVIE':String(item?.format||'').toUpperCase()!=='MOVIE'));
 return <><Header onSearch={search} onSettings={()=>setSettingsOpen(v=>!v)}/>{settingsOpen&&<div className="ad-settings-panel" role="dialog" aria-label="AnimeDex settings"><div className="ad-settings-head"><b>Settings</b><button onClick={()=>setSettingsOpen(false)} aria-label="Close settings">×</button></div><label><input type="checkbox" checked={prefs.autoplayTrailer} onChange={e=>setPrefs(p=>({...p,autoplayTrailer:e.target.checked}))}/> Autoplay muted trailers</label><label><input type="checkbox" checked={prefs.quickTags} onChange={e=>setPrefs(p=>({...p,quickTags:e.target.checked}))}/> Show quick genre tags</label><label className="ad-accent-setting">Accent colour<select value={prefs.accent} onChange={e=>setPrefs(p=>({...p,accent:e.target.value}))}><option value="lavender">Lavender</option><option value="blue">Blue</option><option value="mint">Mint</option></select></label><p>These settings are saved in this browser.</p></div>}<main className="ad-main">{results===null&&<section className="ad-home-intro" aria-label="AnimeDex search">
 <div className="ad-home-intro-brand"><span>Anime</span><span>Dex</span></div>
 <p className="ad-home-intro-subtitle">Find your next watch.</p>
 <form className="ad-home-search" onSubmit={search}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
  <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anime..." aria-label="Search Anime" autoComplete="off" required/>
  <button type="submit" disabled={busy}>{busy?'Searching':'Search'}<span>↵</span></button>
 </form>
</section>}
 {data.error&&<div className="ad-catalogue-error" role="alert"><span>The catalogue is temporarily unavailable. Your page is still working; try loading the catalogue again.</span><button onClick={()=>window.location.reload()}>Retry</button></div>}
 {results===null?<>
 <section className="ad-hero">{featured?<> {prefs.autoplayTrailer&&trailerEmbed(featured)?<iframe className="ad-hero-trailer" loading="lazy" src={trailerEmbed(featured)} title={title(featured)+" muted trailer preview"} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/>:<img className="ad-hero-bg" src={image(featured)} alt=""/>}<div className="ad-hero-shade"/><div className="ad-hero-content"><div className="ad-spotlight">FEATURED ANIME</div><h1>{title(featured)}</h1><div className="ad-hero-meta"><span className="ad-chip">HD</span><span className="ad-chip">{featured.format||'TV'}</span><span>{featured.seasonYear||''}</span></div><p>{clean(featured.description||featured.synopsis).slice(0,210)||'Discover your next favourite anime.'}</p><div className="ad-hero-actions"><Link className="ad-watch" to={'/anime/'+featured.id}>View details</Link><button className="ad-more" onClick={()=>setSlide((slide+1)%Math.max(data.popular.length,1))}>Next pick</button></div></div><div className="ad-dots">{data.popular.slice(0,6).map((x,i)=><button key={x.id||i} className={i===slide?'active':''} onClick={()=>setSlide(i)} aria-label={'Spotlight '+(i+1)}/>)}</div></>:<div className="ad-hero-empty"><div className="ad-spotlight">ANIMEDEX DISCOVER</div><h1>Find your next anime obsession.</h1><p>Explore new worlds, unforgettable characters, and stories worth staying up for.</p></div>}</section>
 {prefs.quickTags&&<section className="ad-quick-tags" aria-label="Browse by genre"><span>Browse by genre</span>{genres.map(genre=><button key={genre} onClick={()=>filterGenre(genre)}>{genre}</button>)}</section>}
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
function Details(){
 const {id}=useParams();const [anime,setAnime]=useState(null);const [loading,setLoading]=useState(true);const [err,setErr]=useState('');const [similar,setSimilar]=useState([]);
 const [episodeList,setEpisodeList]=useState([]);const [episodesLoading,setEpisodesLoading]=useState(false);const [episodesError,setEpisodesError]=useState('');
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
  if(!anime?.id){setSimilar([]);return}
  const genres=Array.isArray(anime.genres)?anime.genres.filter(Boolean):[];
  const pool=new Map();
  const add=(item,boost=0)=>{
   if(!item?.id||String(item.id)===String(id))return;
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
 useEffect(()=>{loadEpisodes();},[id]);
 useEffect(()=>{
  let live=true;
  setWatchOptions(null);
  setWatchOptionsLoading(true);
  api('/anime/dub-finder/'+encodeURIComponent(id)+'?region=CA')
   .then(data=>{if(live)setWatchOptions(data)})
   .catch(error=>{if(live)setWatchOptions({status:'lookup_failed',error:error.message||'Lookup unavailable'})})
   .finally(()=>{if(live)setWatchOptionsLoading(false)});
  return()=>{live=false};
 },[id]);
 const count=Math.min(Number(anime?.episodes)||0,500);
 const displayedEpisodes=episodeList.length?episodeList:Array.from({length:count},(_,i)=>({number:i+1,title:'Episode '+(i+1)}));
 const seasonNumber=seasonNumberFor(anime);
 const seasonLinks=(anime?.relations?.edges||[]).filter(edge=>['PREQUEL','SEQUEL'].includes(edge?.relationType)&&edge?.node?.type==='ANIME'&&['TV','ONA'].includes(edge?.node?.format)&&edge?.node?.id).filter((edge,index,all)=>all.findIndex(other=>String(other.node.id)===String(edge.node.id))===index).sort((a,b)=>(a.relationType==='PREQUEL'?-1:1)-(b.relationType==='PREQUEL'?-1:1));
 return <><Header/>{loading?<div className="ad-loading">Loading anime...</div>:anime?<main className="ad-detail">
 <div className="ad-detail-backdrop" style={{backgroundImage:'url('+image(anime)+')'}}/>
 <section className="ad-detail-top"><div className="ad-detail-poster"><img src={image(anime)} alt={title(anime)}/></div><div className="ad-detail-copy"><h1>{title(anime)}</h1><div className="ad-detail-tags"><span>HD</span><span>{anime.format||'TV'}</span><span>{anime.seasonYear||'—'}</span></div><Link className="ad-watch" to={'/watch/'+id+'/1/sub/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}>▶ &nbsp; Watch Now</Link><p className="ad-synopsis">{clean(anime.description||anime.synopsis)||'No synopsis available.'}</p></div><aside className="ad-info"><h3>Overview:</h3><p>{clean(anime.description||anime.synopsis)||'No overview available.'}</p>{[['Other Names',anime.title?.native||anime.title?.romaji],['Episodes',episodeList.length||anime.episodes||'—'],['Release Year',anime.seasonYear||'—'],['Type',anime.format||'TV'],['Status',anime.status||'—']].map(([k,v])=><div className="ad-info-row" key={k}><b>{k}:</b><span>{v||'—'}</span></div>)}<div className="ad-genres"><b>Genres:</b> {(anime.genres||[]).join(', ')}</div></aside></section>
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
 <section className="ad-episodes" id="watch"><h2>Season {seasonNumber} Episodes</h2>{episodesLoading&&!displayedEpisodes.length?<p>Loading episode list...</p>:displayedEpisodes.length?<><div className="ad-episode-grid">{displayedEpisodes.map(ep=><Link key={ep.number} to={'/watch/'+id+'/'+ep.number+'/sub/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}><b>S{seasonNumber} · EP {ep.number}</b><span>{ep.title||title(anime)+' - Episode '+ep.number}</span><i>▶</i></Link>)}</div>{episodesError&&<p className="ad-error">Live episode data is temporarily unavailable. Showing the episode count from AniList instead.</p>}</>:<div><p>{episodesError?'The episode list could not be loaded.':'Episode count is not available for this title.'}</p><button className="ad-reset" onClick={loadEpisodes} disabled={episodesLoading}>{episodesLoading?'Retrying...':'Retry episode list'}</button></div>}{seasonLinks.length>0&&<div className="ad-season-nav"><div className="ad-season-heading"><h3>More Seasons</h3><span>Continue the series</span></div><div className="ad-season-grid">{seasonLinks.map(edge=><Link className="ad-season-card" key={edge.node.id} to={'/anime/'+edge.node.id}><img loading="lazy" src={edge.node.coverImage?.extraLarge||edge.node.coverImage?.large||''} alt=""/><span className="ad-season-card-copy"><small>{edge.relationType==='PREQUEL'?'Previous season':'Next season'}</small><b>{edge.node.title?.english||edge.node.title?.romaji||'Related season'}</b>{edge.node.episodes&&<em>{edge.node.episodes} episodes</em>}</span><i>›</i></Link>)}</div></div>}</section>
 <section className="ad-section"><h2>Similar Animes</h2><TileGrid items={similar} loading={false}/></section>
 </main>:<div className="ad-loading ad-error">{err||'Anime could not be loaded.'}</div>}<Footer/></>
}
function Watch(){
 const {id,episode,audio}=useParams();const [params]=useSearchParams();const mal=params.get('mal')||'';const name=params.get('title')||'Anime';const [sources,setSources]=useState([]);const [active,setActive]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const own=fallback(mal,episode,audio);
 useEffect(()=>{let live=true;setLoading(true);setError('');api('/anime/playback/'+encodeURIComponent(id)+'?episode='+encodeURIComponent(episode)).then(d=>{if(live){const list=(d.sources||[]).filter(s=>s?.url&&/^https:\/\//i.test(s.url));setSources([...list,...(own?[own]:[])]);if(!list.length&&!own)setError('No playback source is available.')}}).catch(e=>{if(live){setSources(own?[own]:[]);if(!own)setError(e.message)}}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[id,episode,audio,mal]);
 return <><Header/><main className="ad-watch-page"><Link to={'/anime/'+id} className="ad-back">‹ BACK TO ANIME</Link><h1>{name} - Episode {episode} <small>{audio.toUpperCase()}</small></h1>{loading?<div className="ad-player-message">Preparing playback...</div>:sources[active]?<><div className="ad-player"><iframe key={sources[active].url} src={sources[active].url} title={sources[active].name||'Episode player'} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div><div className="ad-servers"><b>SERVER:</b>{sources.map((s,i)=><button key={s.url} className={active===i?'active':''} onClick={()=>setActive(i)}>{s.name||'Server '+(i+1)}</button>)}</div></>:<p className="ad-error">{error||'No source available.'}</p>}</main><Footer/></>
}
class AppErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('AnimeDex render error:',error,info)}
 render(){
  if(this.state.error)return <main className="ad-fatal" role="alert"><div><h1>AnimeDex couldn't finish loading.</h1><p>A page component ran into a problem. Reload the site to start a fresh session.</p><button onClick={()=>window.location.reload()}>Reload AnimeDex</button><details><summary>Technical details</summary><pre>{String(this.state.error)}</pre></details></div></main>;
  return this.props.children;
 }
}
function NotFound(){return <main className="ad-fatal"><div><h1>Page not found</h1><p>This AnimeDex page does not exist.</p><Link className="ad-watch" to="/">Return home</Link></div></main>}
function App(){return <AppErrorBoundary><HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<Details/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<NotFound/>}/></Routes></HashRouter></AppErrorBoundary>}
export default App;
