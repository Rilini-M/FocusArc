/*
  Helpers shared by the Quest Board (questboard.js) and the study focus page (study.js):
  timer and file formatting (time in words: formatMinutes in timeFormat.js), the attachment list, and keeping open tabs in sync when a study
  session starts or stops in another tab. Also used by the file viewer (viewer.js): viewer
  links and the quest's companion character.
*/

// Icon per file type (anything else: file-text).
const FILE_ICONS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  'file-spreadsheet': ['csv', 'xls', 'xlsx', 'ods'],
  presentation: ['ppt', 'pptx', 'odp'],
};

function fileExtension(name) {
  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function fileIcon(name) {
  const ext = fileExtension(name);
  const found = Object.entries(FILE_ICONS).find(([, exts]) => exts.includes(ext));
  return found ? found[0] : 'file-text';
}

// 3725 -> "01:02:05"
function formatDuration(totalSeconds) {
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---- Deadlines. The server stores and sends a UTC instant ("2026-10-10T14:15:00Z"); the
// browser shows it, and takes it from the date/time inputs, in the user's local time. Both
// sides compare real instants, so time zones never shift a deadline.

// A deadline from the server ("…Z") or a datetime-local input ("2026-10-10T20:00", local time)
// as a Date.
function deadlineDate(deadline) {
  const value = String(deadline);
  if (value.endsWith('Z')) return new Date(value);
  const [y, mo, d, h, mi] = value.split(/[-T :]/).map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

// A Date or deadline -> "2026-10-10T20:00" in local time, the value a datetime-local input
// expects.
function deadlineInputValue(deadline) {
  const date = deadline instanceof Date ? deadline : deadlineDate(deadline);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// A datetime-local value (local time) -> the UTC instant the API expects; "" stays "" (no deadline).
function deadlineToApi(inputValue) {
  return inputValue ? deadlineDate(inputValue).toISOString() : '';
}

// Passed once its moment has come (the same <= the server uses).
function isDeadlinePast(deadline) {
  return deadlineDate(deadline).getTime() <= Date.now();
}

// The Missing rule, the same as isMissing() in backend/controllers/quests.controller.js: an
// unfinished quest whose deadline has passed. Completed quests and quests without a deadline
// never are. Worked out from the deadline and completion only, never from study activity.
function isQuestMissing(quest) {
  return quest.status !== 'COMPLETED' && Boolean(quest.deadline) && isDeadlinePast(quest.deadline);
}

// Milliseconds until the next unfinished quest's deadline passes, or null if none is ahead.
function msUntilNextDeadline(quests) {
  const now = Date.now();
  const upcoming = quests
    .filter((q) => q.status !== 'COMPLETED' && q.deadline)
    .map((q) => deadlineDate(q.deadline).getTime() - now)
    .filter((ms) => ms > 0);
  return upcoming.length ? Math.min(...upcoming) : null;
}

// "Sat, Oct 10, 2026, 8:00 PM" (in the browser's own language, clock style and time zone).
function formatDeadline(deadline) {
  return deadlineDate(deadline).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Seconds since a session's started_at. Always computed from the real start time (not counted
// up), so it stays right across tab throttling, navigation and refresh.
function sessionElapsedSeconds(session) {
  const startedMs = new Date(String(session.started_at).replace(' ', 'T')).getTime();
  return Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
}

// Files the FocusArc viewer (viewer.html) shows inside the app: PDFs and images. Anything
// else opens as before (text in the browser, Office files download).
const VIEWER_TYPES = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

function isViewableFile(name) {
  return VIEWER_TYPES.includes(fileExtension(name));
}

// The themed viewer page for one of a quest's files. Only ids go in the address; the page
// loads the quest, the file and the quest's character from the server.
function attachmentViewerUrl(questId, attachmentId) {
  return `viewer.html?quest=${encodeURIComponent(questId)}&file=${encodeURIComponent(attachmentId)}`;
}

// A quest's attachments as a compact list of links. Each opens in a new tab, so the page it
// was clicked on stays open. With `questId`, PDFs and images open in the FocusArc viewer.
function attachmentListHTML(attachments, label = 'Attachments', questId = null) {
  if (!attachments || !attachments.length) return '';
  return `
    <div class="q-attachments">
      <span class="q-att-label">${label}</span>
      <ul class="q-att-list">
        ${attachments
          .map(
            (a) => `
          <li><a class="q-att" href="${questId && isViewableFile(a.name) ? attachmentViewerUrl(questId, a.id) : a.url}" target="_blank" rel="noopener noreferrer"
               title="Open ${escapeHtml(a.name)} (${formatFileSize(a.size)}) in a new tab">
            ${icon(fileIcon(a.name), 14)}<span>${escapeHtml(a.name)}</span></a></li>`
          )
          .join('')}
      </ul>
    </div>`;
}

// ---- The quest's companion character (study page and file viewer).

// The quest's own character, or the one chosen in Settings when the quest has none (or its
// character was deleted), or the first character as a last resort. Returns
// { character, quotes } (quotes may be empty), or null if no character can be loaded.
async function loadQuestCompanion(quest) {
  const candidates = [];
  if (quest && Number.isInteger(quest.character_id)) candidates.push(quest.character_id);
  try {
    const settings = await api.get('/settings');
    if (Number.isInteger(settings.character_id)) candidates.push(settings.character_id);
  } catch (err) {
    // No settings: fall through to the first character.
  }
  candidates.push(1);

  for (const id of [...new Set(candidates)]) {
    try {
      const character = await api.get(`/characters/${id}`);
      let quotes = [];
      try {
        quotes = await api.get(`/characters/${id}/quotes`);
      } catch (err) {
        // The character still shows without quotes.
      }
      return { character, quotes: Array.isArray(quotes) ? quotes : [] };
    } catch (err) {
      // That character is gone; try the next one.
    }
  }
  return null;
}

// Shows `companion` in an image + quote pair and rotates its quotes every 12 seconds. With
// no quotes, the character's description (or a default line) is shown.
function showCompanion(companion, imageEl, quoteEl) {
  const { character, quotes } = companion;
  imageEl.addEventListener('error', () => imageEl.classList.add('broken'), { once: true });
  imageEl.src = character.image_path;
  imageEl.alt = character.name;
  const texts = quotes.length ? quotes.map((q) => q.quote_text) : [character.description || 'Stay focused. One quest at a time.'];
  const show = (text) => {
    quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(text)}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
  };
  let index = Math.floor(Math.random() * texts.length);
  show(texts[index]);
  if (texts.length > 1) {
    setInterval(() => {
      index = (index + 1) % texts.length;
      show(texts[index]);
    }, 12000);
  }
}

// The focus page for a quest. With `start`, opening it starts the study session.
function focusPageUrl(questId, start) {
  return `study.html?quest=${encodeURIComponent(questId)}${start ? '&start=1' : ''}`;
}

// ---- Keeping tabs in sync: a session started or stopped in one tab updates the others.

const STUDY_CHANNEL = 'focusarc-study';
const studyChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(STUDY_CHANNEL) : null;

// `detail.stoppedSessionId`: a closing study page has just sent the stop for that session,
// which may reach the server a moment after other tabs react to this message.
function announceStudyChange(detail = {}) {
  if (studyChannel) studyChannel.postMessage({ type: 'study-changed', ...detail });
}

// Calls `callback(detail)` when another tab announces a change, and when this tab becomes
// visible again (in case a message was missed or BroadcastChannel isn't available).
function onStudyChange(callback) {
  if (studyChannel) studyChannel.addEventListener('message', (event) => callback(event.data || {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') callback({});
  });
}
