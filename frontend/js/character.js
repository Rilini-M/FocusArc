let characters = [];
let currentSettings = null;
let quoteRotationTimer = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCompanionGrid(selectedId) {
  const grid = document.getElementById('companion-grid');
  grid.innerHTML = characters
    .map(
      (c) => `
      <button class="companion-option${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}">
        <img class="companion-option-image" src="${c.image_path}" alt="${escapeHtml(c.name)}" />
        <span class="companion-option-name">${escapeHtml(c.name)}</span>
      </button>`
    )
    .join('');

  grid.querySelectorAll('.companion-option').forEach((btn) => {
    btn.addEventListener('click', () => selectCharacter(Number(btn.dataset.characterId)));
  });
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
  const nameTag = document.getElementById('hero-name-tag');
  const quoteEl = document.getElementById('hero-quote');

  heroImage.src = character.image_path;
  heroImage.alt = character.name;
  heroImage.hidden = false;

  document.getElementById('hero-name').textContent = character.name;
  document.getElementById('hero-description').textContent = character.description || '';
  nameTag.hidden = false;

  const quotes = await api.get(`/characters/${characterId}/quotes`);

  if (quotes.length === 0) {
    quoteEl.innerHTML = escapeHtml(character.description || 'Stay focused.');
    return;
  }

  let index = 0;
  const renderQuote = () => {
    quoteEl.style.opacity = 0;
    setTimeout(() => {
      quoteEl.innerHTML = `${escapeHtml(quotes[index].quote_text)}<span class="companion-hero-quote-author">— ${escapeHtml(character.name)}</span>`;
      quoteEl.style.opacity = 1;
    }, 200);
    index = (index + 1) % quotes.length;
  };

  renderQuote();

  if (currentSettings.auto_quote && quotes.length > 1) {
    quoteRotationTimer = setInterval(renderQuote, currentSettings.quote_interval || 8000);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();
  renderSidebar('character');

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
