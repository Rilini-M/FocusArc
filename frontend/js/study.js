/*
  Study focus page (study.html?quest=<id>[&start=1]). Opened in a new tab by a quest's Start
  Study button on the Quest Board, which stays open in the original tab.
  - ?start=1 starts a study session for the quest (the existing /study-sessions API), then the
    parameter is dropped from the address so a refresh never starts a second session.
  - Without it, the page shows the quest's running session, or lets the user start one.
  Starting or stopping here updates the Quest Board (and the other way round) via
  announceStudyChange() / onStudyChange() in questShared.js.
*/

const questId = Number(new URLSearchParams(window.location.search).get('quest'));
const baseTitle = 'Study — FocusArc';

let quest = null;
let session = null; // { id, quest_id, started_at } while this quest is being studied
let tickTimer = null;
let busy = false;

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
  startTick();
}

function renderIdle(message) {
  stopTick();
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
    renderIdle(`Session saved: ${formatMinutes(stopped.duration_minutes)} of study. Nice work!`);
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

    const params = new URLSearchParams(window.location.search);
    if (params.get('start') === '1') {
      // Drop ?start=1 first, so refreshing this tab never starts a second session.
      params.delete('start');
      history.replaceState(null, '', `${window.location.pathname}?${params}`);
      const active = await api.get('/study-sessions/active');
      if (active) await showCurrentState();
      else await startSession();
    } else {
      await showCurrentState();
    }
  } catch (err) {
    renderMessage('Something went wrong', escapeHtml(err.message));
    return;
  }

  // A session stopped on the Quest Board (or started elsewhere) updates this page.
  onStudyChange(async () => {
    if (busy) return;
    try {
      const wasRunning = Boolean(session);
      const active = await api.get('/study-sessions/active');
      if (wasRunning && !(active && active.quest_id === questId)) {
        await showCurrentState('This session was stopped from another tab.');
      } else if (!wasRunning && active && active.quest_id === questId) {
        await showCurrentState();
      }
    } catch (err) {
      // Keep the current view.
    }
  });
});

window.addEventListener('beforeunload', stopTick);
