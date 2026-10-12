/*
  Study focus page (study.html?quest=<id>[&start=1]). Opened in a new tab by a quest's Start
  Study button on the Quest Board, which stays open in the original tab.
  - ?start=1 starts a study session for the quest (the existing /study-sessions API), then the
    parameter is dropped from the address so a refresh never starts a second session.
  - Without it, the page shows the quest's running session, or lets the user start one.
  Starting or stopping here updates the Quest Board (and the other way round) via
  announceStudyChange() / onStudyChange() in questShared.js.
  - Leaving the page in any way (closing the tab or window, refreshing, navigating away) stops
    the session: see endSessionOnLeave(). A refreshed or reopened page never resumes it.
    "Back to Quest Board" stops it first and then navigates (leaveToQuestBoard), so the board
    never shows it still running.
  - Only the tab that started the session owns it (ownsSession). Another tab showing the same
    session (the Quest Board's Focus Page link, a duplicated tab) only displays it: closing that
    tab doesn't stop the session, and it sends no heartbeats. Its Stop button still works.
  - While a session runs, a heartbeat tells the server the page is still open, so a session
    whose page died without a stop request (browser crash) is closed by the server.
  The study time itself is always worked out by the server from started_at and the stop time;
  the timer on screen is only a display of that.
*/

const questId = Number(new URLSearchParams(window.location.search).get('quest'));
const baseTitle = 'Study — FocusArc';

let quest = null; // from GET /quests: title, time_required (estimate), deadline, attachments, studied_seconds
let session = null; // { id, quest_id, started_at } while this quest is being studied
let tickTimer = null;
let heartbeatTimer = null;
let busy = false;
let leaveStopSent = false; // the page-closing stop request was already sent for this session
// This page instance started the running session. Kept in memory only, so a duplicated or
// newly opened tab never thinks it owns it.
let ownsSession = false;

const HEARTBEAT_MS = 60 * 1000;
// Remembers, across a refresh of this tab, the session the page stopped as it unloaded.
const LEFT_SESSION_KEY = 'focusarc-study-left-session';

function sessionUrl(id, action) {
  return `${API_BASE}/study-sessions/${id}/${action}`;
}

function root() {
  return document.getElementById('focus-root');
}

function questHeaderHTML(kicker) {
  return `
    <p class="fx-kicker">${icon('swords', 14)} ${kicker}</p>
    <h1 class="fx-title">${escapeHtml(quest.title)}</h1>
    <p class="fx-desc">${escapeHtml(quest.description)}</p>`;
}

// Progress towards the quest's estimated completion time: everything studied on the quest so
// far (all saved sessions, plus the running one), not just this session. Filled in by
// updateProgress().
function progressHTML() {
  return `
    <section class="fx-progress" aria-label="Study progress">
      <div class="fx-progress-head">
        <span class="fx-progress-label">${icon('hourglass', 15)} Estimated Study Time</span>
        <strong class="fx-progress-target">${formatMinutes(quest.time_required)}</strong>
      </div>
      <div class="fx-bar" id="fx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Study time towards the estimate">
        <span id="fx-bar-fill"></span>
      </div>
      <div class="fx-progress-foot">
        <span><strong id="fx-studied">0 min</strong> studied</span>
        <span><strong id="fx-left">${formatMinutes(quest.time_required)}</strong> left</span>
      </div>
      <p class="fx-goal" id="fx-goal" hidden>${icon('check', 15)} Study target reached. Keep going or stop when you're done.</p>
    </section>`;
}

// The quest's deadline, if it has one (separate from the estimate; it plays no part in progress).
function deadlineHTML() {
  if (!quest.deadline) return '';
  const overdue = isQuestMissing(quest); // never for a completed quest
  return `
    <p class="fx-deadline${overdue ? ' overdue' : ''}">
      ${icon('calendar-clock', 16)} ${overdue ? 'Deadline missed' : 'Deadline'}: <strong>${formatDeadline(quest.deadline)}</strong>
    </p>`;
}

// Actual study time on the quest right now, in seconds: saved sessions from the server plus
// the running session's time since its started_at (timestamps, not counted ticks).
function studiedSeconds() {
  return (quest.studied_seconds || 0) + (session ? sessionElapsedSeconds(session) : 0);
}

