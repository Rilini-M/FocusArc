const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 400;
const FALLBACK_IMAGE = '/assets/logo/logo.png.png';

let characters = []; // only the page currently shown, never the whole table
let currentPage = 1;
let currentSearch = '';
let latestRequest = 0;
let currentSettings = null;
let quoteRotationTimer = null;

// Built-in companions have short traits ("Determined and Never gives up") shown as their first
// word. Imported characters show their short description instead (CSS keeps it to two lines).
function characterTrait(character) {
  const description = (character.description || '').trim();
  if (character.external_api_id) return description;
  const firstWord = description.split(/\s+/)[0] || '';
  return firstWord.replace(/[.,]+$/, '');
}

function renderCompanionGrid(selectedId) {
  const grid = document.getElementById('companion-grid');
  grid.innerHTML = characters
    .map(
      (c) => `
      <button class="c-opt${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}">
        <span class="co-wrap">
          <img class="co-img" src="${escapeHtml(c.image_path)}" alt="${escapeHtml(c.name)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'" />
          ${c.id === selectedId ? `<span class="co-check">${icon('check', 12)}</span>` : ''}
        </span>
        <span class="co-name">${escapeHtml(c.name)}</span>
        <span class="co-trait">${escapeHtml(characterTrait(c))}</span>
      </button>`
    )
    .join('');

  grid.querySelectorAll('.c-opt').forEach((btn) => {
    btn.addEventListener('click', () => selectCharacter(Number(btn.dataset.characterId)));
  });

  refreshIcons();
}

function renderPager(pagination) {
  const pager = document.getElementById('companion-pager');
  const empty = document.getElementById('companion-empty');

  empty.hidden = pagination.total > 0;
  pager.hidden = pagination.total === 0;
  if (pagination.total === 0) return;

  document.getElementById('companion-page-label').textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
  document.getElementById('companion-prev').disabled = pagination.page <= 1;
  document.getElementById('companion-next').disabled = pagination.page >= pagination.totalPages;
}

// Asks the backend for one page (20 characters), optionally filtered by name.
async function loadCompanionPage(page) {
  const requestId = ++latestRequest;
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (currentSearch) params.set('search', currentSearch);

  try {
    const result = await api.get(`/characters?${params}`);
    // Ignore an older response that arrives after a newer search was started.
    if (requestId !== latestRequest) return;

    characters = result.characters;
    currentPage = result.pagination.page;
    renderCompanionGrid(currentSettings ? currentSettings.character_id : null);
    renderPager(result.pagination);
  } catch (err) {
    if (requestId === latestRequest) showToast(err.message, { isError: true });
  }
}

async function selectCharacter(characterId) {
  if (currentSettings && currentSettings.character_id === characterId) return;

  try {
    await api.patch('/settings/character', { characterId });
    currentSettings.character_id = characterId;
    renderCompanionGrid(characterId);
    await loadHero(characterId);
    showToast('Study companion updated.');
  } catch (err) {
    showToast(err.message, { isError: true });
  }
}

async function loadHero(characterId) {
  if (quoteRotationTimer) {
    clearInterval(quoteRotationTimer);
    quoteRotationTimer = null;
  }

  // The chosen companion may be on a different page than the one shown, so load it by id.
  const character = await api.get(`/characters/${characterId}`);

  const heroImage = document.getElementById('hero-image');
  const identity = document.getElementById('hero-identity');
  const quoteEl = document.getElementById('hero-quote');

  heroImage.onerror = () => {
    heroImage.onerror = null;
    heroImage.src = FALLBACK_IMAGE;
  };
  heroImage.src = character.image_path;
  heroImage.alt = character.name;
  heroImage.hidden = false;

  document.getElementById('hero-name').textContent = character.name;
  document.getElementById('hero-description').textContent = character.description || '';
  identity.hidden = false;

  const quotes = await api.get(`/characters/${characterId}/quotes`);

  if (quotes.length === 0) {
    quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(character.description || 'Stay focused.')}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
    return;
  }

  let index = 0;
  const showQuote = () => {
    quoteEl.style.opacity = 0;
    quoteEl.style.transform = 'translateY(6px)';
    setTimeout(() => {
      quoteEl.innerHTML = `<span class="qt-text">${escapeHtml(quotes[index].quote_text)}</span><span class="qt-author">${escapeHtml(character.name)}</span>`;
      quoteEl.style.opacity = 1;
      quoteEl.style.transform = 'translateY(0)';
    }, 200);
  };

  showQuote();

  if (quotes.length > 1) {
    quoteRotationTimer = setInterval(() => {
      index = (index + 1) % quotes.length;
      showQuote();
    }, 8000);
  }
}

function wireSearchAndPager() {
  const input = document.getElementById('companion-search');
  let searchTimer = null;

  // A new search always starts again from page 1.
  const runSearch = () => {
    clearTimeout(searchTimer);
    const value = input.value.trim();
    if (value === currentSearch) return;
    currentSearch = value;
    loadCompanionPage(1);
  };

  // Wait until typing pauses instead of sending a request on every keystroke.
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DELAY_MS);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  document.getElementById('companion-prev').addEventListener('click', () => loadCompanionPage(currentPage - 1));
  document.getElementById('companion-next').addEventListener('click', () => loadCompanionPage(currentPage + 1));
}

document.addEventListener('DOMContentLoaded', async () => {

  renderSidebar('character');

  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();
  refreshIcons();
  wireSearchAndPager();

  try {
    currentSettings = await api.get('/settings');
    await loadCompanionPage(1);
    await loadHero(currentSettings.character_id);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
});

window.addEventListener('beforeunload', () => {
  if (quoteRotationTimer) clearInterval(quoteRotationTimer);
});
