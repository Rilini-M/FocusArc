/*
  Shared theme application. Character selection and theme selection are independent —
  this module only ever touches the `data-theme` attribute, never character state.
*/

const FOCUSARC_THEMES = ['default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk'];

function applyTheme(theme) {
  const safeTheme = FOCUSARC_THEMES.includes(theme) ? theme : 'default';
  document.documentElement.setAttribute('data-theme', safeTheme);
  if (window.FocusArcParticles) window.FocusArcParticles.setTheme(safeTheme);
}

// Applied immediately from settings so authenticated pages never flash the default theme.
async function loadAndApplyTheme() {
  try {
    const settings = await api.get('/settings');
    applyTheme(settings.theme);
    return settings;
  } catch (err) {
    applyTheme('default');
    return null;
  }
}
