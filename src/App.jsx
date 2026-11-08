import React, { useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';

const API = (import.meta.env.VITE_KUHI_API_URL || 'https://anime-api-jqpp.onrender.com').replace(/\/$/, '');
const GRAPHQL = 'https://graphql.anilist.co';
const LOGO = 'https://raw.githubusercontent.com/fiskryeziu/zoroClone/main/src/assets/images/logo.png';
const HERO_BG = 'https://raw.githubusercontent.com/fiskryeziu/zoroClone/main/src/assets/images/banner.png';

async function anilist(query, variables = {}) {
  const res = await fetch(GRAPHQL, { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify({query,variables}) });
  if (!res.ok) throw new Error('AniList request failed (' + res.status + ')');
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList error');
  return json.data;
}
const mediaFields = 'id title { romaji english } description(asHtml:false) coverImage { extraLarge large } bannerImage averageScore episodes seasonYear format genres status';
const LIST_QUERY = `query($sort:[MediaSort],$page:Int){ Page(page:$page,perPage:24){ media(type:ANIME,sort:$sort,isAdult:false){ ${mediaFields} } } }`;
const SEARCH_QUERY = `query($search:String){ Page(page:1,perPage:20){ media(type:ANIME,search:$search,isAdult:false,sort:SEARCH_MATCH){ ${mediaFields} } } }`;
const DETAILS_QUERY = `query($id:Int){ Media(id:$id,type:ANIME){ ${mediaFields} } }`;
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
        await fetch(API+'/',{signal:AbortSignal.timeout(90000)}).catch(()=>null);
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
function AnimeDetails(){
 const {id}=useParams(); const [anime,setAnime]=useState(null); const [episodes,setEpisodes]=useState([]); const [provider,setProvider]=useState(''); const [audio,setAudio]=useState('sub'); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);Promise.all([anilist(DETAILS_QUERY,{id:Number(id)}),fetch(API+'/anime/episodes/'+id,{signal:AbortSignal.timeout(90000)}).then(r=>{if(!r.ok)throw Error('Episode API returned '+r.status);return r.json()})]).then(([d,e])=>{if(!alive)return;setAnime(d.Media);const providers=e.providers||{};const names=Object.keys(providers);setProvider(names[0]||'');setEpisodes(providers[names[0]]?.episodes?.sub||[]);}).catch(e=>alive&&setErr(e.message)).finally(()=>alive&&setLoading(false));return()=>{alive=false}},[id]);
 useEffect(()=>{if(!provider)return;fetch(API+'/anime/episodes/'+id).then(r=>r.json()).then(d=>setEpisodes(d.providers?.[provider]?.episodes?.[audio]||[])).catch(()=>{})},[provider,audio,id]);
 return <><Header/><main className="detail-page">{loading?<div className="loading"><div className="spinner"/>Loading anime and episodes…</div>:anime?<><div className="detail-hero" style={{backgroundImage:anime.bannerImage?'linear-gradient(90deg,#202125 5%,rgba(32,33,37,.75)),url('+anime.bannerImage+')':'none'}}><img src={imageOf(anime)}/><div><h1>{titleOf(anime)}</h1><p>{anime.description?.replace(/<[^>]*>/g,'').slice(0,500)}</p><div className="hero-meta"><span>★ {anime.averageScore||'—'}%</span><span>{anime.format}</span><span>{anime.episodes||'?'} episodes</span></div></div></div><section className="episodes"><div className="section-title"><h2>EPISODES</h2><div className="controls"><select value={provider} onChange={e=>setProvider(e.target.value)}>{Object.keys(window.__providers||{}).map(p=><option key={p}>{p}</option>)}</select><select value={audio} onChange={e=>setAudio(e.target.value)}><option value="sub">Sub</option><option value="dub">Dub</option></select></div></div>{episodes.length?episodes.map(ep=><Link key={ep.id} className="episode" to={'/watch/'+id+'/'+ep.number+'/'+audio+'/'+provider}><img src={ep.image} onError={e=>e.currentTarget.style.visibility='hidden'}/><span>EP {ep.number}</span><b>{ep.title||'Episode '+ep.number}</b><small>▶ WATCH</small></Link>):<p className="muted">No {audio} episodes found for this provider yet. Try another provider or audio option.</p>}</section></>:<div className="notice">{err||'Anime could not be loaded.'}</div>}</main></>
}
function Watch(){
 const {id,episode,audio,provider}=useParams(); const [streams,setStreams]=useState([]);const [selected,setSelected]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);setError('');fetch(API+'/anime/extract/'+id+'?e='+episode+'&type='+audio+'&provider='+encodeURIComponent(provider||''),{signal:AbortSignal.timeout(90000)}).then(r=>{if(!r.ok)throw Error('Stream extraction failed ('+r.status+')');return r.json()}).then(d=>{if(!alive)return;setStreams(d.streams||[]);setSelected(Math.max(0,(d.streams||[]).findIndex(s=>s.isActive)));if(!(d.streams||[]).length)setError('No playable sources were returned.');}).catch(e=>alive&&setError(e.message)).finally(()=>alive&&setLoading(false));return()=>{alive=false}},[id,episode,audio,provider]);
 const stream=streams[selected];return <><Header/><main className="watch-page"><Link to={'/anime/'+id} className="back">‹ BACK TO ANIME</Link><h1>Episode {episode} <small>{audio.toUpperCase()}</small></h1>{loading?<div className="player-message"><div className="spinner"/>Connecting to provider… Render may need a moment to wake up.</div>:stream?<><div className="player">{stream.type==='embed'||stream.embed?<iframe title="Anime player" src={stream.embed||stream.url} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer-when-downgrade"/>:stream.type==='hls'?<video controls autoPlay src={stream.url} />:<video controls autoPlay src={stream.url}/>}</div><div className="server-list"><b>SERVER</b>{streams.map((s,i)=><button className={i===selected?'selected':''} onClick={()=>setSelected(i)} key={i}>{s.server||'Server '+(i+1)}{s.isActive?' • ACTIVE':''}</button>)}</div></>:<div className="notice">{error}<p>Try returning to the episode list and selecting another provider.</p></div>}</main></>
}
function App(){return <HashRouter><Routes><Route path="/" element={<Home/>}/><Route path="/anime/:id" element={<AnimeDetails/>}/><Route path="/watch/:id/:episode/:audio/:provider" element={<Watch/>}/><Route path="*" element={<Home/>}/></Routes></HashRouter>}
export default App;
