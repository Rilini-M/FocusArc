/*
  File viewer (viewer.html?quest=<id>&file=<attachment id>). Opened in a new tab when a quest's
  PDF or image is clicked on the Quest Board or the study page (see attachmentListHTML in
  questShared.js); other file types still open directly.
  - The theme is the user's study theme from Settings, like every page: theme-init.js paints
    the cached copy first, loadAndApplyTheme() confirms it from the server. Nothing about the
    look travels in the address, so a refresh or a copied link keeps it.
  - The quest, the file and the quest's companion character are loaded from the server by
    the ids in the address, so the page works the same in a new tab or after a refresh.
  - The file itself comes from the existing owner-only attachment route. It is shown as is:
    no overlays or effects on top of the document.
  - This page never starts, stops or keeps alive a study session; it only shows the running
    session's time when this quest is being studied (the study page stays in charge).
*/

const params = new URLSearchParams(window.location.search);
const questId = Number(params.get('quest'));
const fileId = Number(params.get('file'));

let quest = null;
let file = null;
let session = null; // the running session, when it is for this quest
let tickTimer = null;

function isId(value) {
  return Number.isInteger(value) && value > 0;
}

function stage() {
  return document.getElementById('vw-stage');
}

function showProblem(title, text) {
  document.getElementById('vw-file-name').textContent = title;
  stage().innerHTML = `
    <div class="vw-empty">
      <p>${text}</p>
      <a class="btn btn-p" href="questboard.html">${icon('list-checks', 16)} Back to Quest Board</a>
    </div>`;
  refreshIcons();
  document.title = `${title} — FocusArc`;
}

// ---- The document

function renderPdf() {
  const frame = document.createElement('iframe');
  frame.className = 'vw-pdf';
  frame.src = file.url;
  frame.title = file.name;
  stage().replaceChildren(frame);
}

// Images open fitted to the panel; the zoom button (or a click on the image) switches to
// actual size, where the stage scrolls.
function renderImage() {
  const wrap = document.createElement('div');
  wrap.className = 'vw-image-wrap';
  const img = document.createElement('img');
  img.className = 'vw-image';
  img.alt = file.name;
  img.addEventListener('error', () => {
    stage().innerHTML = `<div class="vw-empty"><p>This image could not be loaded.</p></div>`;
    document.getElementById('vw-zoom').hidden = true;
  });
  img.src = file.url;
  wrap.appendChild(img);
  stage().replaceChildren(wrap);

  const zoom = document.getElementById('vw-zoom');
  const setZoom = (actual) => {
    stage().classList.toggle('actual-size', actual);
    zoom.innerHTML = actual ? `${icon('minimize-2', 15)} Fit to Screen` : `${icon('maximize-2', 15)} Actual Size`;
    zoom.setAttribute('aria-pressed', String(actual));
    refreshIcons();
  };
  zoom.hidden = false;
  zoom.addEventListener('click', () => setZoom(!stage().classList.contains('actual-size')));
  img.addEventListener('click', () => setZoom(!stage().classList.contains('actual-size')));
  setZoom(false);
}

// A file type the viewer doesn't show (e.g. a link edited by hand): offer to open it directly.
function renderOther() {
  stage().innerHTML = `
    <div class="vw-empty">
      <p>This file type can't be previewed here.</p>
      <a class="btn btn-p" href="${file.url}" target="_blank" rel="noopener noreferrer">${icon('external-link', 16)} Open File</a>
    </div>`;
  refreshIcons();
}

function renderFile() {
  const ext = fileExtension(file.name);
  document.getElementById('vw-file-icon').innerHTML = icon(fileIcon(file.name), 20);
  document.getElementById('vw-quest').innerHTML = `${icon('swords', 14)} ${escapeHtml(quest.title)}`;
  document.getElementById('vw-file-name').textContent = file.name;
  document.getElementById('vw-meta').textContent = `${ext.toUpperCase()} · ${formatFileSize(file.size)}`;
  const open = document.getElementById('vw-open');
  open.href = file.url;
  open.hidden = false;
  document.title = `${file.name} · ${quest.title} — FocusArc`;

  if (ext === 'pdf') renderPdf();
  else if (isViewableFile(file.name)) renderImage();
  else renderOther();
  refreshIcons();
}

// ---- Side panel: the quest's companion and its other files

async function initSide() {
  const side = document.getElementById('vw-side');
  const others = quest.attachments.filter((a) => a.id !== file.id);
  document.getElementById('vw-files').innerHTML = attachmentListHTML(others, 'More study material', quest.id);
  if (others.length) side.hidden = false;

  try {
    const companion = await loadQuestCompanion(quest);
    if (!companion) return;
    showCompanion(companion, document.getElementById('vw-char-img'), document.getElementById('vw-char-quote'));
    document.getElementById('vw-companion').hidden = false;
    side.hidden = false;
  } catch (err) {
    // The companion is decoration; the document works without it.
  }
}

// ---- Study time (display only)

function updateTimer() {
  if (!session) return;
  document.getElementById('vw-timer-text').textContent = formatDuration(sessionElapsedSeconds(session));
}

// `stoppedSessionId`: a study page that was just closed; its stop may not have reached the
// server yet (see announceStudyChange).
async function refreshSession({ stoppedSessionId } = {}) {
  try {
    const active = await api.get('/study-sessions/active');
    session = active && active.quest_id === questId && active.id !== stoppedSessionId ? active : null;
  } catch (err) {
    // Keep showing what we had.
  }
  document.getElementById('vw-timer').hidden = !session;
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = session ? setInterval(updateTimer, 1000) : null;
  updateTimer();
}

document.addEventListener('DOMContentLoaded', async () => {
  refreshIcons();
  const user = await requireAuth();
  if (!user) return;
  await loadAndApplyTheme();

  if (!isId(questId) || !isId(fileId)) {
    showProblem('File not found', 'This link is incomplete. Open the file from the Quest Board or the study page.');
    return;
  }

  try {
    const quests = await api.get('/quests');
    quest = quests.find((q) => q.id === questId) || null;
    if (!quest) {
      showProblem('Quest not found', 'This quest no longer exists. It may have been deleted.');
      return;
    }
    file = (quest.attachments || []).find((a) => a.id === fileId) || null;
    if (!file) {
      showProblem('File not found', 'This file is no longer attached to the quest.');
      return;
    }
  } catch (err) {
    showProblem('Something went wrong', escapeHtml(err.message));
    return;
  }

  renderFile();
  initSide();
  refreshSession();
  // Started or stopped on the study page or Quest Board (or this tab shown again).
  onStudyChange(refreshSession);
});
