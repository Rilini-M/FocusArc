const MAX_QUESTS = 10;
// Kept identical to backend/middleware/validate.js and the maxlength values in questboard.html.
const QUEST_LIMITS = {
  title: { min: 2, max: 19, label: 'Title' },
  description: { min: 9, max: 60, label: 'Description' },
};
const STATUS_LABELS = { TODO: 'To Do', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' };

let quests = [];
let activeFilter = 'ALL';
let quoteRotationTimer = null;
let activeStudySession = null; // { id, quest_id, started_at } | null
let studyTickInterval = null;

function formatDuration(totalSeconds) {
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Re-renders only the ticking number, not the whole list — the elapsed time is always
// recomputed from the real started_at timestamp (not just incremented), so it stays
// correct across tab-throttling, navigation, and refresh instead of drifting.
function updateTimerDisplay() {
  if (!activeStudySession) return;
  const el = document.querySelector(`[data-quest-timer="${activeStudySession.quest_id}"]`);
  if (!el) return;
  const startedMs = new Date(activeStudySession.started_at.replace(' ', 'T')).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  el.textContent = formatDuration(elapsedSeconds);
}

function startTimerTick() {
  stopTimerTick();
  updateTimerDisplay();
  studyTickInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimerTick() {
  if (studyTickInterval) {
    clearInterval(studyTickInterval);
    studyTickInterval = null;
  }
}

function renderQuestCount() {
  document.getElementById('quest-count').textContent = quests.length;
  document.getElementById('add-quest-btn').disabled = quests.length >= MAX_QUESTS;
}

function renderQuestList() {
  const container = document.getElementById('quest-list');
  const visible =
    activeFilter === 'ALL' ? quests : quests.filter((q) => q.status === activeFilter);

  if (visible.length === 0) {
    container.innerHTML = `
      <div class="empty card">
        <h3>${quests.length === 0 ? 'No quests yet.' : 'Nothing here yet.'}</h3>
        <p>${quests.length === 0 ? 'Create your first study quest.' : 'Try a different filter.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = visible
    .map((quest) => {
      const isStudyingThis = activeStudySession && activeStudySession.quest_id === quest.id;
      const anotherActive = activeStudySession && !isStudyingThis;

      const studyControl = isStudyingThis
        ? `
          <div class="timer">${icon('timer', 15)}<span data-quest-timer="${quest.id}">00:00:00</span></div>
          <button type="button" class="btn btn-d s-btn" data-action="stop-study">${icon('circle-stop', 16)} Stop Study</button>`
        : `
          <button type="button" class="btn btn-p s-btn" data-action="start-study"${anotherActive ? ' disabled title="Finish your current study session first"' : ''}>${icon('play', 16)} Start Study</button>`;

      return `
      <div class="card quest-card fade" data-quest-id="${quest.id}" data-status="${quest.status}">
        <div class="q-top">
          <div class="q-body">
            <h3 class="q-title">${escapeHtml(quest.title)}</h3>
            <p class="q-desc">${escapeHtml(quest.description)}</p>
          </div>
          <div class="q-acts">
            <select class="q-select" data-action="status">
              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}"${quest.status === value ? ' selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
            <button class="i-btn" data-action="edit" aria-label="Edit quest">${icon('pencil', 16)}</button>
            <button class="i-btn danger" data-action="delete" aria-label="Delete quest">${icon('trash-2', 16)}</button>
          </div>
        </div>
        <div class="q-study">${studyControl}</div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.quest-card').forEach((card) => {
    const questId = Number(card.dataset.questId);

    card.querySelector('[data-action="status"]').addEventListener('change', (event) => {
      updateQuestStatus(questId, event.target.value);
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', () => {
      openQuestModal(quests.find((q) => q.id === questId));
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      deleteQuest(questId);
    });

    const startBtn = card.querySelector('[data-action="start-study"]');
    if (startBtn) startBtn.addEventListener('click', () => startStudy(questId));

    const stopBtn = card.querySelector('[data-action="stop-study"]');
    if (stopBtn) stopBtn.addEventListener('click', stopStudy);
  });

  refreshIcons();

  if (activeStudySession) startTimerTick();
}

async function loadQuests() {
  quests = await api.get('/quests');
}

async function loadActiveStudySession() {
  activeStudySession = await api.get('/study-sessions/active');
}

async function startStudy(questId) {
  if (activeStudySession) return;

  try {
    activeStudySession = await api.post('/study-sessions/start', { questId });
    renderQuestList();
  } catch (err) {
    showToast(err.message, { isError: true });
  }
}

async function stopStudy() {
  if (!activeStudySession) return;
  const sessionId = activeStudySession.id;

  try {
    await api.post(`/study-sessions/${sessionId}/stop`);
    stopTimerTick();
    activeStudySession = null;
    renderQuestList();
    showToast('Study session saved.');
  } catch (err) {
    showToast(err.message, { isError: true });
  }
}

async function updateQuestStatus(questId, status) {
  try {
    const updated = await api.patch(`/quests/${questId}/status`, { status });
    quests = quests.map((q) => (q.id === questId ? updated : q));
    renderQuestList();
  } catch (err) {
    showToast(err.message, { isError: true });
    renderQuestList();
  }
}

async function deleteQuest(questId) {
  if (activeStudySession && activeStudySession.quest_id === questId) {
    showToast('Stop the active study session before deleting this quest.', { isError: true });
    return;
  }

  if (!window.confirm('Delete this quest? This cannot be undone.')) return;

  try {
    await api.delete(`/quests/${questId}`);
    quests = quests.filter((q) => q.id !== questId);
    renderQuestCount();
    renderQuestList();
  } catch (err) {
    showToast(err.message, { isError: true });
  }
}

function openQuestModal(quest) {
  const backdrop = document.getElementById('quest-modal-backdrop');
  const form = document.getElementById('quest-form');
  form.reset();
  form.elements.questId.value = quest ? quest.id : '';
  form.elements.title.value = quest ? quest.title : '';
  form.elements.description.value = quest ? quest.description : '';
  document.getElementById('quest-modal-title').textContent = quest ? 'Edit Quest' : 'New Quest';
  form.dataset.submitted = '';
  updateLengthErrors();
  backdrop.classList.add('open');
}

function questFieldValid(name, value) {
  const { min, max } = QUEST_LIMITS[name];
  const length = value.trim().length;
  return length >= min && length <= max;
}

// maxlength stops typing past the limit; this tells the user why. A quest saved before the
// limits existed can still be longer, so that case asks them to shorten it. "Too short" only
// shows after a save attempt, so it doesn't nag while the user is still typing.
function lengthError(name, value, showMin) {
  const { min, max, label } = QUEST_LIMITS[name];
  const length = value.trim().length;
  if (length > max) return `${label} must be ${max} characters or fewer (currently ${length}).`;
  if (value.length >= max) return `${label} has reached the ${max}-character limit.`;
  if (showMin && length < min) return `${label} must be at least ${min} characters.`;
  return null;
}

function updateLengthErrors() {
  const form = document.getElementById('quest-form');
  const showMin = form.dataset.submitted === 'true';
  Object.keys(QUEST_LIMITS).forEach((name) => {
    const message = lengthError(name, form.elements[name].value, showMin);
    const el = document.getElementById(`${name}-error`);
    el.textContent = message || '';
    el.hidden = !message;
  });
}

// Backstop for maxlength: if inserted text (typed, pasted or dropped) still overshoots the
// limit, cut it back. Deletions are left alone so an over-long saved quest can be shortened.
function enforceMaxLength(event) {
  const field = event.target;
  const limit = QUEST_LIMITS[field.name];
  if (limit && (event.inputType || '').startsWith('insert') && field.value.length > limit.max) {
    field.value = field.value.slice(0, limit.max);
  }
  updateLengthErrors();
}

function closeQuestModal() {
  document.getElementById('quest-modal-backdrop').classList.remove('open');
}

async function submitQuestForm(event) {
  event.preventDefault();
  const form = event.target;
  const questId = form.elements.questId.value;
  const title = form.elements.title.value.trim();
  const description = form.elements.description.value.trim();

  if (!title || !description) {
    showToast('Title and description are required.', { isError: true });
    return;
  }
  if (!questFieldValid('title', title) || !questFieldValid('description', description)) {
    form.dataset.submitted = 'true';
    updateLengthErrors();
    const { title: t, description: d } = QUEST_LIMITS;
    showToast(`Title must be ${t.min}–${t.max} characters and description ${d.min}–${d.max} characters.`, { isError: true });
    return;
  }

  const submitBtn = document.getElementById('quest-modal-submit');
  submitBtn.disabled = true;

  try {
    if (questId) {
      const existing = quests.find((q) => q.id === Number(questId));
      const updated = await api.put(`/quests/${questId}`, {
        title,
        description,
        status: existing.status,
      });
      quests = quests.map((q) => (q.id === updated.id ? updated : q));
    } else {
      const created = await api.post('/quests', { title, description, status: 'TODO' });
      quests.push(created);
    }
    renderQuestCount();
    renderQuestList();
    closeQuestModal();
  } catch (err) {
    showToast(err.message, { isError: true });
  } finally {
    submitBtn.disabled = false;
  }
}

async function initCompanion() {
  const quoteEl = document.getElementById('companion-quote');
  const imageEl = document.getElementById('companion-image');

  try {
    const settings = await api.get('/settings');
    const character = await api.get(`/characters/${settings.character_id}`);
    const quotes = await api.get(`/characters/${settings.character_id}/quotes`);

    imageEl.src = character.image_path;
    imageEl.alt = character.name;
    imageEl.hidden = false;

    if (quotes.length === 0) {
      quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(character.description || 'Stay focused. One quest at a time.')}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
      return;
    }

    let index = 0;
    const showQuote = () => {
      quoteEl.style.opacity = 0;
      setTimeout(() => {
        quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(quotes[index].quote_text)}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
        quoteEl.style.opacity = 1;
      }, 200);
    };

    showQuote();

    if (quotes.length > 1) {
      quoteRotationTimer = setInterval(() => {
        index = (index + 1) % quotes.length;
        showQuote();
      }, 8000);
    }
  } catch (err) {
    quoteEl.textContent = 'Stay focused. One quest at a time.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Rendered first and synchronously — the sidebar is static markup with no auth/settings
  // dependency, so it must not wait behind the /auth/me and /settings network round-trips.
  // Waiting behind them left #sidebar-root empty for a beat on every navigation, which is
  // what actually caused the visible "theme flash" (the colored sidebar panel popping in
  // late, not a wrong theme being applied).
  renderSidebar('questboard');

  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();
  initCompanion();

  try {
    await Promise.all([loadQuests(), loadActiveStudySession()]);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
  renderQuestCount();
  renderQuestList();

  document.getElementById('add-quest-btn').addEventListener('click', () => {
    if (quests.length >= MAX_QUESTS) {
      showToast(`You have reached the maximum of ${MAX_QUESTS} quests.`, { isError: true });
      return;
    }
    openQuestModal(null);
  });

  document.getElementById('quest-modal-cancel').addEventListener('click', closeQuestModal);
  document.getElementById('quest-modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'quest-modal-backdrop') closeQuestModal();
  });
  document.getElementById('quest-form').addEventListener('submit', submitQuestForm);
  document.getElementById('quest-form').addEventListener('input', enforceMaxLength);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      renderQuestList();
    });
  });
});

window.addEventListener('beforeunload', () => {
  if (quoteRotationTimer) clearInterval(quoteRotationTimer);
  stopTimerTick();
});
