/*
  Shared theme application. Three independent choices, each saved in user settings:
  - appearance mode (Light / Dark)     -> <html data-mode="...">
  - study theme (21 color themes)      -> <html data-theme="...">
  - character                          -> not handled here at all
  Colors for each theme live in css/themes.css. This file is the list of themes shown in the
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
