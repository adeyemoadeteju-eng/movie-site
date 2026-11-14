export function formatAiringTime(timestamp) {
  const value = Number(timestamp);
  if (!value) return 'Time not available';
  try { return new Date(value * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return 'Time not available'; }
}
