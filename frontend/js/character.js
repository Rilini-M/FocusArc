let characters = [];
let currentSettings = null;
let quoteRotationTimer = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// A short "trait" caption under each name, e.g. "Determined" — taken from the first word
// of the character's own description rather than a separate field, so it's always real
// data and never drifts from what's actually stored.
function characterTrait(character) {
  const firstWord = (character.description || '').trim().split(/\s+/)[0] || '';
  return firstWord.replace(/[.,]+$/, '');
}

function renderCompanionGrid(selectedId) {
  const grid = document.getElementById('companion-grid');
  grid.innerHTML = characters
    .map(
      (c) => `
      <button class="companion-option${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}">
        <span class="companion-option-image-wrap">
          <img class="companion-option-image" src="${c.image_path}" alt="${escapeHtml(c.name)}" />
          ${c.id === selectedId ? `<span class="companion-option-check">${icon('check', 12)}</span>` : ''}
        </span>
        <span class="companion-option-name">${escapeHtml(c.name)}</span>
        <span class="companion-option-trait">${escapeHtml(characterTrait(c))}</span>
      </button>`
    )
    .join('');

  grid.querySelectorAll('.companion-option').forEach((btn) => {
    btn.addEventListener('click', () => selectCharacter(Number(btn.dataset.characterId)));
  });

  refreshIcons();
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

  const character = characters.find((c) => c.id === characterId);
  if (!character) return;

  const heroImage = document.getElementById('hero-image');
  const identity = document.getElementById('hero-identity');
  const quoteEl = document.getElementById('hero-quote');

  heroImage.src = character.image_path;
  heroImage.alt = character.name;
  heroImage.hidden = false;

  document.getElementById('hero-name').textContent = character.name;
  document.getElementById('hero-description').textContent = character.description || '';
  identity.hidden = false;

  const quotes = await api.get(`/characters/${characterId}/quotes`);

  if (quotes.length === 0) {
    quoteEl.innerHTML = `<span class="companion-hero-quote-text">${escapeHtml(character.description || 'Stay focused.')}</span><span class="companion-hero-quote-author">${escapeHtml(character.name)}</span>`;
    return;
  }

  let index = 0;
  const showQuote = () => {
    quoteEl.style.opacity = 0;
    quoteEl.style.transform = 'translateY(6px)';
    setTimeout(() => {
      quoteEl.innerHTML = `<span class="companion-hero-quote-text">${escapeHtml(quotes[index].quote_text)}</span><span class="companion-hero-quote-author">${escapeHtml(character.name)}</span>`;
      quoteEl.style.opacity = 1;
      quoteEl.style.transform = 'translateY(0)';
    }, 200);
  };

  showQuote();

  if (currentSettings.auto_quote && quotes.length > 1) {
    quoteRotationTimer = setInterval(() => {
      index = (index + 1) % quotes.length;
      showQuote();
    }, currentSettings.quote_interval || 10000);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Rendered first and synchronously — see questboard.js for why this can't wait behind
  // the auth/settings network calls without causing a visible theme/chrome flash.
  renderSidebar('character');

  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();

  try {
    currentSettings = await api.get('/settings');
    characters = await api.get('/characters');
    renderCompanionGrid(currentSettings.character_id);
    await loadHero(currentSettings.character_id);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
});

window.addEventListener('beforeunload', () => {
  if (quoteRotationTimer) clearInterval(quoteRotationTimer);
});
