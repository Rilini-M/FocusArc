const MAX_QUESTS = 10;
// Kept identical to backend/middleware/validate.js and the maxlength/min/max values in questboard.html.
const QUEST_LIMITS = {
  title: { min: 2, max: 19, label: 'Title' },
  description: { min: 9, max: 99, label: 'Description' },
};
const TIME_LIMITS = { min: 1, max: 1440 }; // minutes
// Kept identical to FILE_TYPES / MAX_FILE_SIZE in backend/services/questFiles.service.js.
const FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'csv', 'doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'];
const MAX_FILE_MB = 10;

let quests = []; // newest first, as returned by the API
let quoteRotationTimer = null;
let activeStudySession = null; // { id, quest_id, started_at } | null
let studyTickInterval = null;

// Attachment choice in the open form: the quest's current file, a newly picked file, or removal.
let formAttachment = { existing: null, removed: false };

function formatDuration(totalSeconds) {
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// "45 min", "1 h", "1 h 30 min"
function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function questCardHTML(quest) {
  const isStudyingThis = activeStudySession && activeStudySession.quest_id === quest.id;
  const anotherActive = activeStudySession && !isStudyingThis;

  const studyControl = isStudyingThis
    ? `
      <div class="timer">${icon('timer', 15)}<span data-quest-timer="${quest.id}">00:00:00</span></div>
      <button type="button" class="btn btn-d s-btn" data-action="stop-study">${icon('circle-stop', 16)} Stop Study</button>`
    : `
      <button type="button" class="btn btn-p s-btn" data-action="start-study"${anotherActive ? ' disabled title="Finish your current study session first"' : ''}>${icon('play', 16)} Start Study</button>`;

  const attachment = quest.attachment
    ? `<a class="q-chip q-attach" href="${quest.attachment.url}" target="_blank" rel="noopener"
         title="Open ${escapeHtml(quest.attachment.name)} (${formatFileSize(quest.attachment.size)})">
         ${icon('paperclip', 14)}<span>${escapeHtml(quest.attachment.name)}</span></a>`
    : '';

  return `
    <article class="card quest-card fade${isStudyingThis ? ' studying' : ''}" data-quest-id="${quest.id}">
      <div class="q-top">
        <h3 class="q-title">${escapeHtml(quest.title)}</h3>
        <div class="q-acts">
          <button class="i-btn" data-action="edit" aria-label="Edit quest">${icon('pencil', 16)}</button>
          <button class="i-btn danger" data-action="delete" aria-label="Delete quest">${icon('trash-2', 16)}</button>
        </div>
      </div>
      <p class="q-desc">${escapeHtml(quest.description)}</p>
      <div class="q-meta">
        ${attachment}
        <span class="q-chip q-time-chip">${icon('hourglass', 14)}<span>Time Required: <strong>${formatMinutes(quest.time_required)}</strong></span></span>
      </div>
      <div class="q-study">${studyControl}</div>
    </article>`;
}

function renderQuestList() {
  const container = document.getElementById('quest-list');

  if (quests.length === 0) {
    container.innerHTML = `
      <div class="empty card">
        <h3>No quests yet.</h3>
        <p>Create your first study quest.</p>
      </div>`;
    return;
  }

  container.innerHTML = quests.map(questCardHTML).join('');
  refreshIcons();

  if (activeStudySession) startTimerTick();
}

// One delegated click handler for every card, attached once.
function handleQuestListClick(event) {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('.quest-card');
  if (!button || !card) return;
  const questId = Number(card.dataset.questId);
  const action = button.dataset.action;

  if (action === 'edit') openQuestModal(quests.find((q) => q.id === questId));
  else if (action === 'delete') deleteQuest(questId);
  else if (action === 'start-study') startStudy(questId);
  else if (action === 'stop-study') stopStudy();
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

// ---------------------------------------------------------------- create / edit form

function questForm() {
  return document.getElementById('quest-form');
}

function openQuestModal(quest) {
  const form = questForm();
  form.reset();
  form.elements.questId.value = quest ? quest.id : '';
  form.elements.title.value = quest ? quest.title : '';
  form.elements.description.value = quest ? quest.description : '';
  form.elements.timeRequired.value = quest ? quest.time_required : 60;
  formAttachment = { existing: quest ? quest.attachment : null, removed: false };
  document.getElementById('quest-modal-title').textContent = quest ? 'Edit Quest' : 'Create Quest';
  document.getElementById('quest-modal-submit').textContent = quest ? 'Save Quest' : 'Create Quest';
  form.dataset.submitted = '';
  renderFileChoice();
  updateFormErrors();
  document.getElementById('quest-modal-backdrop').classList.add('open');
  form.elements.title.focus();
}

function closeQuestModal() {
  document.getElementById('quest-modal-backdrop').classList.remove('open');
}

// Shows the picked file, else the quest's current attachment, else "No file chosen".
function renderFileChoice() {
  const picked = questForm().elements.file.files[0];
  const current = !formAttachment.removed && formAttachment.existing;
  const nameEl = document.getElementById('quest-file-name');
  const hintEl = document.getElementById('quest-file-hint');

  nameEl.textContent = picked ? picked.name : current ? current.name : 'No file chosen';
  nameEl.classList.toggle('chosen', Boolean(picked || current));
  document.getElementById('quest-file-clear').hidden = !(picked || current);
  hintEl.textContent = picked
    ? `${formatFileSize(picked.size)}${formAttachment.existing ? ' — replaces the current file' : ''}`
    : current
      ? 'Current file. Choose another to replace it.'
      : `PDF, images, text or Office files, up to ${MAX_FILE_MB} MB.`;
}

function clearFileChoice() {
  const input = questForm().elements.file;
  if (input.files.length) {
    input.value = ''; // drop the newly picked file (the current attachment, if any, stays)
  } else {
    formAttachment.removed = true; // remove the quest's current attachment on save
  }
  renderFileChoice();
  updateFormErrors();
}

// Error message per field, or null. "Too short" / "required" only show after a save attempt,
// so they don't nag while the user is still typing.
function fieldErrors() {
  const form = questForm();
  const showMin = form.dataset.submitted === 'true';
  const errors = {};

  Object.entries(QUEST_LIMITS).forEach(([name, { min, max, label }]) => {
    const value = form.elements[name].value;
    const length = value.trim().length;
    if (length > max) errors[name] = `${label} must be ${max} characters or fewer (currently ${length}).`;
    else if (value.length >= max) errors[name] = `${label} has reached the ${max}-character limit.`;
    else if (showMin && length < min) errors[name] = `${label} must be at least ${min} characters.`;
  });

  const time = form.elements.timeRequired.value.trim();
  if (time !== '' || showMin) {
    if (!/^\d+$/.test(time) || Number(time) < TIME_LIMITS.min || Number(time) > TIME_LIMITS.max) {
      errors.timeRequired = `Enter a whole number of minutes from ${TIME_LIMITS.min} to ${TIME_LIMITS.max}.`;
    }
  }

  const file = form.elements.file.files[0];
  if (file) {
    const ext = (file.name.split('.').length > 1 ? file.name.split('.').pop() : '').toLowerCase();
    if (!FILE_EXTENSIONS.includes(ext)) errors.file = `This file type is not allowed. Use: ${FILE_EXTENSIONS.join(', ')}.`;
    else if (file.size === 0) errors.file = 'The file is empty.';
    else if (file.size > MAX_FILE_MB * 1024 * 1024) errors.file = `The file is too large. The limit is ${MAX_FILE_MB} MB.`;
  }
  return errors;
}

function updateFormErrors() {
  // Highlight the quick-time chip that matches the entered minutes.
  const minutes = questForm().elements.timeRequired.value.trim();
  document.querySelectorAll('.q-preset').forEach((preset) => {
    preset.classList.toggle('active', preset.dataset.minutes === minutes);
  });

  const errors = fieldErrors();
  ['title', 'description', 'timeRequired', 'file'].forEach((name) => {
    const el = document.getElementById(`${name}-error`);
    el.textContent = errors[name] || '';
    el.hidden = !errors[name];
  });
  // "reached the limit" is a notice, not a blocking error.
  return Object.entries(errors).filter(([, message]) => !message.includes('has reached the')).length === 0;
}

// Backstop for maxlength: if inserted text (typed, pasted or dropped) still overshoots the
// limit, cut it back. Deletions are left alone so an over-long saved quest can be shortened.
function handleFormInput(event) {
  const field = event.target;
  const limit = QUEST_LIMITS[field.name];
  if (limit && (event.inputType || '').startsWith('insert') && field.value.length > limit.max) {
    field.value = field.value.slice(0, limit.max);
  }
  if (field.name === 'file') renderFileChoice();
  updateFormErrors();
}

async function submitQuestForm(event) {
  event.preventDefault();
  const form = event.target;
  form.dataset.submitted = 'true';
  if (!updateFormErrors()) {
    showToast('Please fix the highlighted fields.', { isError: true });
    return;
  }

  const questId = form.elements.questId.value;
  const data = new FormData();
  data.append('title', form.elements.title.value.trim());
  data.append('description', form.elements.description.value.trim());
  data.append('timeRequired', form.elements.timeRequired.value.trim());
  const file = form.elements.file.files[0];
  if (file) data.append('file', file);
  else if (questId && formAttachment.removed) data.append('removeAttachment', 'true');

  const submitBtn = document.getElementById('quest-modal-submit');
  submitBtn.disabled = true;

  try {
    if (questId) {
      const updated = await api.put(`/quests/${questId}`, data);
      quests = quests.map((q) => (q.id === updated.id ? updated : q));
      showToast('Quest updated.');
    } else {
      const created = await api.post('/quests', data);
      quests = [created, ...quests].slice(0, MAX_QUESTS);
      showToast('Quest created.');
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

// ---------------------------------------------------------------- companion banner

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

  document.getElementById('quest-list').addEventListener('click', handleQuestListClick);

  document.getElementById('add-quest-btn').addEventListener('click', () => {
    if (quests.length >= MAX_QUESTS) {
      showToast(`You have reached the maximum of ${MAX_QUESTS} quests.`, { isError: true });
      return;
    }
    openQuestModal(null);
  });

  const form = questForm();
  form.elements.file.accept = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
  document.getElementById('quest-modal-cancel').addEventListener('click', closeQuestModal);
  document.getElementById('quest-modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'quest-modal-backdrop') closeQuestModal();
  });
  form.addEventListener('submit', submitQuestForm);
  form.addEventListener('input', handleFormInput); // also fires when a file is picked
  document.getElementById('quest-file-clear').addEventListener('click', clearFileChoice);
  document.querySelectorAll('.q-preset').forEach((preset) => {
    preset.addEventListener('click', () => {
      form.elements.timeRequired.value = preset.dataset.minutes;
      updateFormErrors();
    });
  });
});

window.addEventListener('beforeunload', () => {
  if (quoteRotationTimer) clearInterval(quoteRotationTimer);
  stopTimerTick();
});
