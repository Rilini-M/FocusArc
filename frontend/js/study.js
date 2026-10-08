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
  - While a session runs, a heartbeat tells the server the page is still open, so a session
    whose page died without a stop request (browser crash) is closed by the server.
  The study time itself is always worked out by the server from started_at and the stop time;
  the timer on screen is only a display of that.
*/

const questId = Number(new URLSearchParams(window.location.search).get('quest'));
const baseTitle = 'Study — FocusArc';

let quest = null;
let session = null; // { id, quest_id, started_at } while this quest is being studied
let tickTimer = null;
let heartbeatTimer = null;
let busy = false;
let leaveStopSent = false; // the page-closing stop request was already sent for this session

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

// Big timer with progress towards the quest's Time Required.
function renderRunning() {
  root().innerHTML = `
    ${questHeaderHTML('Studying now')}
    <div class="fx-timer" id="fx-timer" role="timer" aria-label="Study time">00:00:00</div>
    <div class="fx-progress">
      <div class="fx-bar"><span id="fx-bar-fill"></span></div>
      <p class="fx-goal" id="fx-goal"></p>
    </div>
    <div class="fx-actions">
      <button type="button" class="btn btn-d fx-stop" id="fx-stop">${icon('circle-stop', 18)} Stop Study</button>
    </div>
    ${attachmentListHTML(quest.attachments, 'Study material')}`;
  refreshIcons();
  document.getElementById('fx-stop').addEventListener('click', stopSession);
  leaveStopSent = false;
  startTick();
  startHeartbeat();
}

function renderIdle(message) {
  stopTick();
  stopHeartbeat();
  root().innerHTML = `
    ${questHeaderHTML('Study quest')}
    ${message ? `<p class="fx-note">${message}</p>` : ''}
    <p class="fx-plan">${icon('hourglass', 16)} Time required: <strong>${formatMinutes(quest.time_required)}</strong></p>
    <div class="fx-actions">
      <button type="button" class="btn btn-p fx-start" id="fx-start">${icon('play', 18)} ${message ? 'Study Again' : 'Start Study'}</button>
    </div>
    ${attachmentListHTML(quest.attachments, 'Study material')}`;
  refreshIcons();
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
  const minutes = Math.floor(seconds / 60);
  const goal = quest.time_required;
  document.getElementById('fx-timer').textContent = formatDuration(seconds);
  document.getElementById('fx-bar-fill').style.width = `${Math.min(100, (seconds / (goal * 60)) * 100)}%`;
  document.getElementById('fx-goal').innerHTML =
    minutes >= goal
      ? `${icon('check', 15)} Time goal of ${formatMinutes(goal)} reached. Keep going or stop when you're done.`
      : `${formatMinutes(minutes)} of ${formatMinutes(goal)} planned`;
  if (minutes >= goal) refreshIcons();
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
  if (!session || leaveStopSent) return;
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

// Shows whatever is true on the server: this quest running, another quest running, or idle.
async function showCurrentState(idleMessage) {
  const active = await api.get('/study-sessions/active');
  if (active && active.quest_id === questId) {
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
    announceStudyChange();
    renderIdle(savedMessage(stopped));
  } catch (err) {
    showToast(err.message, { isError: true });
    if (button) button.disabled = false;
  } finally {
    busy = false;
  }
}

// The study companion's portrait and a rotating quote, like on the Quest Board.
async function initCompanion() {
  try {
    const settings = await api.get('/settings');
    const [character, quotes] = await Promise.all([
      api.get(`/characters/${settings.character_id}`),
      api.get(`/characters/${settings.character_id}/quotes`),
    ]);
    const img = document.getElementById('focus-companion-img');
    const quoteEl = document.getElementById('focus-companion-quote');
    img.src = character.image_path;
    img.alt = character.name;
    const show = (text) => {
      quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(text)}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
    };
    const texts = quotes.length ? quotes.map((q) => q.quote_text) : [character.description || 'Stay focused. One quest at a time.'];
    let index = Math.floor(Math.random() * texts.length);
    show(texts[index]);
    if (texts.length > 1) {
      setInterval(() => {
        index = (index + 1) % texts.length;
        show(texts[index]);
      }, 12000);
    }
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
    const quests = await api.get('/quests');
    quest = quests.find((q) => q.id === questId) || null;
    if (!quest) {
      renderMessage('Quest not found', 'This quest no longer exists. It may have been deleted.');
      return;
    }

    initCompanion();

    const left = await finishLeftSession();
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

  // Hidden (another tab, minimized, phone locked): the session keeps running, since studying
  // often means reading the quest's files in another tab, but tell the server the page was
  // alive just now, in case it is then killed without a chance to send its stop request.
  document.addEventListener('visibilitychange', () => {
    // (Becoming visible again is handled by onStudyChange above.)
    if (document.visibilityState === 'hidden' && session && !leaveStopSent && navigator.sendBeacon) {
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
