/*
  Post-login "Choose Your Study Theme" screen. Shown on the Login/Signup page right after the
  account call succeeds, before navigating to Quest Board. Picking a theme applies and saves
  only the study theme — the character and Light/Dark mode are separate choices (Settings).
*/

// Opens the selection screen and resolves once the user has chosen (or skipped) and the
// choice is saved. Callers navigate onward after it resolves.
async function openThemeSelect() {
  let currentTheme = null;
  try {
    const settings = await api.get('/settings');
    currentTheme = settings.theme;
    rememberAppearance(settings.appearance);
  } catch (err) {
    // The screen still works; saving will surface any error.
  }

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'ts-bg';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'theme-select-title');

    root.innerHTML = `
      <div class="ts-panel">
        <h2 class="ts-title" id="theme-select-title"><span class="spark">✧</span> Choose Your Study Theme <span class="spark">✧</span></h2>
        <p class="ts-sub">Pick the colors for your study space. You can change it any time in Settings.</p>
        <div class="th-grid">
          ${FOCUSARC_THEMES.map(
            (t) => `
            <button type="button" class="th-chip${t.key === currentTheme ? ' selected' : ''}"
              data-theme="${t.key}" aria-pressed="${t.key === currentTheme}">
              <span class="th-dot" aria-hidden="true"></span>${t.label}
            </button>`
          ).join('')}
        </div>
        <button type="button" class="ts-skip" id="theme-select-skip">Keep my current theme</button>
      </div>
    `;

    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('open'));

    let busy = false;
    const finish = () => {
      root.classList.remove('open');
      setTimeout(() => {
        root.remove();
        resolve();
      }, 200);
    };

    root.querySelectorAll('.th-chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        const theme = chip.dataset.theme;

        root.querySelectorAll('.th-chip').forEach((c) => {
          c.classList.toggle('selected', c === chip);
          c.setAttribute('aria-pressed', String(c === chip));
        });
        applyTheme(theme);

        try {
          await api.patch('/settings/theme', { theme });
        } catch (err) {
          showToast(err.message, { isError: true });
          busy = false;
          return;
        }
        finish();
      });
    });

    document.getElementById('theme-select-skip').addEventListener('click', () => {
      if (busy) return;
      busy = true;
      // Re-apply the saved theme so the next page's first paint (theme-init.js) matches it.
      if (currentTheme) applyTheme(currentTheme);
      finish();
    });
  });
}
