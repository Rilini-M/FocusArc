/*
  Helpers shared by the Quest Board (questboard.js) and the study focus page (study.js):
  timer and file formatting (time in words: formatMinutes in timeFormat.js), the attachment list, and keeping open tabs in sync when a study
  session starts or stops in another tab.
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

// Seconds since a session's started_at. Always computed from the real start time (not counted
// up), so it stays right across tab throttling, navigation and refresh.
function sessionElapsedSeconds(session) {
  const startedMs = new Date(String(session.started_at).replace(' ', 'T')).getTime();
  return Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
}

// A quest's attachments as a compact list of links. Each opens in a new tab (PDFs in the
// browser's PDF viewer), so the page it was clicked on stays open.
function attachmentListHTML(attachments, label = 'Attachments') {
  if (!attachments || !attachments.length) return '';
  return `
    <div class="q-attachments">
      <span class="q-att-label">${label}</span>
      <ul class="q-att-list">
        ${attachments
          .map(
            (a) => `
          <li><a class="q-att" href="${a.url}" target="_blank" rel="noopener noreferrer"
               title="Open ${escapeHtml(a.name)} (${formatFileSize(a.size)}) in a new tab">
            ${icon(fileIcon(a.name), 14)}<span>${escapeHtml(a.name)}</span></a></li>`
          )
          .join('')}
      </ul>
    </div>`;
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
