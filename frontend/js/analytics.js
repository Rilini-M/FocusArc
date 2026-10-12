/*
  Analytics, built on the same quests the Quest Board shows (GET /api/quests) and the user's
  study sessions (GET /api/analytics/sessions):
  - Quest state is the Quest Board's: Completed (studied time reached the estimate), Missing
    (unfinished and its deadline has passed, isQuestMissing() in questShared.js) or Active.
  - Study time per quest is set against that quest's estimated completion time.
  - Daily activity and the streak are grouped into the user's own local days (sessions arrive
    as exact instants).
  A running session counts up to now. The page re-renders every minute (deadlines pass, the
  running session grows) and reloads when a session starts or stops in another tab.
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;
const STATE_ORDER = ['completed', 'active', 'missing'];
const STATE_INFO = {
  completed: { label: 'Completed', icon: 'circle-check-big' },
  active: { label: 'Active', icon: 'swords' },
  missing: { label: 'Missing', icon: 'alarm-clock-off' },
};

let data = null; // { quests, sessions, characters, companion }

// ---------------------------------------------------------------- helpers

function emptyState(title, text) {
  return `<div class="empty an-empty"><h3>${title}</h3><p>${text}</p></div>`;
}

function questState(quest) {
  if (quest.status === 'COMPLETED') return 'completed';
  return isQuestMissing(quest) ? 'missing' : 'active';
}

function sessionEndMs(session) {
  return session.end_ms === null ? Date.now() : session.end_ms;
}

function runningSession() {
  return data.sessions.find((s) => s.end_ms === null) || null;
}

// Everything studied on the quest: saved sessions (from the server) plus the running one.
function questStudiedSeconds(quest) {
  const running = runningSession();
  const live = running && running.quest_id === quest.id ? Math.max(0, (Date.now() - running.start_ms) / 1000) : 0;
  return (quest.studied_seconds || 0) + live;
}

function questSessions(quest) {
  return data.sessions.filter((s) => s.quest_id === quest.id);
}

function questCharacter(quest) {
  return data.characters.find((c) => c.id === quest.character_id) || data.companion;
}

// Local calendar day key, e.g. "2026-10-11".
function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfLocalDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Seconds studied per local day: each session is split at local midnights.
function secondsByDay() {
  const byDay = new Map();
  data.sessions.forEach((s) => {
    let from = s.start_ms;
    const to = sessionEndMs(s);
    while (from < to) {
      const dayStart = startOfLocalDay(from);
      const next = new Date(dayStart);
      next.setDate(next.getDate() + 1); // DST-safe
      const until = Math.min(to, next.getTime());
      const key = dayKey(new Date(dayStart));
      byDay.set(key, (byDay.get(key) || 0) + (until - from) / 1000);
      from = until;
    }
  });
  return byDay;
}

// Consecutive local days with study, counting back from today (or from yesterday when today
// has none yet, so the streak isn't lost before today's session).
function studyStreak(byDay) {
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!(byDay.get(dayKey(cursor)) > 0)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (byDay.get(dayKey(cursor)) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Whole percentages that add up to exactly 100 (largest remainder).
function wholePercents(counts) {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map(Math.floor);
  let remaining = 100 - result.reduce((sum, p) => sum + p, 0);
  exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ i }) => {
      if (remaining > 0) {
        result[i] += 1;
        remaining -= 1;
      }
    });
  return result;
}

// "in 2 days", "3 hours ago", "tomorrow" (the browser's language).
function relativeTime(ms) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / 60000), 'minute');
  if (abs < DAY_MS) return rtf.format(Math.round(diff / 3600000), 'hour');
  if (abs < 30 * DAY_MS) return rtf.format(Math.round(diff / DAY_MS), 'day');
  return rtf.format(Math.round(diff / (30 * DAY_MS)), 'month');
}

function stateBadgeHTML(state) {
  const info = STATE_INFO[state];
  return `<span class="an-badge ${state}">${icon(info.icon, 13)}<span>${info.label}</span></span>`;
}

function avatarHTML(character, size = 'sm') {
  if (!character) return `<span class="an-avatar ${size} none" aria-hidden="true">${icon('user-round', 14)}</span>`;
  return `<img class="an-avatar ${size}" src="${escapeHtml(character.image_path)}" alt="" title="${escapeHtml(character.name)}" onerror="this.classList.add('none'); this.removeAttribute('src')" />`;
}

// ---------------------------------------------------------------- Active's color per theme

// Any CSS color (including color-mix / oklch) as [r, g, b], via a 1px canvas.
function cssColorRgb(value) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

function oklab([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// Active is drawn in the theme's own accent, but some themes' accent sits close to Completed's
// green or Missing's red. Pick whichever of the theme's two accents is furthest from both, and
// fall back to a neutral ink when neither is clearly apart. Labels and icons always back it up.
function chooseActiveColor() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  const fixed = [read('--an-done'), read('--an-missing')].map((c) => oklab(cssColorRgb(c)));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const candidates = ['--accent', '--accent-secondary'].map((name) => {
    const lab = oklab(cssColorRgb(read(name)));
    return { name, gap: Math.min(...fixed.map((f) => distance(lab, f))) };
  });
  const best = candidates.sort((a, b) => b.gap - a.gap)[0];
  const value = best.gap >= 0.12 ? `var(${best.name})` : 'var(--text-secondary)';
  document.querySelector('.main').style.setProperty('--an-active', value);
}

// ---------------------------------------------------------------- hero + headline numbers

function renderHero(states, totalSeconds) {
  const { companion } = data;
  const img = document.getElementById('an-companion');
  if (companion) {
    img.src = companion.image_path;
    img.alt = companion.name;
    img.hidden = false;
  }

  const total = data.quests.length;
  let text;
  if (total === 0) {
    text = 'Create your first quest on the Quest Board to start tracking.';
  } else {
    const missing = states.missing.length;
    const studied = totalSeconds >= 60 ? `${formatMinutes(totalSeconds / 60)} studied` : 'No study time yet';
    const tail =
      missing > 0
        ? `<span class="warn">${missing} ${missing === 1 ? 'quest needs' : 'quests need'} a new deadline.</span>`
        : states.active.length
          ? '<span>Every active quest is on track.</span>'
          : '<span>All quests completed.</span>';
    text = `${studied} across ${total} ${total === 1 ? 'quest' : 'quests'}. ${tail}`;
  }
  document.getElementById('an-headline').innerHTML = text;
}

function renderStats(states, totalSeconds, byDay) {
  const total = data.quests.length;
  const sessionCount = data.sessions.length;

  document.getElementById('stat-time').textContent = totalSeconds >= 60 ? formatMinutes(totalSeconds / 60) : '0 min';
  document.getElementById('stat-time-sub').textContent = sessionCount
    ? `${sessionCount} study ${sessionCount === 1 ? 'session' : 'sessions'}`
    : 'No sessions yet';

  const done = states.completed.length;
  document.getElementById('stat-completed').textContent = done;
  document.getElementById('stat-completed-sub').textContent = total
    ? `of ${total} ${total === 1 ? 'quest' : 'quests'} · ${Math.round((done / total) * 100)}%`
    : 'No quests yet';

  const missing = states.missing.length;
  document.getElementById('stat-missing').textContent = missing;
  document.getElementById('stat-missing-sub').textContent = missing ? 'Extend on the Quest Board' : 'No missed deadlines';
  document.getElementById('stat-missing-card').classList.toggle('alert', missing > 0);

  const streak = studyStreak(byDay);
  const today = byDay.get(dayKey(new Date())) > 0;
  document.getElementById('stat-streak').textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  document.getElementById('stat-streak-sub').textContent = today
    ? 'Studied today'
    : streak
      ? 'Study today to keep it going'
      : 'Start a session to begin one';
}

// ---------------------------------------------------------------- quest status (part-to-whole)

function renderStatus(states) {
  const container = document.getElementById('status-container');
  const total = data.quests.length;
  document.getElementById('status-total').textContent = total ? `${total} of 10 quests` : '';
  if (!total) {
    container.innerHTML = emptyState('No quests yet.', 'Your quests will show up here once you create them.');
    return;
  }

  const counts = STATE_ORDER.map((s) => states[s].length);
  const percents = wholePercents(counts);
  const titlesTip = (state) =>
    states[state].map((q) => `<li>${escapeHtml(q.title)}</li>`).join('') || '<li class="muted">No quests</li>';

  const segments = STATE_ORDER.map((state, i) =>
    counts[i]
      ? `<span class="st-seg ${state}" style="flex-grow:${counts[i]}" tabindex="0"
           aria-label="${STATE_INFO[state].label}: ${counts[i]} (${percents[i]}%)"
           data-tip="${escapeHtml(`<strong>${STATE_INFO[state].label} · ${counts[i]}</strong><ul>${titlesTip(state)}</ul>`)}"></span>`
      : ''
  ).join('');

  container.innerHTML = `
    <div class="st-bar" role="img" aria-label="${STATE_ORDER.map((s, i) => `${STATE_INFO[s].label} ${counts[i]}`).join(', ')}">${segments}</div>
    <div class="st-legend">
      ${STATE_ORDER.map(
        (state, i) => `
        <div class="st-item ${state}">
          <span class="st-swatch ${state}" aria-hidden="true"></span>
          ${icon(STATE_INFO[state].icon, 15)}
          <span class="st-label">${STATE_INFO[state].label}</span>
          <strong class="st-count">${counts[i]}</strong>
          <span class="st-pct">${percents[i]}%</span>
        </div>`
      ).join('')}
    </div>`;
}

// ---------------------------------------------------------------- study time vs estimate

// Missing first (they need attention), then Active by nearest deadline (none last), then
// Completed.
function sortedQuests() {
  const rank = { missing: 0, active: 1, completed: 2 };
  const due = (q) => (q.deadline ? deadlineDate(q.deadline).getTime() : Infinity);
  return [...data.quests].sort((a, b) => rank[questState(a)] - rank[questState(b)] || due(a) - due(b) || b.id - a.id);
}

function questRowHTML(quest) {
  const state = questState(quest);
  const studiedMin = Math.floor(questStudiedSeconds(quest) / 60);
  const estimate = quest.time_required;
  const ratio = estimate ? studiedMin / estimate : 0;
  const percent = Math.round(ratio * 100);
  const over = studiedMin - estimate;
  const sessions = questSessions(quest);
  const last = sessions.length ? Math.max(...sessions.map(sessionEndMs)) : null;
  const character = questCharacter(quest);
  const running = runningSession();
  const studying = running && running.quest_id === quest.id;

  let dueText = '';
  if (quest.deadline && state !== 'completed') {
    dueText = state === 'missing'
      ? `Missed ${relativeTime(deadlineDate(quest.deadline).getTime())}`
      : `Due ${relativeTime(deadlineDate(quest.deadline).getTime())}`;
  }

  const meta = [
    `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`,
    studying ? 'Studying now' : last ? `Last studied ${relativeTime(last)}` : 'Not studied yet',
    dueText,
  ].filter(Boolean);

  const tip = `
    <strong>${escapeHtml(quest.title)}</strong>
    <dl>
      <dt>Studied</dt><dd>${formatMinutes(studiedMin)}</dd>
      <dt>Estimate</dt><dd>${formatMinutes(estimate)}</dd>
      <dt>Progress</dt><dd>${percent}%</dd>
      ${quest.deadline ? `<dt>Deadline</dt><dd>${escapeHtml(formatDeadline(quest.deadline))}</dd>` : ''}
      ${character ? `<dt>Companion</dt><dd>${escapeHtml(character.name)}</dd>` : ''}
    </dl>`;

  return `
    <li class="qr ${state}" tabindex="0" data-tip="${escapeHtml(tip)}"
        aria-label="${escapeHtml(`${quest.title}: ${STATE_INFO[state].label}, ${formatMinutes(studiedMin)} of ${formatMinutes(estimate)} studied, ${percent}%`)}">
      ${avatarHTML(character)}
      <div class="qr-main">
        <div class="qr-top">
          <span class="qr-title">${escapeHtml(quest.title)}</span>
          ${stateBadgeHTML(state)}
          ${studying ? `<span class="an-badge live">${icon('timer', 13)}<span>Live</span></span>` : ''}
        </div>
        <div class="qr-track" aria-hidden="true">
          <span class="qr-fill ${state}" style="width:${Math.min(100, ratio * 100)}%"></span>
        </div>
        <div class="qr-meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>
      </div>
      <div class="qr-nums">
        <span class="qr-studied"><strong>${formatMinutes(studiedMin)}</strong> / ${formatMinutes(estimate)}</span>
        <span class="qr-pct">${over > 0 ? `+${formatMinutes(over)} over` : `${percent}%`}</span>
      </div>
    </li>`;
}

function renderQuests() {
  const container = document.getElementById('quests-container');
  if (!data.quests.length) {
    container.innerHTML = emptyState('Nothing to compare yet.', 'Each quest you create shows its study time against its estimate here.');
    return;
  }
  container.innerHTML = `<ul class="qr-list">${sortedQuests().map(questRowHTML).join('')}</ul>`;
}

// ---------------------------------------------------------------- last 14 days

// A round axis maximum (in minutes) at or above `minutes`.
function niceMaxMinutes(minutes) {
  const steps = [30, 60, 90, 120, 180, 240, 360, 480, 600, 720, 960, 1200, 1440];
  return steps.find((s) => s >= minutes) || Math.ceil(minutes / 60) * 60;
}

function renderActivity(byDay) {
  const container = document.getElementById('activity-container');
  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (ACTIVITY_DAYS - 1));
  for (let i = 0; i < ACTIVITY_DAYS; i += 1) {
    const sessionsThatDay = data.sessions.filter((s) => dayKey(new Date(s.start_ms)) === dayKey(cursor)).length;
    days.push({ date: new Date(cursor), minutes: (byDay.get(dayKey(cursor)) || 0) / 60, sessions: sessionsThatDay });
    cursor.setDate(cursor.getDate() + 1);
  }

  const totalMin = days.reduce((sum, d) => sum + d.minutes, 0);
  document.getElementById('activity-total').textContent = totalMin >= 1 ? `${formatMinutes(totalMin)} total` : '';
  if (totalMin < 1) {
    container.innerHTML = emptyState('No study sessions in the last 14 days.', 'Start Study on a quest and your daily study time appears here.');
    return;
  }

  const max = niceMaxMinutes(Math.max(...days.map((d) => d.minutes)));
  const todayKey = dayKey(new Date());
  const longDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const columns = days
    .map((d) => {
      const isToday = dayKey(d.date) === todayKey;
      const letter = d.date.toLocaleDateString(undefined, { weekday: 'narrow' });
      const label = isToday ? `<span class="wide">Today</span><span class="narrow">${letter}</span>` : letter;
      const tip = `<strong>${longDate(d.date)}</strong><span>${formatMinutes(d.minutes)} · ${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}</span>`;
      return `
        <div class="ac-col${isToday ? ' today' : ''}" tabindex="0" data-tip="${escapeHtml(tip)}"
             aria-label="${escapeHtml(`${longDate(d.date)}: ${formatMinutes(d.minutes)}`)}">
          <div class="ac-bar-wrap"><span class="ac-bar" style="height:${(d.minutes / max) * 100}%"></span></div>
          <span class="ac-day">${label}</span>
        </div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="ac-chart">
      <div class="ac-axis" aria-hidden="true">
        <span style="bottom:100%">${formatMinutes(max)}</span>
        <span style="bottom:50%">${formatMinutes(max / 2)}</span>
        <span style="bottom:0">0</span>
      </div>
      <div class="ac-plot">
        <div class="ac-lines" aria-hidden="true">
          <span style="bottom:100%"></span>
          <span style="bottom:50%"></span>
        </div>
        <div class="ac-cols">${columns}</div>
      </div>
    </div>
    <table class="sr-only">
      <caption>Study time per day, last 14 days</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Study time</th><th scope="col">Sessions</th></tr></thead>
      <tbody>${days.map((d) => `<tr><td>${longDate(d.date)}</td><td>${formatMinutes(d.minutes)}</td><td>${d.sessions}</td></tr>`).join('')}</tbody>
    </table>`;
}

// ---------------------------------------------------------------- deadlines

function renderDeadlines() {
  const container = document.getElementById('deadlines-container');
  const withDeadline = data.quests
    .filter((q) => q.deadline && q.status !== 'COMPLETED')
    .sort((a, b) => deadlineDate(a.deadline) - deadlineDate(b.deadline));

  if (!withDeadline.length) {
    container.innerHTML = emptyState('No deadlines to watch.', 'Unfinished quests with a deadline are listed here, soonest first.');
    return;
  }

  container.innerHTML = `
    <ul class="dl-list">
      ${withDeadline
        .map((q) => {
          const missing = isQuestMissing(q);
          const studiedMin = Math.floor(questStudiedSeconds(q) / 60);
          const when = relativeTime(deadlineDate(q.deadline).getTime());
          return `
          <li class="dl-item${missing ? ' missing' : ''}">
            <span class="dl-icon" aria-hidden="true">${icon(missing ? 'alarm-clock-off' : 'calendar-clock', 16)}</span>
            <div class="dl-main">
              <span class="dl-title">${escapeHtml(q.title)}</span>
              <span class="dl-date">${escapeHtml(formatDeadline(q.deadline))}</span>
            </div>
            <div class="dl-side">
              <span class="dl-when">${missing ? `Missed ${when}` : `Due ${when}`}</span>
              <span class="dl-progress">${formatMinutes(studiedMin)} of ${formatMinutes(q.time_required)}</span>
            </div>
          </li>`;
        })
        .join('')}
    </ul>
    ${withDeadline.some(isQuestMissing) ? `<a class="dl-link" href="questboard.html">${icon('calendar-plus', 15)} Extend missed deadlines on the Quest Board</a>` : ''}`;
}

// ---------------------------------------------------------------- tooltip (hover and keyboard focus)

function initTooltip() {
  const tip = document.getElementById('an-tip');
  let target = null;

  const place = (x, y) => {
    const pad = 12;
    const { width, height } = tip.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + width > window.innerWidth - 8) left = x - width - pad;
    if (top + height > window.innerHeight - 8) top = y - height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };
  const show = (el, x, y) => {
    target = el;
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    place(x, y);
  };
  const hide = () => {
    target = null;
    tip.hidden = true;
  };

  document.addEventListener('pointermove', (event) => {
    const el = event.target.closest('[data-tip]');
    if (!el) {
      if (target) hide();
      return;
    }
    if (el !== target) show(el, event.clientX, event.clientY);
    else place(event.clientX, event.clientY);
  });
  document.addEventListener('focusin', (event) => {
    const el = event.target.closest('[data-tip]');
    if (!el) return hide();
    const rect = el.getBoundingClientRect();
    show(el, rect.left + rect.width / 2, rect.bottom);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, { passive: true });
}

// ---------------------------------------------------------------- load + render

function render() {
  if (!data) return;
  const states = { completed: [], active: [], missing: [] };
  data.quests.forEach((q) => states[questState(q)].push(q));
  const totalSeconds = data.sessions.reduce((sum, s) => sum + Math.max(0, (sessionEndMs(s) - s.start_ms) / 1000), 0);
  const byDay = secondsByDay();

  chooseActiveColor();
  renderHero(states, totalSeconds);
  renderStats(states, totalSeconds, byDay);
  renderStatus(states);
  renderQuests();
  renderActivity(byDay);
  renderDeadlines();
  refreshIcons();
}

async function loadData(settings) {
  const [quests, sessions, characters] = await Promise.all([
    api.get('/quests'),
    api.get('/analytics/sessions'),
    api.get('/characters').catch(() => []),
  ]);
  const companion = settings ? characters.find((c) => c.id === settings.character_id) || null : null;
  data = { quests, sessions, characters, companion };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Rendered first and synchronously — see questboard.js for why this can't wait behind
  // the auth/settings network calls without causing a visible theme/chrome flash.
  renderSidebar('analytics');

  const user = await requireAuth();
  if (!user) return;

  const settings = await loadAndApplyTheme();
  initTooltip();

  try {
    await loadData(settings);
    render();
  } catch (err) {
    document.getElementById('an-headline').textContent = 'Analytics could not be loaded.';
    showToast(err.message, { isError: true });
    return;
  }

  // Deadlines pass and a running session grows: keep the numbers current.
  setInterval(render, 60 * 1000);
  // A session started or stopped in another tab (or this tab shown again): reload.
  onStudyChange(async () => {
    try {
      await loadData(settings);
      render();
    } catch (err) {
      // Keep the current view.
    }
  });
});
