/*
  The one way FocusArc shows an amount of time in words: actual study time (Study page,
  Analytics) and a quest's Time Required alike. Zero parts are left out.
    0 -> "0 min", 45 -> "45 min", 60 -> "1 hr", 90 -> "1 hr 30 min",
    1440 -> "1 day", 1620 -> "1 day 3 hr", 2880 -> "2 days"
  (The running timer on the Study page / Quest Board uses formatDuration's 00:00:00 instead.)
*/
function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} hr`);
  if (mins || parts.length === 0) parts.push(`${mins} min`);
  return parts.join(' ');
}
