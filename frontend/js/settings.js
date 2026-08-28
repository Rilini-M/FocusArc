function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

async function renderCharacterOptions(characters, selectedId) {
  const container = document.getElementById('character-options');
  container.innerHTML = characters
    .map(
      (c) => `
      <button class="avatar-option${c.id === selectedId ? ' selected' : ''}" data-character-id="${c.id}" title="${escapeHtml(c.name)}">
        <img src="${c.image_path}" alt="${escapeHtml(c.name)}" />
      </button>`
    )
    .join('');

  container.querySelectorAll('.avatar-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const characterId = Number(btn.dataset.characterId);
      try {
        await api.patch('/settings/character', { characterId });
        container.querySelectorAll('.avatar-option').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');

        const chosen = characters.find((c) => c.id === characterId);
        const heroImage = document.getElementById('settings-hero-image');
        if (chosen && heroImage) {
          heroImage.src = chosen.image_path;
          heroImage.alt = chosen.name;
          heroImage.hidden = false;
        }

        showToast('Study companion updated.');
      } catch (err) {
        showToast(err.message, { isError: true });
      }
    });
  });
}

function renderThemeOptions(selectedTheme) {
  const swatches = document.querySelectorAll('.theme-swatch');
  swatches.forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.themeOption === selectedTheme);
    swatch.addEventListener('click', async () => {
      const theme = swatch.dataset.themeOption;
      try {
        await api.patch('/settings/theme', { theme });
        applyTheme(theme);
        swatches.forEach((s) => s.classList.remove('selected'));
        swatch.classList.add('selected');
        showToast('Theme updated.');
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
  refreshIcons();

  const user = await requireAuth();
  if (!user) return;

  const settings = await loadAndApplyTheme();

  try {
    const characters = await api.get('/characters');
    renderCharacterOptions(characters, settings ? settings.character_id : null);
    renderThemeOptions(settings ? settings.theme : 'default');

    const activeCharacter = settings && characters.find((c) => c.id === settings.character_id);
    if (activeCharacter) {
      const heroImage = document.getElementById('settings-hero-image');
      heroImage.src = activeCharacter.image_path;
      heroImage.alt = activeCharacter.name;
      heroImage.hidden = false;
    }
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
  document.querySelectorAll('.settings-modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) backdrop.classList.remove('open');
    });
  });

  document.getElementById('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
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
