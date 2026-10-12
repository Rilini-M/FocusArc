function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Settings shows the study themes and characters a page at a time (the Character Guide page has
// its own, separate list). The full lists are loaded once and sliced in the browser.
const THEMES_PER_PAGE = 5;
const CHARACTERS_PER_PAGE = 10;

// Page numbers for the pager: all of them when there are few, otherwise the first, the last and
// the current page with its neighbours, with "…" for the gaps.
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = [1, current - 1, current, current + 1, total].filter((p, i, all) => p >= 1 && p <= total && all.indexOf(p) === i);
  shown.sort((x, y) => x - y);
  const list = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) list.push('…');
    list.push(p);
  });
  return list;
}

// One paginated list: renders the current page of `items` with `renderItem` into `container`,
// and Previous / page numbers / Next into `pager`. The pager's click handler is attached once
// here, so re-rendering never adds listeners.
function createPagedList({ container, pager, perPage, label, renderItem }) {
  let items = [];
  let page = 1;
  const pageCount = () => Math.max(1, Math.ceil(items.length / perPage));

  function render() {
    const start = (page - 1) * perPage;
    container.innerHTML = items.slice(start, start + perPage).map(renderItem).join('');

    const total = pageCount();
    pager.hidden = total <= 1;
    if (total <= 1) {
      pager.innerHTML = '';
      return;
    }
    const numbers = pageList(page, total)
      .map((p) =>
        p === '…'
          ? '<span class="pg-gap" aria-hidden="true">…</span>'
          : `<button type="button" class="pg-btn${p === page ? ' active' : ''}" data-page="${p}"
              aria-label="${label} page ${p}"${p === page ? ' aria-current="page"' : ''}>${p}</button>`
      )
      .join('');
    pager.innerHTML = `
      <button type="button" class="pg-btn pg-step" data-page="${page - 1}" aria-label="Previous ${label} page"${page === 1 ? ' disabled' : ''}>‹<span class="pg-word"> Previous</span></button>
      ${numbers}
      <button type="button" class="pg-btn pg-step" data-page="${page + 1}" aria-label="Next ${label} page"${page === total ? ' disabled' : ''}><span class="pg-word">Next </span>›</button>`;
  }

  pager.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    page = Math.min(Math.max(1, Number(button.dataset.page)), pageCount());
    render();
  });

  return {
    // New items; opens the page holding item `index` (the current selection), if any.
    show(newItems, index) {
      items = newItems;
      page = index >= 0 ? Math.floor(index / perPage) + 1 : 1;
      render();
    },
    // Re-draws the current page, e.g. after the selection changed.
    render,
  };
}

let selectedCharacterId = null;
let characterList = null;

function characterOptionHTML(c) {
  const selected = c.id === selectedCharacterId;
  return `
    <button type="button" class="avatar-opt${selected ? ' selected' : ''}" data-character-id="${c.id}"
      title="${escapeHtml(c.name)}" aria-pressed="${selected}">
      <span class="avatar${selected ? ' selected' : ''}"><img src="${c.image_path}" alt="" loading="lazy" /></span>
      <span class="avatar-name">${escapeHtml(c.name)}</span>
    </button>`;
}

function renderCharacterOptions(characters, selectedId) {
  const container = document.getElementById('character-options');
  selectedCharacterId = selectedId;
  characterList = createPagedList({
    container,
    pager: document.getElementById('character-pager'),
    perPage: CHARACTERS_PER_PAGE,
    label: 'Character',
    renderItem: characterOptionHTML,
  });
  characterList.show(characters, characters.findIndex((c) => c.id === selectedId));

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('.avatar-opt');
    if (!button) return;
    const characterId = Number(button.dataset.characterId);
    try {
      await api.patch('/settings/character', { characterId });
      selectedCharacterId = characterId;
      characterList.render();
      showToast('Study companion updated.');
    } catch (err) {
      showToast(err.message, { isError: true });
    }
  });
}

// Study themes come from FOCUSARC_THEMES in theme.js; each card previews its own theme.
let selectedTheme = 'default';
let themeList = null;

function themeOptionHTML(t) {
  const selected = t.key === selectedTheme;
  return themeCardHTML(t, selected, `role="radio" aria-checked="${selected}"`);
}

function renderThemeOptions(currentTheme) {
  const container = document.getElementById('theme-options');
  selectedTheme = currentTheme;
  themeList = createPagedList({
    container,
    pager: document.getElementById('theme-pager'),
    perPage: THEMES_PER_PAGE,
    label: 'Theme',
    renderItem: themeOptionHTML,
  });
  themeList.show(FOCUSARC_THEMES, FOCUSARC_THEMES.findIndex((t) => t.key === currentTheme));

  container.addEventListener('click', async (event) => {
    const chip = event.target.closest('.th-chip');
    if (!chip) return;
    const theme = chip.dataset.theme;
    try {
      await api.patch('/settings/theme', { theme });
      applyTheme(theme);
      selectedTheme = theme;
      themeList.render();
      showToast('Study theme updated.');
    } catch (err) {
      showToast(err.message, { isError: true });
    }
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
