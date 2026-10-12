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
let characters = []; // every character, for the form's Companion picker
let companionCharacter = null; // the character from Settings (quests without their own use it)

// Quest Board sections: 'active' (everything that isn't Missing, including completed quests)
// or 'missing' (unfinished quests whose deadline has passed; see isQuestMissing()).
let currentView = 'active';
let missingIds = new Set(); // Missing at the last render, to announce quests that just became Missing
let missingTracked = false; // missingIds holds a real render (not the empty start)
let deadlineTimer = null;
let extendingQuest = null; // the quest in the Extend Deadline dialog

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

// The quest's deadline, if it has one; marked once it has passed (Missing). A completed quest
// is never overdue, whatever its deadline.
function deadlineChipHTML(quest) {
  if (!quest.deadline) return '';
  const overdue = isQuestMissing(quest);
  return `<span class="q-chip q-deadline-chip${overdue ? ' overdue' : ''}">${icon('calendar-clock', 14)}<span>${overdue ? 'Missed' : 'Due'}: <strong>${formatDeadline(quest.deadline)}</strong></span></span>`;
}

// The quest's companion: its own character, or the Settings one ("My companion").
function questCharacter(quest) {
  return characters.find((c) => c.id === quest.character_id) || companionCharacter;
}

function characterChipHTML(quest) {
  const character = questCharacter(quest);
  if (!character) return '';
  return `
    <span class="q-chip q-char-chip">
      <img src="${escapeHtml(character.image_path)}" alt="" onerror="this.remove()" />
      <span>Companion: <strong>${escapeHtml(character.name)}</strong></span>
    </span>`;
}

// Extend Deadline: for unfinished quests with a deadline (a completed quest can't be reopened).
function canExtendDeadline(quest) {
  return Boolean(quest.deadline) && quest.status !== 'COMPLETED';
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

  const missing = isQuestMissing(quest);
  const extendButton = canExtendDeadline(quest)
    ? `<button class="i-btn" data-action="extend" aria-label="Extend deadline" title="Extend deadline">${icon('calendar-plus', 16)}</button>`
    : '';
  // A Missing quest's main action is getting a new deadline.
  const missingControl = missing
    ? `<button type="button" class="btn btn-s s-btn q-extend-btn" data-action="extend">${icon('calendar-plus', 15)} Extend Deadline</button>`
    : '';

  return `
    <article class="card quest-card fade${isStudyingThis ? ' studying' : ''}${missing ? ' missing' : ''}" data-quest-id="${quest.id}">
      <div class="q-top">
        <h3 class="q-title">${escapeHtml(quest.title)}</h3>
        <div class="q-acts">
          ${extendButton}
          <button class="i-btn" data-action="edit" aria-label="Edit quest">${icon('pencil', 16)}</button>
          <button class="i-btn danger" data-action="delete" aria-label="Delete quest">${icon('trash-2', 16)}</button>
        </div>
      </div>
      <p class="q-desc">${escapeHtml(quest.description)}</p>
      <div class="q-meta">
        <span class="q-chip q-time-chip">${icon('hourglass', 14)}<span>Estimated: <strong>${formatMinutes(quest.time_required)}</strong></span></span>
        ${deadlineChipHTML(quest)}
        ${quest.status === 'COMPLETED' ? `<span class="q-chip q-done-chip">${icon('circle-check', 14)}<span>Completed</span></span>` : ''}
        ${missing ? characterChipHTML(quest) : ''}
      </div>
      ${attachmentListHTML(quest.attachments, 'Attachments', quest.id)}
      <div class="q-study">${studyControl}${missingControl}</div>
    </article>`;
}

