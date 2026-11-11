import React,{useEffect,useMemo,useRef,useState} from 'react';
import Hls from 'hls.js';
import {HashRouter,Link,Route,Routes,useNavigate,useParams,useSearchParams} from 'react-router-dom';

const API=(import.meta.env.VITE_KUHI_API_URL||import.meta.env.VITE_ANIME_API_URL||'https://anime-api-jqpp.onrender.com').replace(/\/+$/,'');
async function api(path){
 const r=await fetch(API+path,{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Request failed ('+r.status+')');
 return d;
}
const title=a=>a?.title?.english||a?.title?.romaji||a?.title?.native||a?.name||'Untitled';
const image=a=>a?.coverImage?.extraLarge||a?.coverImage?.large||a?.image||a?.poster||'';
const clean=s=>(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const EMBED=import.meta.env.VITE_EMBED_TEMPLATE||import.meta.env.VITE_FALLBACK_EMBED_TEMPLATE||'';
const EMBED_NAME=import.meta.env.VITE_EMBED_NAME||'Embed player';
function fallback(mal,ep,audio){if(!EMBED||!mal)return null;try{const u=new URL(EMBED.replaceAll('{malId}',encodeURIComponent(mal)).replaceAll('{episode}',encodeURIComponent(ep)).replaceAll('{audio}',audio));return u.protocol==='https:'?{name:EMBED_NAME,url:u.href}:null}catch{return null}}

function Header({onSearch}){
 const [q,setQ]=useState('');
 const nav=useNavigate();
 const submit=e=>{e.preventDefault();const term=q.trim();if(!term)return;if(onSearch)onSearch(e,term);else nav('/?q='+encodeURIComponent(term))};
 return <header className="ad-header"><Link to="/" className="ad-brand"><span>Anime</span><b>Dex</b></Link><form className="ad-search" onSubmit={submit}><input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Anime..." aria-label="Search Anime" required/><button aria-label="Search">⌕</button></form></header>
}
function Footer(){return <><hr className="ad-rule"/><footer className="ad-footer"><span>MADE WITH <b>♥</b> BY TECH SHREYASH</span><span>AnimeDexLite-inspired interface</span></footer><hr className="ad-rule"/></>}
function Tile({item}){return <Link className="ad-tile" to={'/anime/'+item.id}><div className="ad-poster">{image(item)?<img loading="lazy" src={image(item)} alt={title(item)}/>:<div className="ad-no-image">AnimeDex</div>}<span className="ad-tag">HD</span><span className="ad-tag ad-tag-right">{item?.format||'TV'}</span></div><div className="ad-tile-info"><h3>{title(item)}</h3><span>{(item?.genres||[]).slice(0,2).join(' · ')||item?.seasonYear||''}</span></div></Link>}
function TileGrid({items,loading,emptyLabel='No anime found.'}){return <div className="ad-grid">{items?.length?items.map((x,i)=><Tile key={x.id||i} item={x}/>):<div className="ad-empty">{loading?'Loading anime...':emptyLabel}</div>}</div>}
function Home(){
 const [data,setData]=useState({popular:[],recent:[],loading:true,error:''});
 const [query,setQuery]=useState(new URLSearchParams(location.hash.split('?')[1]||'').get('q')||'');
 const [results,setResults]=useState(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const [slide,setSlide]=useState(0);const request=useRef(0);
 useEffect(()=>{let live=true;(async()=>{const [p,r]=await Promise.allSettled([api('/anime/popular?page=1&per_page=20'),api('/anime/recent?page=1&per_page=20')]);if(!live)return;const popular=p.status==='fulfilled'?p.value.results||[]:[];const recent=r.status==='fulfilled'?r.value.results||[]:[];setData({popular,recent,loading:false,error:p.status==='rejected'&&r.status==='rejected'?'Could not connect to catalogue.':''});})();return()=>{live=false}},[]);
 const featured=data.popular[slide%Math.max(data.popular.length,1)];
 const search=async (e,term=query)=>{e?.preventDefault();const q=String(term||'').trim();if(!q){setResults(null);return}setQuery(q);const id=++request.current;setBusy(true);setErr('');setResults([]);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');if(id===request.current)setResults(d.results||[])}catch(x){if(id===request.current)setErr(x.message)}finally{if(id===request.current)setBusy(false)}};
 useEffect(()=>{const q=new URLSearchParams(location.hash.split('?')[1]||'').get('q');if(q){setQuery(q);searchQuery(q)}},[]);
 async function searchQuery(q){setBusy(true);try{const d=await api('/anime/search?query='+encodeURIComponent(q)+'&page=1&per_page=30');setResults(d.results||[])}catch(e){setErr(e.message)}finally{setBusy(false)}}
 return <><Header onSearch={search}/><main className="ad-main">
 {data.error&&<div className="ad-catalogue-error" role="alert"><span>The catalogue is temporarily unavailable. Your page is still working; try loading the catalogue again.</span><button onClick={()=>window.location.reload()}>Retry</button></div>}
 {results===null?<>
 <section className="ad-hero">{featured&&<><img className="ad-hero-bg" src={image(featured)} alt=""/><div className="ad-hero-shade"/><div className="ad-hero-content"><div className="ad-spotlight">✦ &nbsp;ANIMEDEX SPOTLIGHT</div><h1>{title(featured)}</h1><div className="ad-hero-meta"><span className="ad-chip">HD</span><span className="ad-chip">{featured.format||'TV'}</span><span>{featured.seasonYear||''}</span></div><p>{clean(featured.description||featured.synopsis).slice(0,210)||'Discover your next favourite anime.'}</p><Link className="ad-watch" to={'/anime/'+featured.id}>▶ &nbsp; Watch Now</Link><button className="ad-more" onClick={()=>setSlide((slide+1)%data.popular.length)}>Next Spotlight ›</button></div><div className="ad-dots">{data.popular.slice(0,6).map((x,i)=><button key={x.id||i} className={i===slide?'active':''} onClick={()=>setSlide(i)} aria-label={'Spotlight '+(i+1)}/>)}</div></>}</section>
 <section className="ad-section"><h2>Most Popular</h2><TileGrid items={data.popular} loading={data.loading} emptyLabel={data.error?'Catalogue unavailable. Select Retry above.':'No anime found.'}/></section>
 <section className="ad-section"><h2>Recent Release</h2><TileGrid items={data.recent} loading={data.loading} emptyLabel={data.error?'Catalogue unavailable. Select Retry above.':'No anime found.'}/></section>
 </>:<section className="ad-section ad-results"><h2>Search Results: {query}</h2>{err&&<p className="ad-error">{err}</p>}<TileGrid items={results} loading={busy}/><button className="ad-reset" onClick={()=>{setResults(null);setErr('')}}>Back to Home</button></section>}
 </main><Footer/></>
}
function Details(){
 const {id}=useParams();const [anime,setAnime]=useState(null);const [loading,setLoading]=useState(true);const [err,setErr]=useState('');const [similar,setSimilar]=useState([]);
 useEffect(()=>{let live=true;setLoading(true);api('/anime/info/'+encodeURIComponent(id)).then(a=>{if(live){setAnime(a);setLoading(false)}}).catch(e=>{if(live){setErr(e.message);setLoading(false)}});return()=>{live=false}},[id]);
 useEffect(()=>{let live=true;if(anime?.genres?.[0])api('/anime/filter?genre='+encodeURIComponent(anime.genres[0])+'&page=1&per_page=12').then(d=>{if(live)setSimilar((d.results||[]).filter(x=>String(x.id)!==String(id)).slice(0,10))}).catch(()=>{});return()=>{live=false}},[anime?.id]);
 const count=Math.min(Number(anime?.episodes)||0,500);
 return <><Header/>{loading?<div className="ad-loading">Loading anime...</div>:anime?<main className="ad-detail">
 <div className="ad-detail-backdrop" style={{backgroundImage:'url('+image(anime)+')'}}/>
 <section className="ad-detail-top"><div className="ad-detail-poster"><img src={image(anime)} alt={title(anime)}/></div><div className="ad-detail-copy"><h1>{title(anime)}</h1><div className="ad-detail-tags"><span>HD</span><span>{anime.format||'TV'}</span><span>{anime.seasonYear||'—'}</span></div><Link className="ad-watch" to={'/watch/'+id+'/1/sub/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}>▶ &nbsp; Watch Now</Link><p className="ad-synopsis">{clean(anime.description||anime.synopsis)||'No synopsis available.'}</p></div><aside className="ad-info"><h3>Overview:</h3><p>{clean(anime.description||anime.synopsis)||'No overview available.'}</p>{[['Other Names',anime.title?.native||anime.title?.romaji],['Episodes',anime.episodes||'—'],['Release Year',anime.seasonYear||'—'],['Type',anime.format||'TV'],['Status',anime.status||'—']].map(([k,v])=><div className="ad-info-row" key={k}><b>{k}:</b><span>{v||'—'}</span></div>)}<div className="ad-genres"><b>Genres:</b> {(anime.genres||[]).join(', ')}</div></aside></section>
 <section className="ad-episodes" id="watch"><h2>List Of Episodes:</h2>{count?<div className="ad-episode-grid">{Array.from({length:count},(_,i)=><Link key={i} to={'/watch/'+id+'/'+(i+1)+'/sub/embed?mal='+(anime.idMal||'')+'&title='+encodeURIComponent(title(anime))}><b>EP {i+1}</b><span>{title(anime)} - Episode {i+1}</span><i>▶</i></Link>)}</div>:<p>Episode count is not available for this title.</p>}</section>
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
