let characters = [];
let currentSettings = null;
let quoteRotationTimer = null;

function characterTrait(character) {
  const firstWord = (character.description || '').trim().split(/\s+/)[0] || '';
  return firstWord.replace(/[.,]+$/, '');
}

function renderCompanionGrid(selectedId) {
  const grid = document.getElementById('companion-grid');
  grid.innerHTML = characters
    .map(
      (c) => `
      <button class="c-opt${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}">
        <span class="co-wrap">
          <img class="co-img" src="${c.image_path}" alt="${escapeHtml(c.name)}" />
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

document.addEventListener('DOMContentLoaded', async () => {

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
