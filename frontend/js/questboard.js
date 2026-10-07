const MAX_QUESTS = 10;
// Kept identical to backend/middleware/validate.js and the maxlength/min/max values in questboard.html.
const QUEST_LIMITS = {
  title: { min: 2, max: 19, label: 'Title' },
  description: { min: 9, max: 99, label: 'Description' },
};
const TIME_LIMITS = { min: 1, max: 1440 }; // minutes
// Kept identical to FILE_TYPES / MAX_FILE_SIZE / MAX_FILES in backend/services/questFiles.service.js.
const FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'csv', 'doc', 'xls', 'ppt', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'];
const MAX_FILE_MB = 10;
const MAX_FILES = 5;
const TOO_MANY_FILES = `You can attach a maximum of ${MAX_FILES} files per quest.`;

let quests = []; // newest first, as returned by the API
let quoteRotationTimer = null;
let activeStudySession = null; // { id, quest_id, started_at } | null
let studyTickInterval = null;

// Attachments in the open form: the quest's current files (minus any marked for removal) plus
// newly picked ones. Picking more files adds to the list; each file can be removed with x.
let formFiles = { existing: [], removedIds: new Set(), added: [] };
let fileNotice = ''; // why some picked files weren't added (shown under the file list)

// Re-renders only the ticking number, not the whole list.
function updateTimerDisplay() {
  if (!activeStudySession) return;
  const el = document.querySelector(`[data-quest-timer="${activeStudySession.quest_id}"]`);
  if (!el) return;
  el.textContent = formatDuration(sessionElapsedSeconds(activeStudySession));
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

  // Start Study opens the quest's focus page in a new tab, which starts the session; the Quest
  // Board stays open here. It's a real link, so browsers never block it as a pop-up.
  let studyControl;
  if (isStudyingThis) {
    studyControl = `
      <div class="timer">${icon('timer', 15)}<span data-quest-timer="${quest.id}">00:00:00</span></div>
      <a class="btn btn-s s-btn" href="${focusPageUrl(quest.id)}" target="_blank" rel="noopener">${icon('external-link', 15)} Focus Page</a>
      <button type="button" class="btn btn-d s-btn" data-action="stop-study">${icon('circle-stop', 16)} Stop</button>`;
  } else if (anotherActive) {
    studyControl = `
      <button type="button" class="btn btn-p s-btn" disabled title="Finish your current study session first">${icon('play', 16)} Start Study</button>`;
  } else {
    studyControl = `
      <a class="btn btn-p s-btn" href="${focusPageUrl(quest.id, true)}" target="_blank" rel="noopener">${icon('play', 16)} Start Study</a>`;
  }

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
        <span class="q-chip q-time-chip">${icon('hourglass', 14)}<span>Time Required: <strong>${formatMinutes(quest.time_required)}</strong></span></span>
      </div>
      ${attachmentListHTML(quest.attachments)}
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
  else if (action === 'stop-study') stopStudy();
}

async function loadQuests() {
  quests = await api.get('/quests');
}

async function loadActiveStudySession() {
  activeStudySession = await api.get('/study-sessions/active');
}