// Renders the current section (Active or Missing), the section counts, and schedules the
// next re-render for when the nearest deadline passes, so quests move to Missing on time
// without a refresh.
function renderQuestList() {
  const container = document.getElementById('quest-list');
  const missing = quests.filter(isQuestMissing);
  const active = quests.filter((q) => !isQuestMissing(q));

  // Quests that became Missing since the last render (a deadline just passed).
  // (Not on the first render: those were already Missing when the page opened.)
  const newlyMissing = missingTracked ? missing.filter((q) => !missingIds.has(q.id)) : [];
  if (newlyMissing.length) {
    showToast(
      newlyMissing.length === 1
        ? `"${newlyMissing[0].title}" missed its deadline and moved to Missing.`
        : `${newlyMissing.length} quests missed their deadlines and moved to Missing.`,
      { isError: true }
    );
  }
  missingIds = new Set(missing.map((q) => q.id));
  missingTracked = true;

  document.getElementById('active-count').textContent = active.length;
  const missingCount = document.getElementById('missing-count');
  missingCount.textContent = missing.length;
  missingCount.classList.toggle('alert', missing.length > 0);
  document.querySelectorAll('.q-tab').forEach((tab) => {
    const selected = tab.dataset.view === currentView;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  container.setAttribute('aria-labelledby', currentView === 'missing' ? 'tab-missing' : 'tab-active');

  const shown = currentView === 'missing' ? missing : active;
  if (quests.length === 0) {
    container.innerHTML = `
      <div class="empty card">
        <h3>No quests yet.</h3>
        <p>Create your first study quest.</p>
      </div>`;
  } else if (shown.length === 0 && currentView === 'missing') {
    container.innerHTML = `
      <div class="empty card">
        <h3>Nothing missing.</h3>
        <p>Quests that pass their deadline before they're completed show up here.</p>
      </div>`;
  } else if (shown.length === 0) {
    container.innerHTML = `
      <div class="empty card">
        <h3>No active quests.</h3>
        <p>Create a new quest, or extend a deadline in Missing.</p>
      </div>`;
  } else {
    container.innerHTML = shown.map(questCardHTML).join('');
  }
  refreshIcons();

  if (activeStudySession) startTimerTick();
  scheduleDeadlineCheck();
}

function showView(view) {
  currentView = view === 'missing' ? 'missing' : 'active';
  renderQuestList();
}

// Re-renders the moment the nearest unfinished deadline passes. Long waits are capped (browser
// timer limit) and simply re-schedule; a computer waking from sleep is caught when the tab
// becomes visible again (see DOMContentLoaded).
function scheduleDeadlineCheck() {
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = null;
  const ms = msUntilNextDeadline(quests);
  if (ms === null) return;
  deadlineTimer = setTimeout(renderQuestList, Math.min(ms + 250, 24 * 60 * 60 * 1000));
}

// One delegated click handler for every card, attached once.
function handleQuestListClick(event) {
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('.quest-card');
  if (!button || !card) return;
  const questId = Number(card.dataset.questId);
  const action = button.dataset.action;

  if (action === 'edit') openQuestModal(quests.find((q) => q.id === questId));
  else if (action === 'extend') openExtendModal(quests.find((q) => q.id === questId));
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
    // The saved time may have completed the quest (which also takes it out of Missing).
    await loadQuests().catch(() => {});
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
  form.elements.deadline.value = quest && quest.deadline ? deadlineInputValue(quest.deadline) : '';
  // An existing deadline that has already passed may be kept as it is; a new one must be ahead.
  form.dataset.originalDeadline = form.elements.deadline.value;
  setCharacterChoice(quest ? quest.character_id : null);
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

  const deadline = form.elements.deadline.value;
  if (form.elements.deadline.validity.badInput) errors.deadline = 'Enter a complete date and time.';
  else if (deadline && deadline !== form.dataset.originalDeadline && isDeadlinePast(deadline)) {
    errors.deadline = 'Deadline must be in the future.';
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
  ['title', 'description', 'timeRequired', 'deadline', 'file'].forEach((name) => {
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
  data.append('deadline', deadlineToApi(form.elements.deadline.value)); // "" = no deadline
  data.append('characterId', form.elements.characterId.value); // "" = the Settings character
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

// ---------------------------------------------------------------- quest companion picker

// Fills the form's Companion picker with every character. Without the list (API error) the
// picker keeps only "My companion", and quests use the Settings character.
async function loadCharacterOptions() {
  try {
    characters = await api.get('/characters');
  } catch (err) {
    characters = [];
  }
  if (missingIds.size) renderQuestList(); // Missing cards show each quest's companion
  const select = questForm().elements.characterId;
  select.innerHTML =
    '<option value="">My companion (from Settings)</option>' +
    characters.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

// Selects the quest's character (null = "My companion"). A character that no longer exists
// falls back to "My companion".
function setCharacterChoice(characterId) {
  const select = questForm().elements.characterId;
  // List not loaded (yet): keep the quest's current character rather than resetting it on save.
  if (!characters.length && Number.isInteger(characterId) && !select.querySelector(`option[value="${characterId}"]`)) {
    select.insertAdjacentHTML('beforeend', `<option value="${characterId}">Current companion</option>`);
    select.value = String(characterId);
  } else {
    select.value = characters.some((c) => c.id === characterId) ? String(characterId) : '';
  }
  updateCharacterPreview();
}

function updateCharacterPreview() {
  const preview = document.getElementById('quest-character-preview');
  const chosen = characters.find((c) => String(c.id) === questForm().elements.characterId.value);
  preview.hidden = !chosen;
  if (chosen) {
    preview.src = chosen.image_path;
    preview.alt = chosen.name;
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
    companionCharacter = character;
    if (missingIds.size) renderQuestList(); // Missing cards show the companion

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
  loadCharacterOptions();

  try {
    await Promise.all([loadQuests(), loadActiveStudySession()]);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
  renderQuestCount();
  renderQuestList();

  document.getElementById('quest-list').addEventListener('click', handleQuestListClick);
  document.querySelectorAll('.q-tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  initExtendModal();
  // Back from sleep or another tab: deadlines may have passed while timers were paused.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderQuestList();
  });

  // A session started or stopped on a focus page (another tab) updates the cards here.
  onStudyChange(async ({ stoppedSessionId }) => {
    try {
      await loadActiveStudySession();
      // A focus page that was just closed: its stop may not have reached the server yet.
      if (activeStudySession && activeStudySession.id === stoppedSessionId) activeStudySession = null;
      if (!activeStudySession) stopTimerTick();
      // A session saved elsewhere may have completed a quest.
      await loadQuests();
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
  form.elements.characterId.addEventListener('change', updateCharacterPreview);
  document.getElementById('quest-file-list').addEventListener('click', handleFileListClick);
  document.querySelectorAll('.q-preset').forEach((preset) => {
    preset.addEventListener('click', () => {
      form.elements.timeRequired.value = preset.dataset.minutes;
      updateFormErrors();
    });
  });
});

// ---------------------------------------------------------------- Extend Deadline

function extendModal() {
  return document.getElementById('extend-modal-backdrop');
}

// Step 1 picks the new deadline (checked here and again by the server); step 2 confirms it.
function openExtendModal(quest) {
  if (!quest) return;
  if (!canExtendDeadline(quest)) {
    showToast(quest.status === 'COMPLETED' ? 'This quest is completed. Its deadline can no longer be changed.' : 'This quest has no deadline. Set one with Edit.', { isError: true });
    return;
  }
  extendingQuest = quest;
  const form = document.getElementById('extend-form');
  form.reset();
  form.dataset.submitted = '';
  document.getElementById('extend-quest-title').textContent = quest.title;
  document.getElementById('extend-current').textContent = formatDeadline(quest.deadline);
  // Suggest one day after the current deadline, or after now if that is later.
  const base = Math.max(deadlineDate(quest.deadline).getTime(), Date.now());
  const input = form.elements.deadline;
  input.value = deadlineInputValue(new Date(base + 24 * 60 * 60 * 1000));
  input.min = deadlineInputValue(new Date(base + 60 * 1000));
  showExtendStep('pick');
  extendModal().classList.add('open');
  input.focus();
}

function closeExtendModal() {
  extendModal().classList.remove('open');
  extendingQuest = null;
}

function showExtendStep(step) {
  document.getElementById('extend-form').hidden = step !== 'pick';
  document.getElementById('extend-confirm-step').hidden = step !== 'confirm';
  document.getElementById('extend-save-error').hidden = true;
}

// The same rules as the server: a real date and time, later than the current deadline, and
// in the future. Returns the error message, or '' when the value is fine.
function extendDeadlineError(input) {
  if (input.validity.badInput) return 'Enter a complete date and time.';
  if (!input.value) return 'Choose the new deadline.';
  const chosen = deadlineDate(input.value).getTime();
  if (chosen <= deadlineDate(extendingQuest.deadline).getTime()) {
    return `The new deadline must be later than the current deadline (${formatDeadline(extendingQuest.deadline)}).`;
  }
  if (chosen <= Date.now()) return 'The new deadline must be in the future.';
  return '';
}

function updateExtendError() {
  const form = document.getElementById('extend-form');
  const message = form.dataset.submitted ? extendDeadlineError(form.elements.deadline) : '';
  const errorEl = document.getElementById('extend-error');
  errorEl.textContent = message;
  errorEl.hidden = !message;
  form.elements.deadline.closest('.field').classList.toggle('invalid', Boolean(message));
  return !message;
}

function handleExtendSubmit(event) {
  event.preventDefault();
  const form = event.target;
  form.dataset.submitted = 'true';
  if (!updateExtendError()) return;
  const value = form.elements.deadline.value;
  document.getElementById('extend-from').textContent = formatDeadline(extendingQuest.deadline);
  document.getElementById('extend-to').textContent = formatDeadline(value);
  document.getElementById('extend-note').hidden = !isQuestMissing(extendingQuest);
  showExtendStep('confirm');
  refreshIcons();
  document.getElementById('extend-confirm').focus();
}

async function confirmExtendDeadline() {
  const quest = extendingQuest;
  const input = document.getElementById('extend-form').elements.deadline;
  // Time may have moved on while the dialog was open: check again.
  const problem = extendDeadlineError(input);
  if (problem) {
    showExtendStep('pick');
    document.getElementById('extend-form').dataset.submitted = 'true';
    updateExtendError();
    return;
  }
  const button = document.getElementById('extend-confirm');
  button.disabled = true;
  try {
    const wasMissing = isQuestMissing(quest);
    const updated = await api.patch(`/quests/${quest.id}/deadline`, { deadline: deadlineToApi(input.value) });
    quests = quests.map((q) => (q.id === updated.id ? updated : q));
    closeExtendModal();
    renderQuestList();
    showToast(
      wasMissing && !isQuestMissing(updated)
        ? `Deadline extended. "${updated.title}" is back in your active quests.`
        : `Deadline extended to ${formatDeadline(updated.deadline)}.`
    );
  } catch (err) {
    const errorEl = document.getElementById('extend-save-error');
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    // E.g. the quest was completed or deleted meanwhile: show the board as it is now.
    if (err.status === 404 || err.status === 409) {
      await loadQuests().catch(() => {});
      renderQuestList();
    }
  } finally {
    button.disabled = false;
  }
}

function initExtendModal() {
  const form = document.getElementById('extend-form');
  form.addEventListener('submit', handleExtendSubmit);
  form.addEventListener('input', updateExtendError);
  document.querySelector('[data-extend-cancel]').addEventListener('click', closeExtendModal);
  document.getElementById('extend-back').addEventListener('click', () => {
    showExtendStep('pick');
    form.elements.deadline.focus();
  });
  document.getElementById('extend-confirm').addEventListener('click', confirmExtendDeadline);
  extendModal().addEventListener('click', (event) => {
    if (event.target === extendModal()) closeExtendModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && extendModal().classList.contains('open')) closeExtendModal();
  });
}

window.addEventListener('beforeunload', () => {
  if (quoteRotationTimer) clearInterval(quoteRotationTimer);
  if (deadlineTimer) clearTimeout(deadlineTimer);
  stopTimerTick();
});
