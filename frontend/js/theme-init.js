/*
  Early theme init — must load synchronously in <head>, before <body> paints. Reads the
  last-confirmed study theme, Light/Dark mode and theme colors from localStorage (written by
  theme.js) and applies them immediately, so the page never paints the default look first and
  then swaps. This is only a fast cache: the server (`/settings`, `/themes`) stays the source of
  truth, and theme.js's loadAndApplyTheme() confirms/corrects it.
*/
(function () {
  try {
    var theme = localStorage.getItem('focusarc_theme');
    // Unknown names simply fall back to the default colors in themes.css.
    if (theme && /^[a-z0-9-]{1,40}$/.test(theme)) {
      document.documentElement.setAttribute('data-theme', theme);
    }

    var mode = localStorage.getItem('focusarc_mode');
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-mode', mode);
    }

    // The study themes' colors as CSS (built by theme.js from GET /api/themes).
    var css = localStorage.getItem('focusarc_theme_css');
    if (css) {
      var style = document.createElement('style');
      style.id = 'focusarc-theme-catalog';
      style.textContent = css;
      document.head.appendChild(style);
    }
  } catch (err) {
    // localStorage unavailable (private browsing, etc.) — first paint uses Dark + default theme.
  }
})();
