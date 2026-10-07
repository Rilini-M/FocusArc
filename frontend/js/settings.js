function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function renderCharacterOptions(characters, selectedId) {
  const container = document.getElementById('character-options');
  container.innerHTML = characters
    .map(
      (c) => `
      <button class="avatar${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}" title="${escapeHtml(c.name)}">
        <img src="${c.image_path}" alt="${escapeHtml(c.name)}" />
      </button>`
    )
    .join('');

  container.querySelectorAll('.avatar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const characterId = Number(btn.dataset.characterId);
      try {
        await api.patch('/settings/character', { characterId });
        container.querySelectorAll('.avatar').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        showToast('Study companion updated.');
      } catch (err) {
        showToast(err.message, { isError: true });
      }
    });
  });
}

// Study themes come from FOCUSARC_THEMES in theme.js; each card previews its own theme.
function renderThemeOptions(selectedTheme) {
  const container = document.getElementById('theme-options');
  container.innerHTML = FOCUSARC_THEMES.map((t) =>
    themeCardHTML(t, t.key === selectedTheme, `role="radio" aria-checked="${t.key === selectedTheme}"`)
  ).join('');

  container.querySelectorAll('.th-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      const theme = chip.dataset.theme;
      try {
        await api.patch('/settings/theme', { theme });
        applyTheme(theme);
        container.querySelectorAll('.th-chip').forEach((c) => {
          c.classList.toggle('selected', c === chip);
          c.setAttribute('aria-checked', String(c === chip));
        });
        showToast('Study theme updated.');
      } catch (err) {
        showToast(err.message, { isError: true });
      }
    });
  });
}

function renderAppearanceOptions(selectedMode) {
  const options = document.querySelectorAll('[data-mode-option]');
  const mark = (mode) =>
    options.forEach((o) => {
      o.classList.toggle('selected', o.dataset.modeOption === mode);
      o.setAttribute('aria-checked', String(o.dataset.modeOption === mode));
    });
  mark(selectedMode);

  options.forEach((option) => {
    option.addEventListener('click', async () => {
      const appearance = option.dataset.modeOption;
      try {
        await api.patch('/settings/appearance', { appearance });
        applyAppearance(appearance);
        mark(appearance);
        showToast(appearance === 'light' ? 'Light mode on.' : 'Dark mode on.');
      } catch (err) {
        showToast(err.message, { isError: true });
      }
    });
  });
}

async function loadProfileIntoForm() {
  const profile = await api.get('/profile');
  const form = document.getElementById('profile-form');
  form.elements.username.value = profile.username;
  form.elements.email.value = profile.email;
  form.elements.dateOfBirth.value = profile.date_of_birth;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Rendered first and synchronously — see questboard.js for why this can't wait behind
  // the auth/settings network calls without causing a visible theme/chrome flash.
  renderSidebar('settings');

  const user = await requireAuth();
  if (!user) return;

  const settings = await loadAndApplyTheme();
  renderAppearanceOptions(settings ? settings.appearance : 'dark');
  renderThemeOptions(settings ? settings.theme : 'default');

  try {
    const characters = await api.get('/characters');
    renderCharacterOptions(characters, settings ? settings.character_id : null);
  } catch (err) {
    showToast(err.message, { isError: true });
  }

  document.getElementById('settings-logout-btn').addEventListener('click', logout);

  document.getElementById('open-update-profile').addEventListener('click', async () => {
    try {
      await loadProfileIntoForm();
      openModal('profile-modal-backdrop');
    } catch (err) {
      showToast(err.message, { isError: true });
    }
  });
  document.getElementById('open-change-password').addEventListener('click', () => {
    document.getElementById('password-form').reset();
    openModal('password-modal-backdrop');
  });
  document.getElementById('open-delete-account').addEventListener('click', () => {
    openModal('delete-modal-backdrop');
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.st-bg').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.classList.remove('open');
    });
  });

  document.getElementById('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const problem =
      usernameError(form.elements.username.value) ||
      emailError(form.elements.email.value) ||
      dateOfBirthError(form.elements.dateOfBirth.value);
    if (problem) {
      showToast(problem, { isError: true });
      return;
    }
    try {
      await api.put('/profile', {
        username: form.elements.username.value.trim(),
        email: form.elements.email.value.trim(),
        dateOfBirth: form.elements.dateOfBirth.value,
      });
      showToast('Profile updated.');
      closeModal('profile-modal-backdrop');
    } catch (err) {
      showToast(err.message, { isError: true });
    }
  });

  document.getElementById('password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api.put('/profile/password', {
        currentPassword: form.elements.currentPassword.value,
        newPassword: form.elements.newPassword.value,
      });
      showToast('Password updated.');
      closeModal('password-modal-backdrop');
    } catch (err) {
      showToast(err.message, { isError: true });
    }
  });

  document.getElementById('confirm-delete-account').addEventListener('click', async () => {
    try {
      await api.delete('/profile');
      window.location.href = 'login.html';
    } catch (err) {
      showToast(err.message, { isError: true });
    }
  });
});
