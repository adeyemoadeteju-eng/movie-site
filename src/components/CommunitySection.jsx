import React,{useCallback,useEffect,useState} from 'react';
import {isSupabaseConfigured,supabase} from '../lib/supabase.js';

const PAGE_SIZE=30;
const REPORT_REASONS=[
 ['spam','Spam or unwanted promotion'],
 ['harassment','Harassment or bullying'],
 ['hate','Hateful or abusive content'],
 ['personal_information','Personal information'],
 ['spoiler','Unmarked or misleading spoiler'],
 ['other','Something else']
];

function timeLabel(value){
 try{return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
 catch{return '';}
}

export default function CommunitySection({animeId,title,episodeNumber=null}){
 const [session,setSession]=useState(null);
 const [comments,setComments]=useState([]);
 const [likes,setLikes]=useState({});
 const [blocks,setBlocks]=useState({});
 const [avatars,setAvatars]=useState({});
 const [loading,setLoading]=useState(false);
 const [hasMore,setHasMore]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [draft,setDraft]=useState('');
 const [spoiler,setSpoiler]=useState(false);
 const [posting,setPosting]=useState(false);
 const [editingId,setEditingId]=useState(null);
 const [editDraft,setEditDraft]=useState('');
 const [editSpoiler,setEditSpoiler]=useState(false);
 const [revealed,setRevealed]=useState({});
 const [reportingId,setReportingId]=useState(null);
 const [reportReason,setReportReason]=useState('spam');
 const [reportDetails,setReportDetails]=useState('');
 const [reportBusy,setReportBusy]=useState(false);

 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  supabase.auth.getSession().then(({data})=>{if(active)setSession(data.session)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
  return()=>{active=false;subscription.unsubscribe()};
 },[]);

 const loadComments=useCallback(async(reset=true)=>{
  if(!session?.user||!supabase)return;
  setLoading(true);setError('');
  try{
   let query=supabase.from('anime_comments')
    .select('id,anime_id,episode_number,user_id,author_username,author_avatar_path,content,contains_spoilers,is_hidden,created_at,updated_at')
    .eq('anime_id',String(animeId))
    .order('created_at',{ascending:false});
   query=episodeNumber==null?query.is('episode_number',null):query.eq('episode_number',Number(episodeNumber));
   const start=reset?0:comments.length;
   const {data,error:loadError}=await query.range(start,start+PAGE_SIZE-1);
   if(loadError)throw loadError;
   const page=data||[];
   setComments(current=>reset?page:[...current,...page]);
   setHasMore(page.length===PAGE_SIZE);
   if(reset)setRevealed({});
   const ids=page.map(item=>item.id);
   if(ids.length){
    const [{data:likeRows,error:likeError},{data:blockRows,error:blockError}]=await Promise.all([
     supabase.from('comment_likes').select('comment_id,user_id').in('comment_id',ids),
     supabase.from('user_blocks').select('blocked_id').eq('blocker_id',session.user.id)
    ]);
    if(likeError)throw likeError;
    if(blockError)throw blockError;
    const nextLikes={};
    for(const row of likeRows||[]){
     const entry=nextLikes[row.comment_id]||{count:0,liked:false};
     entry.count+=1;
     if(row.user_id===session.user.id)entry.liked=true;
     nextLikes[row.comment_id]=entry;
    }
    setLikes(current=>({...current,...nextLikes}));
    setBlocks(Object.fromEntries((blockRows||[]).map(row=>[row.blocked_id,true])));
   }else if(reset){setLikes({});}
   const paths=[...new Set(page.map(item=>item.author_avatar_path).filter(Boolean))];
   if(paths.length){
    const signed=await Promise.all(paths.map(async path=>{
     const {data}=await supabase.storage.from('avatars').createSignedUrl(path,3600);
     return [path,data?.signedUrl||''];
    }));
    setAvatars(current=>({...current,...Object.fromEntries(signed)}));
   }
  }catch(e){setError(e.message||'The discussion could not be loaded.');}
  finally{setLoading(false);}
 },[session?.user?.id,animeId,episodeNumber,comments.length]);

 useEffect(()=>{if(session?.user)loadComments(true);else{setComments([]);setLikes({});}},[session?.user?.id,animeId,episodeNumber]);

 const submitComment=async event=>{
  event.preventDefault();
  const text=draft.trim();
  if(!text||!session?.user||posting)return;
  setPosting(true);setError('');setMessage('');
  try{
   const {error:insertError}=await supabase.from('anime_comments').insert({
    anime_id:String(animeId),
    episode_number:episodeNumber==null?null:Number(episodeNumber),
    user_id:session.user.id,
    content:text,
    contains_spoilers:spoiler
   });
   if(insertError)throw insertError;
   setDraft('');setSpoiler(false);setMessage('Comment posted.');
   await loadComments(true);
  }catch(e){setError(e.message||'Your comment could not be posted.');}
  finally{setPosting(false);}
 };

 const toggleLike=async comment=>{
  if(!session?.user)return;
  setError('');
  const current=likes[comment.id]||{count:0,liked:false};
  try{
   const result=current.liked
    ?await supabase.from('comment_likes').delete().eq('comment_id',comment.id).eq('user_id',session.user.id)
    :await supabase.from('comment_likes').insert({comment_id:comment.id,user_id:session.user.id});
   if(result.error)throw result.error;
   setLikes(old=>({...old,[comment.id]:{count:Math.max(0,current.count+(current.liked?-1:1)),liked:!current.liked}}));
  }catch(e){setError(e.message||'The like could not be saved.');}
 };

 const saveEdit=async event=>{
  event.preventDefault();
  const text=editDraft.trim();
  if(!text||!editingId)return;
  try{
   const {error:saveError}=await supabase.from('anime_comments').update({content:text,contains_spoilers:editSpoiler}).eq('id',editingId).eq('user_id',session.user.id);
   if(saveError)throw saveError;
   setEditingId(null);setMessage('Comment updated.');await loadComments(true);
  }catch(e){setError(e.message||'The comment could not be updated.');}
 };

 const deleteComment=async id=>{
  if(!window.confirm('Delete this comment? This cannot be undone.'))return;
  try{
   const {error:deleteError}=await supabase.from('anime_comments').delete().eq('id',id).eq('user_id',session.user.id);
   if(deleteError)throw deleteError;
   setMessage('Comment deleted.');await loadComments(true);
  }catch(e){setError(e.message||'The comment could not be deleted.');}
 };

 const toggleBlock=async userId=>{
  if(userId===session?.user?.id)return;
  const blocked=Boolean(blocks[userId]);
  const confirmed=window.confirm(blocked?'Unblock this member?':'Block this member? Their comments will be hidden from your account.');
  if(!confirmed)return;
  try{
   const result=blocked
    ?await supabase.from('user_blocks').delete().eq('blocker_id',session.user.id).eq('blocked_id',userId)
    :await supabase.from('user_blocks').insert({blocker_id:session.user.id,blocked_id:userId});
   if(result.error)throw result.error;
   setBlocks(old=>({...old,[userId]:!blocked}));
   setMessage(blocked?'Member unblocked.':'Member blocked. Their comments are now hidden.');
   await loadComments(true);
  }catch(e){setError(e.message||'The block setting could not be changed.');}
 };

 const submitReport=async event=>{
  event.preventDefault();if(!reportingId||!session?.user||reportBusy)return;
  setReportBusy(true);setError('');
  try{
   const {error:reportError}=await supabase.from('comment_reports').insert({
    comment_id:reportingId,reporter_id:session.user.id,reason:reportReason,details:reportDetails.trim()
   });
   if(reportError)throw reportError;
   setReportingId(null);setReportDetails('');setMessage('Thanks. Your report was sent to the moderation queue.');
  }catch(e){setError(e.code==='23505'?'You have already reported this comment.':e.message||'The report could not be sent.');}
  finally{setReportBusy(false);}
 };

 const heading=episodeNumber==null?'Community discussion':'Episode discussion';
 if(!isSupabaseConfigured)return <section className="ad-community"><h2>{heading}</h2><p>Community features are not configured yet.</p></section>;

 return <section className="ad-community" aria-labelledby="ad-community-title">
  <div className="ad-community-heading"><div><span className="ad-community-kicker">ANIORBIT COMMUNITY</span><h2 id="ad-community-title">{heading}</h2><p>{title}{episodeNumber==null?'':' · Episode '+episodeNumber}</p></div><span className="ad-community-count">{comments.length}{hasMore?'+':''} comments</span></div>
  {!session?.user?<div className="ad-community-locked"><p>Sign in to read and join the discussion. Comments are limited to signed-in members.</p></div>:<>
   <form className="ad-community-compose" onSubmit={submitComment}>
    <label htmlFor={'ad-comment-'+animeId+'-'+(episodeNumber||'anime')}>Add to the discussion</label>
    <textarea id={'ad-comment-'+animeId+'-'+(episodeNumber||'anime')} value={draft} onChange={event=>setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Share your thoughts respectfully…" required/>
    <div className="ad-community-compose-foot"><label><input type="checkbox" checked={spoiler} onChange={event=>setSpoiler(event.target.checked)}/> Contains spoilers</label><span>{draft.length}/2000</span><button type="submit" disabled={posting||!draft.trim()}>{posting?'Posting…':'Post comment'}</button></div>
    <p className="ad-community-guideline">Be respectful. Don't share personal information. Posts are limited to five every five minutes.</p>
   </form>
   {loading&&comments.length===0?<p className="ad-community-empty">Loading discussion…</p>:comments.length===0?<p className="ad-community-empty">No comments yet. Start the conversation!</p>:<div className="ad-comment-list">
    {comments.map(comment=>{
     const meta=likes[comment.id]||{count:0,liked:false};
     const own=comment.user_id===session.user.id;
     const isRevealed=Boolean(revealed[comment.id]);
     return <article className="ad-comment" key={comment.id}>
      <div className="ad-comment-avatar">{avatars[comment.author_avatar_path]?<img src={avatars[comment.author_avatar_path]} alt=""/>:<span>{(comment.author_username||'M').slice(0,1).toUpperCase()}</span>}</div>
      <div className="ad-comment-body">
       <div className="ad-comment-meta"><b>{comment.author_username||'AniOrbit member'}</b><time dateTime={comment.created_at}>{timeLabel(comment.created_at)}{comment.updated_at!==comment.created_at?' · edited':''}</time></div>
       {comment.is_hidden?<p className="ad-comment-hidden">This comment is hidden by a moderator.</p>:editingId===comment.id?<form className="ad-comment-edit" onSubmit={saveEdit}><textarea value={editDraft} onChange={event=>setEditDraft(event.target.value)} maxLength={2000} rows={3} required/><label><input type="checkbox" checked={editSpoiler} onChange={event=>setEditSpoiler(event.target.checked)}/> Contains spoilers</label><button type="submit">Save</button><button type="button" onClick={()=>setEditingId(null)}>Cancel</button></form>:comment.contains_spoilers&&!isRevealed?<button type="button" className="ad-spoiler-reveal" onClick={()=>setRevealed(old=>({...old,[comment.id]:true}))}>Spoiler hidden · reveal comment</button>:<p className="ad-comment-text">{comment.content}</p>}
       <div className="ad-comment-actions"><button type="button" onClick={()=>toggleLike(comment)} disabled={comment.is_hidden}>{meta.liked?'♥ Liked':'♡ Like'} · {meta.count}</button>
        {own&&!comment.is_hidden&&<><button type="button" onClick={()=>{setEditingId(comment.id);setEditDraft(comment.content);setEditSpoiler(comment.contains_spoilers);}}>Edit</button><button type="button" onClick={()=>deleteComment(comment.id)}>Delete</button></>}
        {!own&&!comment.is_hidden&&<><button type="button" onClick={()=>{setReportingId(comment.id);setReportReason('spam');setReportDetails('')}}>Report</button><button type="button" onClick={()=>toggleBlock(comment.user_id)}>{blocks[comment.user_id]?'Unblock member':'Block member'}</button></>}
       </div>
       {reportingId===comment.id&&<form className="ad-report-form" onSubmit={submitReport}><label>Reason<select value={reportReason} onChange={event=>setReportReason(event.target.value)}>{REPORT_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Extra details (optional)<textarea value={reportDetails} onChange={event=>setReportDetails(event.target.value)} maxLength={500} rows={2}/></label><div><button type="submit" disabled={reportBusy}>{reportBusy?'Sending…':'Send report'}</button><button type="button" onClick={()=>setReportingId(null)}>Cancel</button></div></form>}
      </div>
     </article>;
    })}
   </div>}
   {hasMore&&<button className="ad-community-more" type="button" onClick={()=>loadComments(false)} disabled={loading}>{loading?'Loading…':'Load more comments'}</button>}
   {message&&<p className="ad-community-message" role="status">{message}</p>}
   {error&&<p className="ad-community-error" role="alert">{error}</p>}
  </>}
 </section>;
}
