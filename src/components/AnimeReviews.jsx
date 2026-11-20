import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

function displayName(row) {
  return row?.profiles?.is_public
    ? (row.profiles.display_name || row.profiles.username || 'AniOrbit member')
    : 'AniOrbit member';
}

export default function AnimeReviews({ animeId, anime }) {
  const [session, setSession] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [score, setScore] = useState('8');
  const [reviewTitle, setReviewTitle] = useState('');
  const [content, setContent] = useState('');
  const [spoilers, setSpoilers] = useState(false);
  const [revealed, setRevealed] = useState({});

  const loadReviews = useCallback(async userId => {
    if (!userId) {
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('anime_reviews')
        .select('id,user_id,score,title,content,contains_spoilers,created_at,updated_at')
        .eq('anime_id', String(animeId))
        .order('created_at', { ascending: false })
        .limit(100);
      if (queryError) throw queryError;
      const rows = data || [];
      const ids = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
      let profiles = [];
      if (ids.length) {
        const result = await supabase.from('profiles')
          .select('id,username,display_name,is_public')
          .in('id', ids);
        if (!result.error) profiles = result.data || [];
      }
      const byId = Object.fromEntries(profiles.map(profile => [profile.id, profile]));
      setReviews(rows.map(row => ({ ...row, profiles: byId[row.user_id] || null })));
      const own = rows.find(row => row.user_id === userId);
      if (own) {
        setScore(String(own.score));
        setReviewTitle(own.title || '');
        setContent(own.content || '');
        setSpoilers(Boolean(own.contains_spoilers));
      }
    } catch (reason) {
      setError(reason.message || 'Reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [animeId]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const current = data.session || null;
      setSession(current);
      await loadReviews(current?.user?.id);
    };
    start().catch(reason => {
      if (active) {
        setError(reason.message || 'Reviews could not be loaded.');
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      loadReviews(next?.user?.id);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadReviews]);

  const summary = useMemo(() => {
    if (!reviews.length) return null;
    return reviews.reduce((sum, review) => sum + Number(review.score || 0), 0) / reviews.length;
  }, [reviews]);

  const submit = async event => {
    event.preventDefault();
    if (!session?.user || busy) return;
    const cleanContent = content.trim();
    if (!cleanContent || cleanContent.length > 3000) {
      setError('Your review must contain between 1 and 3,000 characters.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        user_id: session.user.id,
        anime_id: String(animeId),
        anime_title: String(anime?.title?.english || anime?.title?.romaji || anime?.title?.native || anime?.name || 'Anime').slice(0, 180),
        score: Number(score),
        title: reviewTitle.trim().slice(0, 100),
        content: cleanContent,
        contains_spoilers: spoilers,
        updated_at: new Date().toISOString()
      };
      const { error: saveError } = await supabase.from('anime_reviews')
        .upsert(payload, { onConflict: 'user_id,anime_id' });
      if (saveError) throw saveError;
      setMessage('Your review was saved.');
      await loadReviews(session.user.id);
    } catch (reason) {
      setError(reason.message || 'Your review could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async review => {
    if (!session?.user || review.user_id !== session.user.id) return;
    if (!window.confirm('Delete your review?')) return;
    setBusy(true);
    setError('');
    try {
      const { error: removeError } = await supabase.from('anime_reviews')
        .delete().eq('id', review.id).eq('user_id', session.user.id);
      if (removeError) throw removeError;
      setMessage('Your review was deleted.');
      setReviewTitle('');
      setContent('');
      setSpoilers(false);
      setScore('8');
      await loadReviews(session.user.id);
    } catch (reason) {
      setError(reason.message || 'Your review could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return <section className="ao-reviews"><h2>Reviews &amp; ratings</h2><p>Community reviews are not configured on this build.</p></section>;
  }

  return <section className="ao-reviews" aria-labelledby="ao-reviews-title">
    <div className="ao-reviews-heading">
      <div><span className="ao-reviews-kicker">COMMUNITY SCORES</span><h2 id="ao-reviews-title">Reviews &amp; ratings</h2></div>
      <div className="ao-reviews-summary"><strong>{summary === null ? '—' : summary.toFixed(1) + '/10'}</strong><span>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span></div>
    </div>
    {!session?.user
      ? <p className="ao-reviews-note">Sign in to read and write community reviews.</p>
      : <form className="ao-review-form" onSubmit={submit}>
        <h3>{reviews.some(review => review.user_id === session.user.id) ? 'Update your review' : 'Write a review'}</h3>
        <div className="ao-review-form-row">
          <label>Your score<select value={score} onChange={event => setScore(event.target.value)}>{Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option value={value} key={value}>{value}/10</option>)}</select></label>
          <label>Review title <span>(optional)</span><input value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} maxLength={100} placeholder="What stood out to you?" /></label>
        </div>
        <label>Your review<textarea value={content} onChange={event => setContent(event.target.value)} maxLength={3000} rows={4} placeholder="Share your thoughts about this anime…" required /></label>
        <label className="ao-review-spoiler"><input type="checkbox" checked={spoilers} onChange={event => setSpoilers(event.target.checked)} /> Contains spoilers</label>
        <div className="ao-review-form-foot"><small>{content.length}/3000</small><button type="submit" disabled={busy || !content.trim()}>{busy ? 'Saving…' : 'Save review'}</button></div>
      </form>}
    {error && <p className="ao-reviews-error" role="alert">{error}</p>}
    {message && <p className="ao-reviews-message" role="status">{message}</p>}
    {loading ? <p className="ao-reviews-note">Loading reviews…</p> : reviews.length ? <div className="ao-review-list">
      {reviews.map(review => <article className="ao-review-card" key={review.id}>
        <div className="ao-review-card-head"><div><b>{displayName(review)}</b><time>{new Date(review.created_at).toLocaleDateString()}</time></div><strong>{review.score}/10</strong></div>
        {review.title && <h3>{review.title}</h3>}
        {review.contains_spoilers && !revealed[review.id]
          ? <button type="button" className="ao-review-reveal" onClick={() => setRevealed(previous => ({ ...previous, [review.id]: true }))}>Spoiler review · reveal</button>
          : <p>{review.content}</p>}
        {review.user_id === session?.user?.id && <button type="button" className="ao-review-delete" disabled={busy} onClick={() => remove(review)}>Delete your review</button>}
      </article>)}
    </div> : <p className="ao-reviews-note">No reviews yet. Be the first to share your thoughts.</p>}
  </section>;
}