// progress = studied / estimated. Studying past the estimate is fine: the bar stays full and
// "left" stays at 0 min while "studied" keeps growing.
function updateProgress() {
  const fill = document.getElementById('fx-bar-fill');
  if (!fill) return;
  const seconds = studiedSeconds();
  const studiedMinutes = Math.floor(seconds / 60);
  const estimate = quest.time_required;
  const percent = Math.min(100, (seconds / (estimate * 60)) * 100);
  const reached = studiedMinutes >= estimate;

  fill.style.width = `${percent}%`;
  const bar = document.getElementById('fx-bar');
  bar.setAttribute('aria-valuenow', String(Math.floor(percent)));
  bar.classList.toggle('reached', reached);
  document.getElementById('fx-studied').textContent = formatMinutes(studiedMinutes);
  document.getElementById('fx-left').textContent = formatMinutes(Math.max(estimate - studiedMinutes, 0));
  document.getElementById('fx-goal').hidden = !reached;
}

// Big timer (this session) above the quest's overall progress.
function renderRunning() {
  root().innerHTML = `
    ${questHeaderHTML('Studying now')}
    <div class="fx-timer" id="fx-timer" role="timer" aria-label="Study time">00:00:00</div>
    <div class="fx-actions">
      <button type="button" class="btn btn-d fx-stop" id="fx-stop">${icon('circle-stop', 18)} Stop Study</button>
    </div>
    ${ownsSession ? '' : `<p class="fx-note fx-note-shared">${icon('info', 15)} This session is running in another tab. Closing this tab won't stop it.</p>`}
    ${progressHTML()}
    ${attachmentListHTML(quest.attachments, 'Study material', quest.id)}
    ${deadlineHTML()}`;
  refreshIcons();
  document.getElementById('fx-stop').addEventListener('click', stopSession);
  leaveStopSent = false;
  startTick();
  // The owning tab keeps the session alive; a tab that only displays it doesn't.
  if (ownsSession) startHeartbeat();
  else stopHeartbeat();
}

function renderIdle(message) {
  stopTick();
  stopHeartbeat();
  root().innerHTML = `
    ${questHeaderHTML('Study quest')}
    ${message ? `<p class="fx-note">${message}</p>` : ''}
    <div class="fx-actions">
      <button type="button" class="btn btn-p fx-start" id="fx-start">${icon('play', 18)} ${message ? 'Study Again' : 'Start Study'}</button>
    </div>
    ${progressHTML()}
    ${attachmentListHTML(quest.attachments, 'Study material', quest.id)}
    ${deadlineHTML()}`;
  refreshIcons();
  updateProgress();
  document.getElementById('fx-start').addEventListener('click', startSession);
  document.title = `${quest.title} — FocusArc`;
}

function renderMessage(title, text, extraHTML = '') {
  stopTick();
  stopHeartbeat();
  root().innerHTML = `
    <h1 class="fx-title">${title}</h1>
    <p class="fx-desc">${text}</p>
    <div class="fx-actions">${extraHTML}<a class="btn btn-s" href="questboard.html">Back to Quest Board</a></div>`;
  refreshIcons();
  document.title = baseTitle;
}

function updateTick() {
  if (!session) return;
  const seconds = sessionElapsedSeconds(session);
  document.getElementById('fx-timer').textContent = formatDuration(seconds);
  updateProgress();
  document.title = `${formatDuration(seconds)} · ${quest.title} — FocusArc`;
}

function startTick() {
  stopTick();
  updateTick();
  tickTimer = setInterval(updateTick, 1000);
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

// The summary shown after a session ends.
function savedMessage(stopped) {
  return `Session saved. Study time: <strong>${formatMinutes(stopped.duration_minutes)}</strong>. Nice work!`;
}

// Ended somewhere else: stopped on the Quest Board, or closed by the server after the
// computer slept or the page went quiet for too long.
function endedElsewhereMessage(ended) {
  return `This session has ended. Study time: <strong>${formatMinutes(ended.duration_minutes)}</strong>.`;
}

// ---- Heartbeat: "this page is still open" (see closeStaleSessions on the server).

async function sendHeartbeat() {
  if (!session || busy) return;
  try {
    const current = await api.post(`/study-sessions/${session.id}/heartbeat`);
    if (current.ended_at && session && session.id === current.id) {
      session = null;
      announceStudyChange();
      await showCurrentState(endedElsewhereMessage(current));
    }
  } catch (err) {
    // A missed beat is harmless; the next one catches up.
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ---- Leaving the page stops the session.

// Called from several page-closing events (pagehide, beforeunload), which may all fire; the
// request is sent once. sendBeacon is made for this: the browser delivers it even as the page
// goes away, where a normal fetch() may be cancelled. The server ignores repeat stops anyway.
function endSessionOnLeave() {
  if (!session || !ownsSession || leaveStopSent) return;
  leaveStopSent = true;
  const url = sessionUrl(session.id, 'stop');
  const queued = navigator.sendBeacon && navigator.sendBeacon(url);
  if (!queued) fetch(url, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});
  try {
    sessionStorage.setItem(LEFT_SESSION_KEY, String(session.id));
  } catch (err) {
    // Storage unavailable: the server-side stop still happened.
  }
  stopHeartbeat();
  announceStudyChange({ stoppedSessionId: session.id });
}

// "Back to Quest Board" (header, brand or message links) while this tab's session runs: stop
// and save it first, then go, so the Quest Board loads with the session already ended. A
// modified click (new tab or window) leaves this page open, so it doesn't stop anything.
async function leaveToQuestBoard(event) {
  const link = event.target.closest('a[href="questboard.html"]');
  if (!link || !session || !ownsSession || busy) return;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  busy = true;
  const id = session.id;
  stopTick();
  stopHeartbeat();
  try {
    await api.post(`/study-sessions/${id}/stop`);
    leaveStopSent = true; // already saved: pagehide must not send it again
    session = null;
    ownsSession = false;
    announceStudyChange();
  } catch (err) {
    // Not saved yet: pagehide sends the stop as the page goes.
  }
  window.location.href = link.href;
}

// After a refresh: make sure the session this tab stopped while unloading really is stopped
// (the stop request and this page's first requests may reach the server in either order),
// and return it so the page can show what was saved. Null if nothing was left behind.
async function finishLeftSession() {
  let id = null;
  try {
    id = sessionStorage.getItem(LEFT_SESSION_KEY);
    sessionStorage.removeItem(LEFT_SESSION_KEY);
  } catch (err) {
    return null;
  }
  if (!id) return null;
  try {
    return await api.post(`/study-sessions/${id}/stop`);
  } catch (err) {
    return null;
  }
}

// The quest as the server has it now, including its saved study time. Null if it's gone.
async function loadQuest() {
  const quests = await api.get('/quests');
  quest = quests.find((q) => q.id === questId) || null;
  return quest;
}

// Shows whatever is true on the server: this quest running, another quest running, or idle.
// Reloads the quest first, so its saved study time includes any session that just ended.
async function showCurrentState(idleMessage) {
  const [, active] = await Promise.all([loadQuest(), api.get('/study-sessions/active')]);
  // Still the owner only if it is still the session this tab started.
  ownsSession = ownsSession && Boolean(session && active && active.id === session.id);
  if (!quest) {
    session = null;
    renderMessage('Quest not found', 'This quest no longer exists. It may have been deleted.');
  } else if (active && active.quest_id === questId) {
    session = active;
    renderRunning();
  } else if (active) {
    session = null;
    renderMessage(
      'Another quest is in progress',
      'You already have a study session running for another quest. Stop it before starting this one.',
      `<a class="btn btn-p" href="${focusPageUrl(active.quest_id)}">${icon('timer', 16)} Go to that session</a>`
    );
  } else {
    session = null;
    renderIdle(idleMessage);
  }
}

async function startSession() {
  if (busy) return;
  busy = true;
  try {
    session = await api.post('/study-sessions/start', { questId });
    ownsSession = true;
    renderRunning();
    announceStudyChange();
  } catch (err) {
    // E.g. a session was started meanwhile (double click, another tab): show what's running.
    if (err.status === 409) await showCurrentState();
    else showToast(err.message, { isError: true });
  } finally {
    busy = false;
  }
}

async function stopSession() {
  if (busy || !session) return;
  busy = true;
  const button = document.getElementById('fx-stop');
  if (button) button.disabled = true;
  try {
    const stopped = await api.post(`/study-sessions/${session.id}/stop`);
    session = null;
    ownsSession = false;
    announceStudyChange();
    await showCurrentState(savedMessage(stopped));
  } catch (err) {
    showToast(err.message, { isError: true });
    if (button) button.disabled = false;
  } finally {
    busy = false;
  }
}

// The quest's own companion (or the Settings character if the quest has none): portrait and
// a rotating quote.
async function initCompanion() {
  try {
    const companion = await loadQuestCompanion(quest);
    if (!companion) return;
    showCompanion(companion, document.getElementById('focus-companion-img'), document.getElementById('focus-companion-quote'));
    document.getElementById('focus-companion').hidden = false;
  } catch (err) {
    // The companion is decoration; the page works without it.
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  refreshIcons();
  const user = await requireAuth();
  if (!user) return;
  await loadAndApplyTheme();

  if (!Number.isInteger(questId) || questId < 1) {
    renderMessage('Quest not found', 'This study page needs a quest. Open it from the Quest Board.');
    return;
  }

  try {
    // Everything about the quest (estimate, deadline, files, study time so far) comes from the
    // server by its id; the address carries nothing else.
    const left = await finishLeftSession();
    if (!(await loadQuest())) {
      renderMessage('Quest not found', 'This quest no longer exists. It may have been deleted.');
      return;
    }

    initCompanion();

    const leftMessage = left && left.quest_id === questId ? savedMessage(left) : undefined;

    const params = new URLSearchParams(window.location.search);
    if (params.get('start') === '1') {
      // Drop ?start=1 first, so refreshing this tab never starts a second session.
      params.delete('start');
      history.replaceState(null, '', `${window.location.pathname}?${params}`);
      const active = await api.get('/study-sessions/active');
      if (active) await showCurrentState();
      else await startSession();
    } else {
      await showCurrentState(leftMessage);
    }
  } catch (err) {
    renderMessage('Something went wrong', escapeHtml(err.message));
    return;
  }

  // A session stopped on the Quest Board (or started elsewhere) updates this page.
  onStudyChange(async ({ stoppedSessionId }) => {
    if (busy) return;
    try {
      const running = session;
      if (running && running.id === stoppedSessionId) {
        // Another tab showing this session was closed, which stops it. Repeating the stop is
        // harmless and returns the saved study time even if that tab's request is still on its way.
        const ended = await api.post(`/study-sessions/${running.id}/stop`);
        session = null;
        await showCurrentState(endedElsewhereMessage(ended));
        return;
      }
      const active = await api.get('/study-sessions/active');
      if (running && !(active && active.id === running.id)) {
        // The heartbeat reply carries the ended session's saved study time.
        const ended = await api.post(`/study-sessions/${running.id}/heartbeat`);
        session = null;
        await showCurrentState(endedElsewhereMessage(ended));
      } else if (!running && active && active.quest_id === questId) {
        await showCurrentState();
      }
    } catch (err) {
      // Keep the current view.
    }
  });

  document.addEventListener('click', leaveToQuestBoard);

  // Hidden (another tab, minimized, phone locked): the session keeps running, since studying
  // often means reading the quest's files in another tab, but tell the server the page was
  // alive just now, in case it is then killed without a chance to send its stop request.
  document.addEventListener('visibilitychange', () => {
    // (Becoming visible again is handled by onStudyChange above.)
    if (document.visibilityState === 'hidden' && session && ownsSession && !leaveStopSent && navigator.sendBeacon) {
      navigator.sendBeacon(sessionUrl(session.id, 'heartbeat'));
    }
  });
});

window.addEventListener('pagehide', () => {
  endSessionOnLeave();
  stopTick();
});
// Fallback for browsers where pagehide isn't reliable. Never asks "Leave site?".
window.addEventListener('beforeunload', endSessionOnLeave);

// Restored from the back/forward cache: the session was stopped when the page was left, so
// show the current state instead of a frozen timer.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && quest) {
    leaveStopSent = false;
    finishLeftSession().then((left) => showCurrentState(left ? savedMessage(left) : undefined));
  }
});
