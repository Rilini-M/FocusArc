/*
  Post-login "Choose Your Theme" screen. Shown on the Login/Signup page right after the
  account call succeeds, before navigating to Quest Board. Picking a theme applies it,
  sets the theme's paired character, saves both to /settings, and then continues.

  Each card sets data-theme on itself, so its background comes straight from that theme's
  --theme-bg-image in themes.css — the one place background paths live. No image paths are
  duplicated here.
*/

const THEME_SELECT_CARDS = [
  { key: 'nature', label: 'Nature', emoji: '🌿', character: 'Tanjiro', fallbackImage: '/assets/characters/tanjiro.jpg' },
  { key: 'dark', label: 'Dark', emoji: '🌑', character: 'L', fallbackImage: '/assets/characters/l.jpg' },
  { key: 'cyberpunk', label: 'Cyberpunk', emoji: '⚡', character: 'Sung Jin-Woo', fallbackImage: '/assets/characters/sung.jpg' },
  { key: 'royal', label: 'Royal', emoji: '👑', character: 'Gilgamesh', fallbackImage: '/assets/characters/gilgamesh.jpg' },
  { key: 'vampire', label: 'Vampire', emoji: '🩸', character: 'Alucard', fallbackImage: '/assets/characters/alucard.jpg' },
];

// Resolves the theme's background URL from themes.css and waits (briefly) for it to load,
// so the next page paints with the image already in the browser cache — no flash.
function preloadThemeBackground(theme) {
  const probe = document.createElement('div');
  probe.setAttribute('data-theme', theme);
  probe.hidden = true;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue('--theme-bg-image');
  probe.remove();

  const match = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(value);
  if (!match) return Promise.resolve();

  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    setTimeout(done, 2500);
    img.src = match[1];
  });
}

// Opens the selection screen and resolves once the user has chosen (or skipped) and the
// choice is saved. Callers navigate onward after it resolves.
async function openThemeSelect() {
  let characters = [];
  let currentTheme = null;
  try {
    const [characterList, settings] = await Promise.all([api.get('/characters'), api.get('/settings')]);
    characters = characterList;
    currentTheme = settings.theme;
  } catch (err) {
    // Cards still render with the bundled character images; saving will surface any error.
  }

  const cards = THEME_SELECT_CARDS.map((t) => {
    const character = characters.find((c) => c.name === t.character);
    return {
      ...t,
      characterId: character ? character.id : null,
      image: character ? character.image_path : t.fallbackImage,
    };
  });

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'ts-bg';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'theme-select-title');

    root.innerHTML = `
      <div class="ts-panel">
        <h2 class="ts-title" id="theme-select-title"><span class="spark">✧</span> Choose Your Theme <span class="spark">✧</span></h2>
        <p class="ts-sub">Every arc has a world. Choose the one that fits your journey.</p>
        <div class="ts-grid">
          ${cards
            .map(
              (t) => `
            <button type="button" class="ts-card${t.key === currentTheme ? ' is-selected' : ''}"
              data-theme="${t.key}" data-theme-choose="${t.key}" aria-pressed="${t.key === currentTheme}">
              <span class="ts-check" aria-hidden="true">${icon('check', 14)}</span>
              <span class="ts-char">
                <img src="${t.image}" alt="" />
              </span>
              <span class="tc-label"><span aria-hidden="true">${t.emoji}</span> ${t.label}</span>
              <span class="tc-char">${t.character}</span>
            </button>`
            )
            .join('')}
        </div>
        <button type="button" class="ts-skip" id="theme-select-skip">Keep my current theme</button>
      </div>
    `;

    document.body.appendChild(root);
    refreshIcons();
    requestAnimationFrame(() => root.classList.add('open'));

    let busy = false;
    const finish = () => {
      root.classList.remove('open');
      setTimeout(() => {
        root.remove();
        resolve();
      }, 200);
    };

    root.querySelectorAll('[data-theme-choose]').forEach((card) => {
      card.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        const choice = cards.find((t) => t.key === card.dataset.themeChoose);

        root.querySelectorAll('[data-theme-choose]').forEach((c) => {
          const selected = c === card;
          c.classList.toggle('is-selected', selected);
          c.setAttribute('aria-pressed', String(selected));
        });
        applyTheme(choice.key);

        try {
          await Promise.all([
            api.patch('/settings/theme', { theme: choice.key }),
            choice.characterId ? api.patch('/settings/character', { characterId: choice.characterId }) : null,
          ]);
        } catch (err) {
          showToast(err.message, { isError: true });
          busy = false;
          return;
        }

        await preloadThemeBackground(choice.key);
        finish();
      });
    });

    document.getElementById('theme-select-skip').addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      // Re-apply the saved theme so the next page's first paint (theme-init.js) matches it.
      if (currentTheme) {
        applyTheme(currentTheme);
        await preloadThemeBackground(currentTheme);
      }
      finish();
    });
  });
}
