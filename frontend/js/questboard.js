const MAX_QUESTS = 10;
const STATUS_LABELS = { TODO: 'To Do', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' };
const STATUS_CLASSES = { TODO: 'todo', IN_PROGRESS: 'in-progress', COMPLETED: 'completed' };

let quests = [];
let activeFilter = 'ALL';
let quoteRotationTimer = null;

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
    .map(
      (quest) => `
      <div class="card quest-card fade-in" data-quest-id="${quest.id}">
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
          <button class="icon-btn" data-action="edit" aria-label="Edit quest">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete" aria-label="Delete quest">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      </div>`
    )
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
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadQuests() {
  try {
    quests = await api.get('/quests');
    renderQuestCount();
    renderQuestList();
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
      quoteEl.textContent = `"${character.description}"`;
      return;
    }

    let index = 0;
    const renderQuote = () => {
      quoteEl.style.opacity = 0;
      setTimeout(() => {
        quoteEl.innerHTML = `"${escapeHtml(quotes[index].quote_text)}"<span class="companion-quote-author">— ${escapeHtml(character.name)}</span>`;
        quoteEl.style.opacity = 1;
      }, 200);
      index = (index + 1) % quotes.length;
    };

    renderQuote();

    if (settings.auto_quote && quotes.length > 1) {
      quoteRotationTimer = setInterval(renderQuote, settings.quote_interval || 8000);
    }
  } catch (err) {
    quoteEl.textContent = 'Stay focused. One quest at a time.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();
  renderSidebar('questboard');
  initCompanion();
  loadQuests();

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
});