async function stopStudy() {
  if (!activeStudySession) return;
  const sessionId = activeStudySession.id;

  try {
    await api.post(`/study-sessions/${sessionId}/stop`);
    stopTimerTick();
    activeStudySession = null;
    renderQuestList();
    announceStudyChange(); // an open focus page shows the session as ended
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
  formFiles = { existing: quest ? quest.attachments : [], removedIds: new Set(), added: [] };
  fileNotice = '';
  document.getElementById('quest-modal-title').textContent = quest ? 'Edit Quest' : 'Create Quest';
  document.getElementById('quest-modal-submit').textContent = quest ? 'Save Quest' : 'Create Quest';
  form.dataset.submitted = '';
  renderFileList();
  updateFormErrors();
  document.getElementById('quest-modal-backdrop').classList.add('open');
  form.elements.title.focus();
}

function closeQuestModal() {
  document.getElementById('quest-modal-backdrop').classList.remove('open');
}

function keptFiles() {
  return formFiles.existing.filter((f) => !formFiles.removedIds.has(f.id));
}

function fileCount() {
  return keptFiles().length + formFiles.added.length;
}

// The form's file list: kept current files and newly added ones, each with a remove button.
function renderFileList() {
  const row = (name, size, attrs, isNew) => `
    <li class="q-file-row${isNew ? ' new' : ''}">
      ${icon(fileIcon(name), 15)}
      <span class="q-file-row-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="q-file-row-size">${isNew ? 'new · ' : ''}${formatFileSize(size)}</span>
      <button type="button" class="q-file-remove" ${attrs} aria-label="Remove ${escapeHtml(name)}">${icon('x', 14)}</button>
    </li>`;

  document.getElementById('quest-file-list').innerHTML = [
    ...keptFiles().map((f) => row(f.name, f.size, `data-remove-existing="${f.id}"`, false)),
    ...formFiles.added.map((f, i) => row(f.name, f.size, `data-remove-added="${i}"`, true)),
  ].join('');

  const count = fileCount();
  const full = count >= MAX_FILES;
  const countEl = document.getElementById('quest-files-count');
  countEl.textContent = `${count} / ${MAX_FILES} files`;
  countEl.classList.toggle('full', full);
  document.getElementById('quest-files').disabled = full;
  document.getElementById('quest-files-btn').classList.toggle('disabled', full);
  document.getElementById('quest-files-btn-text').textContent = count ? 'Add Files' : 'Choose Files';
  refreshIcons();
}

// Adds newly picked files to the selection (never replacing earlier ones). Invalid files and
// files over the 5-file limit are not added, and the user is told which and why.
function addPickedFiles(input) {
  if (!input.files.length) return; // nothing picked: keep the list and any message as they are
  const problems = [];
  const overLimit = [];
  [...input.files].forEach((file) => {
    const ext = fileExtension(file.name);
    if (!FILE_EXTENSIONS.includes(ext)) problems.push(`"${file.name}": this file type is not allowed.`);
    else if (file.size === 0) problems.push(`"${file.name}" is empty.`);
    else if (file.size > MAX_FILE_MB * 1024 * 1024) problems.push(`"${file.name}" is larger than ${MAX_FILE_MB} MB.`);
    else if (formFiles.added.some((f) => f.name === file.name && f.size === file.size)) problems.push(`"${file.name}" is already in the list.`);
    else if (fileCount() >= MAX_FILES) overLimit.push(file.name);
    else formFiles.added.push(file);
  });
  if (overLimit.length) problems.unshift(`${TOO_MANY_FILES} Not added: ${overLimit.join(', ')}.`);
  fileNotice = problems.join(' ');
  input.value = ''; // so the same file can be picked again after removing it
  renderFileList();
  updateFormErrors();
}

function handleFileListClick(event) {
  const button = event.target.closest('.q-file-remove');
  if (!button) return;
  if (button.dataset.removeExisting) formFiles.removedIds.add(Number(button.dataset.removeExisting));
  else formFiles.added.splice(Number(button.dataset.removeAdded), 1);
  fileNotice = '';
  renderFileList();
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

  if (fileCount() > MAX_FILES) errors.file = TOO_MANY_FILES;
  return errors;
}

function updateFormErrors() {
  // Highlight the quick-time chip that matches the entered minutes.
  const minutes = questForm().elements.timeRequired.value.trim();
  document.querySelectorAll('.q-preset').forEach((preset) => {
    preset.classList.toggle('active', preset.dataset.minutes === minutes);
  });

  const errors = fieldErrors();
  const shown = { ...errors, file: errors.file || fileNotice };
  ['title', 'description', 'timeRequired', 'file'].forEach((name) => {
    const el = document.getElementById(`${name}-error`);
    el.textContent = shown[name] || '';
    el.hidden = !shown[name];
  });
  // "reached the limit" and notices about files that weren't added don't block saving.
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
  if (field.type === 'file') {
    addPickedFiles(field);
    return;
  }
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
  formFiles.added.forEach((file) => data.append('files', file));
  if (questId) formFiles.removedIds.forEach((id) => data.append('removeAttachments', String(id)));

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

  // A session started or stopped on a focus page (another tab) updates the cards here.
  onStudyChange(async () => {
    try {
      await loadActiveStudySession();
      if (!activeStudySession) stopTimerTick();
      renderQuestList();
    } catch (err) {
      // Keep the current view; the next change or refresh will catch up.
    }
  });

  document.getElementById('add-quest-btn').addEventListener('click', () => {
    if (quests.length >= MAX_QUESTS) {
      showToast(`You have reached the maximum of ${MAX_QUESTS} quests.`, { isError: true });
      return;
    }
    openQuestModal(null);
  });

  const form = questForm();
  document.getElementById('quest-files').accept = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
  document.getElementById('quest-modal-cancel').addEventListener('click', closeQuestModal);
  document.getElementById('quest-modal-backdrop').addEventListener('click', (event) => {
    if (event.target.id === 'quest-modal-backdrop') closeQuestModal();
  });
  form.addEventListener('submit', submitQuestForm);
  form.addEventListener('input', handleFormInput); // also fires when a file is picked
  document.getElementById('quest-file-list').addEventListener('click', handleFileListClick);
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
