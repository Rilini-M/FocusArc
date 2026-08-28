/*
  First-run "Choose Your Theme" overlay. Shown once per browser after a user's first
  landing on Quest Board (tracked via localStorage — no backend/schema change). Uses the
  app's own theme background photos as each card's preview art. Themes here exclude
  "default" since that's already the active starting theme before a choice is made.
*/

const THEME_SELECT_SEEN_KEY = 'focusarc_theme_intro_seen';

const THEME_SELECT_CARDS = [
  { key: 'nature', label: 'Nature', bg: '/assets/backgrounds/nature-bg.png', rgb: '74, 222, 128' },
  { key: 'dark', label: 'Dark', bg: '/assets/backgrounds/dark-bg.png', rgb: '209, 213, 219' },
  { key: 'royal', label: 'Royal', bg: '/assets/backgrounds/royal-bg.png', rgb: '244, 201, 93' },
  { key: 'vampire', label: 'Vampire', bg: '/assets/backgrounds/vampire-bg.jpg', rgb: '225, 29, 72' },
  { key: 'cyberpunk', label: 'Cyberpunk', bg: '/assets/backgrounds/cyberpunk-bg.jpg', rgb: '255, 46, 159' },
];

function hasSeenThemeIntro() {
  try {
    return localStorage.getItem(THEME_SELECT_SEEN_KEY) === '1';
  } catch (err) {
    return true; // storage unavailable — don't force the overlay every load
  }
}

function markThemeIntroSeen() {
  try {
    localStorage.setItem(THEME_SELECT_SEEN_KEY, '1');
  } catch (err) {
    // ignore — private browsing / storage disabled
  }
}

function initThemeSelect() {
  if (hasSeenThemeIntro()) return;

  const root = document.createElement('div');
  root.className = 'theme-select-backdrop';
  root.id = 'theme-select-backdrop';

  root.innerHTML = `
    <div class="theme-select-panel">
      <button class="theme-select-close" id="theme-select-close" aria-label="Close">${icon('x', 18)}</button>
      <h2 class="theme-select-title"><span class="spark">✧</span> Choose Your Theme <span class="spark">✧</span></h2>
      <p class="theme-select-subtitle">Every arc has a world. Choose the one that fits your journey.</p>
      <div class="theme-select-grid">
        ${THEME_SELECT_CARDS.map(
          (t) => `
          <div class="theme-select-card" data-theme-key="${t.key}" style="background-image:url('${t.bg}'); --card-border: rgba(${t.rgb}, 0.55); --card-glow: rgba(${t.rgb}, 0.55);">
            <span class="theme-select-card-label">${t.label}</span>
            <button type="button" class="theme-select-card-btn" data-theme-choose="${t.key}">Choose</button>
          </div>`
        ).join('')}
      </div>
      <p class="theme-select-note">✧ You can always change your theme later in Settings.</p>
    </div>
  `;

  document.body.appendChild(root);
  refreshIcons();

  const close = () => {
    root.classList.remove('open');
    markThemeIntroSeen();
    setTimeout(() => root.remove(), 200);
  };

  document.getElementById('theme-select-close').addEventListener('click', close);
  root.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  root.querySelectorAll('[data-theme-choose]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.themeChoose;
      try {
        await api.patch('/settings/theme', { theme });
        applyTheme(theme);
        document.querySelectorAll('.theme-swatch').forEach((s) => {
          s.classList.toggle('selected', s.dataset.themeOption === theme);
        });
      } catch (err) {
        showToast(err.message, { isError: true });
        return;
      }
      close();
    });
  });

  requestAnimationFrame(() => root.classList.add('open'));
}
