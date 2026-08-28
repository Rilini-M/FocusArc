const MAX_QUESTS = 10;
const STATUS_LABELS = { TODO: 'To Do', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' };
const STATUS_CLASSES = { TODO: 'todo', IN_PROGRESS: 'in-progress', COMPLETED: 'completed' };
const STATUS_ICONS = { TODO: 'scroll', IN_PROGRESS: 'sword', COMPLETED: 'badge-check' };

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
      <div class="empty-state card">
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
          <div class="study-timer-chip">${icon('timer', 15)}<span data-quest-timer="${quest.id}">00:00:00</span></div>
          <button type="button" class="btn btn-danger study-btn" data-action="stop-study">${icon('circle-stop', 16)} Stop Study</button>`
        : `
          <button type="button" class="btn btn-primary study-btn" data-action="start-study"${anotherActive ? ' disabled title="Finish your current study session first"' : ''}>${icon('play', 16)} Start Study</button>`;

      return `
      <div class="card quest-card fade-in" data-quest-id="${quest.id}" data-status="${quest.status}">
        <div class="quest-card-top">
          <div class="quest-card-icon">${icon(STATUS_ICONS[quest.status] || 'scroll', 18)}</div>
          <div class="quest-card-body">
            <h3 class="quest-card-title">${escapeHtml(quest.title)}</h3>
            <p class="quest-card-desc">${escapeHtml(quest.description)}</p>
          </div>
          <div class="quest-card-actions">
            <select class="quest-status-select" data-action="status">
              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}"${quest.status === value ? ' selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
            <button class="icon-btn" data-action="edit" aria-label="Edit quest">${icon('pencil', 16)}</button>
            <button class="icon-btn danger" data-action="delete" aria-label="Delete quest">${icon('trash-2', 16)}</button>
          </div>
        </div>
        <div class="quest-card-study">${studyControl}</div>
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    initStreak();
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
  backdrop.classList.add('open');
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
      quoteEl.textContent = character.description || 'Stay focused. One quest at a time.';
      return;
    }

    let index = 0;
    const showQuote = () => {
      quoteEl.style.opacity = 0;
      setTimeout(() => {
        quoteEl.innerHTML = `${escapeHtml(quotes[index].quote_text)}<span class="companion-hero-quote-author">— ${escapeHtml(character.name)}</span>`;
        quoteEl.style.opacity = 1;
      }, 200);
    };

    showQuote();

    if (settings.auto_quote && quotes.length > 1) {
      quoteRotationTimer = setInterval(() => {
        index = (index + 1) % quotes.length;
        showQuote();
      }, settings.quote_interval || 8000);
    }
  } catch (err) {
    quoteEl.textContent = 'Stay focused. One quest at a time.';
  }
}

async function initStreak() {
  try {
    const overview = await api.get('/analytics/overview');
    document.getElementById('streak-chip-value').textContent = overview.studyStreakDays;
    document.getElementById('streak-chip').hidden = false;
  } catch (err) {
    // Streak chip just stays hidden — not worth surfacing an error toast for it.
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
  initStreak();
  refreshIcons();
  initThemeSelect();

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

  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
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
