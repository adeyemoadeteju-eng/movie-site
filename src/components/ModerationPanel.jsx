import React,{useEffect,useState} from 'react';
import {supabase} from '../lib/supabase.js';

export default function ModerationPanel({onClose}){
 const [reports,setReports]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busyId,setBusyId]=useState('');

 const load=async()=>{
  setLoading(true);setError('');
  try{
   const {data,error:loadError}=await supabase.from('comment_reports')
    .select('id,reason,details,status,created_at,anime_comments(id,anime_id,episode_number,author_username,content,is_hidden)')
    .eq('status','open').order('created_at',{ascending:true}).limit(100);
   if(loadError)throw loadError;
   setReports(data||[]);
  }catch(e){setError(e.message||'The moderation queue could not be loaded.');}
  finally{setLoading(false);}
 };
 useEffect(()=>{load();},[]);

 const updateReport=async(report,status)=>{
  setBusyId(report.id);setError('');
  try{
   const {error:updateError}=await supabase.from('comment_reports').update({status}).eq('id',report.id);
   if(updateError)throw updateError;
   await load();
  }catch(e){setError(e.message||'The report could not be updated.');}
  finally{setBusyId('');}
 };
 const toggleHidden=async report=>{
  const comment=report.anime_comments;
  if(!comment)return;
  setBusyId(report.id);setError('');
  try{
   const {error:updateError}=await supabase.from('anime_comments').update({is_hidden:!comment.is_hidden}).eq('id',comment.id);
   if(updateError)throw updateError;
   await load();
  }catch(e){setError(e.message||'The comment visibility could not be changed.');}
  finally{setBusyId('');}
 };

 return <div className="ad-auth-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <section className="ad-moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-moderation-title">
   <div className="ad-auth-heading"><div><span className="ad-auth-kicker">ANIORBIT SAFETY TOOLS</span><h2 id="ad-moderation-title">Moderation queue</h2></div><button type="button" onClick={onClose} aria-label="Close moderation queue">×</button></div>
   <p className="ad-moderation-intro">Review member reports, hide content that breaks the community rules, and close reports when reviewed.</p>
   {loading?<p>Loading reports…</p>:reports.length===0?<p className="ad-community-empty">No open reports. Nice and quiet.</p>:<div className="ad-moderation-list">
    {reports.map(report=>{
     const comment=report.anime_comments;
     return <article className="ad-moderation-item" key={report.id}>
      <div className="ad-moderation-meta"><b>{report.reason.replaceAll('_',' ')}</b><time>{new Date(report.created_at).toLocaleString()}</time></div>
      <p className="ad-moderation-context">{comment?comment.author_username+' · Anime '+comment.anime_id+(comment.episode_number?' · Episode '+comment.episode_number:''):'Comment unavailable'}</p>
      {comment&&<blockquote className={comment.is_hidden?'is-hidden':''}>{comment.content}</blockquote>}
      {report.details&&<p className="ad-moderation-details">Report details: {report.details}</p>}
      <div className="ad-moderation-actions">{comment&&<button type="button" disabled={busyId===report.id} onClick={()=>toggleHidden(report)}>{comment.is_hidden?'Unhide comment':'Hide comment'}</button>}<button type="button" disabled={busyId===report.id} onClick={()=>updateReport(report,'reviewed')}>Mark reviewed</button><button type="button" className="secondary" disabled={busyId===report.id} onClick={()=>updateReport(report,'dismissed')}>Dismiss</button></div>
     </article>;
    })}
   </div>}
   {error&&<p className="ad-auth-error" role="alert">{error}</p>}
   <div className="ad-moderation-footer"><button type="button" onClick={load} disabled={loading}>Refresh queue</button><button type="button" className="secondary" onClick={onClose}>Close</button></div>
  </section>
 </div>;
}
