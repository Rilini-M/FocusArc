/*
  Early theme init — must load synchronously in <head>, before <body> paints. Reads the
  last-confirmed study theme and Light/Dark mode from localStorage (written by applyTheme()
  and applyAppearance() in theme.js) and applies them immediately, so the page never paints
  the default look first and then swaps. This is only a fast cache: the server (`/settings`)
  stays the source of truth, and theme.js's loadAndApplyTheme() confirms/corrects it.
*/
(function () {
  try {
    var theme = localStorage.getItem('focusarc_theme');
    // Unknown names simply fall back to the default colors in themes.css.
    if (theme && /^[a-z-]{1,30}$/.test(theme)) {
      document.documentElement.setAttribute('data-theme', theme);
    }

    var mode = localStorage.getItem('focusarc_mode');
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-mode', mode);
    }
  } catch (err) {
    // localStorage unavailable (private browsing, etc.) — first paint uses Dark + default theme.
  }
})();
