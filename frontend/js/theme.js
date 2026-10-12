/*
  Shared theme application. Three independent choices, each saved in user settings:
  - appearance mode (Light / Dark)     -> <html data-mode="...">
  - study theme                        -> <html data-theme="...">
  - character                          -> not handled here at all

  The list of study themes and their colors come from the database (GET /api/themes), not from
  this file: a theme added in the database shows up in the theme pickers with no frontend change.
  Each theme's colors are turned into a small CSS rule ([data-theme='key'] { --theme-accent: ...})
  that css/themes.css's shared recipe turns into every UI color. themes.css may also give a theme
  extra decoration (atmosphere, pattern, card style) by its key; a theme without any still works,
  with the FocusArc look in its own colors.

  The last loaded list is cached in localStorage so js/theme-init.js can paint the right theme
  before the API answers.
*/

const FOCUSARC_MODES = ['dark', 'light'];
const THEME_KEY_RE = /^[a-z0-9-]{1,40}$/;
const THEME_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// The active study themes, in display order: [{ key, label, accent, accent2, ... }].
let FOCUSARC_THEMES = [];

function findTheme(key) {
  return FOCUSARC_THEMES.find((t) => t.key === key) || null;
}

// One CSS rule per theme with its raw values. Only well-formed values get in, so nothing from
// the API can break out of the rule.
function themeCatalogCSS(themes) {
  const vars = { accent: '--theme-accent', accent2: '--theme-accent-2', accent3: '--theme-accent-3', background: '--theme-deep' };
  return themes
    .map((t) => {
      const decls = Object.entries(vars)
        .filter(([field]) => THEME_COLOR_RE.test(t[field] || ''))
        .map(([field, name]) => `${name}: ${t[field]};`);
      const symbol = typeof t.symbol === 'string' ? t.symbol.replace(/['"\\<>\n\r]/g, '') : '';
      if (symbol) decls.push(`--theme-symbol: '${symbol}';`);
      return `[data-theme='${t.key}'] { ${decls.join(' ')} }`;
    })
    .join('\n');
}

function installThemeCSS(css) {
  let style = document.getElementById('focusarc-theme-catalog');
  if (!style) {
    style = document.createElement('style');
    style.id = 'focusarc-theme-catalog';
    document.head.appendChild(style);
  }
  style.textContent = css;
}

// Makes `themes` the current list and applies their colors. `persist` also caches them for the
// next page's first paint (js/theme-init.js).
function setThemeCatalog(themes, persist) {
  const valid = (Array.isArray(themes) ? themes : []).filter(
    (t) => t && THEME_KEY_RE.test(t.key) && typeof t.label === 'string'
  );
  FOCUSARC_THEMES = valid;
  window.FOCUSARC_THEME_CATALOG = valid; // read by js/particles.js
  const css = themeCatalogCSS(valid);
  installThemeCSS(css);
  if (!persist) return;
  try {
    localStorage.setItem('focusarc_theme_catalog', JSON.stringify(valid));
    localStorage.setItem('focusarc_theme_css', css);
  } catch (err) {
    // localStorage unavailable — the next page just waits for the API for theme colors.
  }
}

// Start from the cached list (if any) until the API answers.
(function useCachedThemeCatalog() {
  try {
    const cached = JSON.parse(localStorage.getItem('focusarc_theme_catalog') || '[]');
    if (cached.length) setThemeCatalog(cached, false);
  } catch (err) {
    // No usable cache — the list arrives with loadThemeCatalog().
  }
})();

// Loads the study themes from the server. On failure the cached list (if any) stays in use.
async function loadThemeCatalog() {
  try {
    setThemeCatalog(await api.get('/themes'), true);
  } catch (err) {
    // Keep whatever list we already have.
  }
  return FOCUSARC_THEMES;
}

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
      <span class="th-name">${escapeHtml(theme.label)}</span>
    </button>`;
}

function applyTheme(theme) {
  // Unknown or hidden themes fall back to FocusArc. With no list at all (API down, nothing
  // cached) any well-formed key is kept, so a saved theme isn't lost.
  const known = FOCUSARC_THEMES.length === 0 ? THEME_KEY_RE.test(theme || '') : Boolean(findTheme(theme));
  const safeTheme = known ? theme : 'default';
  document.documentElement.setAttribute('data-theme', safeTheme);
  if (window.FocusArcParticles) window.FocusArcParticles.setTheme(safeTheme, findTheme(safeTheme));
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
    const [settings] = await Promise.all([api.get('/settings'), loadThemeCatalog()]);
    applyAppearance(settings.appearance);
    applyTheme(settings.theme);
    return settings;
  } catch (err) {
    applyAppearance('dark');
    applyTheme('default');
    return null;
  }
}
