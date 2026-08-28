/*
  Early theme init — must load synchronously in <head>, before <body> paints. Reads the
  last-confirmed theme from localStorage (written by applyTheme() in theme.js, the single
  place that ever sets data-theme) and applies it immediately, so the page never paints the
  default theme first and then swaps. This is a read-only fast cache, not a second theme
  system: the server (`/settings`) stays the source of truth, and theme.js's normal
  loadAndApplyTheme() still runs afterward to confirm/correct it.
*/
(function () {
  var THEMES = ['default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk'];
  try {
    var saved = localStorage.getItem('focusarc_theme');
    if (saved && THEMES.indexOf(saved) !== -1) {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (err) {
    // localStorage unavailable (private browsing, etc.) — first paint just falls back to
    // the default theme already on the <html> tag.
  }
})();
