/*
  Shared theme application. Three independent choices, each saved in user settings:
  - appearance mode (Light / Dark)     -> <html data-mode="...">
  - study theme (21 themes)            -> <html data-theme="...">
  - character                          -> not handled here at all
  Each theme's look (colors, atmosphere, pattern, card style) lives in css/themes.css. This file is the list of themes shown in the
  UI (keep the keys in sync with THEMES in backend/middleware/validate.js).
*/

const FOCUSARC_THEMES = [
  { key: 'default', label: 'FocusArc' },
  { key: 'nature', label: 'Nature' },
  { key: 'cyberpunk', label: 'Cyberpunk' },
  { key: 'royal', label: 'Royal' },
  { key: 'vampire', label: 'Vampire' },
  { key: 'sakura', label: 'Sakura' },
  { key: 'cosmic', label: 'Cosmic' },
  { key: 'ocean', label: 'Ocean' },
  { key: 'frost', label: 'Frost' },
  { key: 'ember', label: 'Ember' },
  { key: 'moonlight', label: 'Moonlight' },
  { key: 'academia', label: 'Academia' },
  { key: 'japanese-night', label: 'Japanese Night' },
  { key: 'sunset', label: 'Sunset' },
  { key: 'forest', label: 'Forest' },
  { key: 'lavender', label: 'Lavender' },
  { key: 'crimson', label: 'Crimson' },
  { key: 'neon', label: 'Neon' },
  { key: 'celestial', label: 'Celestial' },
  { key: 'mist', label: 'Mist' },
  { key: 'twilight', label: 'Twilight' },
];

const FOCUSARC_MODES = ['dark', 'light'];

// One theme card for the theme galleries (Settings page and the post-login theme screen).
// data-theme on the card makes everything inside it — colors, atmosphere, pattern, symbol,
// heading font — that theme's own, so the card previews the theme before it is picked.
// `extraAttrs` carries the caller's ARIA state (role="radio" aria-checked / aria-pressed).
function themeCardHTML(theme, selected, extraAttrs) {
  return `
    <button type="button" class="th-chip${selected ? ' selected' : ''}" data-theme="${theme.key}" ${extraAttrs}>
      <span class="th-prev" aria-hidden="true">
        <span class="th-sym"></span>
        <span class="th-ui"><i></i><i></i></span>
      </span>
      <span class="th-name">${theme.label}</span>
    </button>`;
}

function applyTheme(theme) {
  const safeTheme = FOCUSARC_THEMES.some((t) => t.key === theme) ? theme : 'default';
  document.documentElement.setAttribute('data-theme', safeTheme);
  if (window.FocusArcParticles) window.FocusArcParticles.setTheme(safeTheme);
  try {
    // Fast cache for js/theme-init.js, so the next page's very first paint already has it.
    localStorage.setItem('focusarc_theme', safeTheme);
  } catch (err) {
    // localStorage unavailable — next page just falls back to the default first paint.
  }
}

function applyAppearance(mode) {
  const safeMode = FOCUSARC_MODES.includes(mode) ? mode : 'dark';
  document.documentElement.setAttribute('data-mode', safeMode);
  rememberAppearance(safeMode);
}

// Saves the mode for the next page's first paint without changing the current page
// (used on the Login page, which always stays dark).
function rememberAppearance(mode) {
  try {
    localStorage.setItem('focusarc_mode', FOCUSARC_MODES.includes(mode) ? mode : 'dark');
  } catch (err) {
    // localStorage unavailable — next page just falls back to Dark for its first paint.
  }
}

// Applied from the saved settings on every authenticated page. The server is the source of
// truth; theme-init.js only shows the cached copy until this confirms it.
async function loadAndApplyTheme() {
  try {
    const settings = await api.get('/settings');
    applyAppearance(settings.appearance);
    applyTheme(settings.theme);
    return settings;
  } catch (err) {
    applyAppearance('dark');
    applyTheme('default');
    return null;
  }
}
