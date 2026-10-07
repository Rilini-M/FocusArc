/*
  Admin Character Management. The page only talks to our own backend (/api/admin/characters...);
  the backend is the one that calls the Jikan API. Every route is ADMIN-only on the server.
*/

let currentPage = 1;
let currentSearch = '';
let apiCharacters = []; // the Jikan page currently shown

function characterImage(url, name) {
  return url
    ? `<img class="ad-thumb" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" />`
    : '<span class="ad-thumb ad-noimg">No image</span>';
}

// ---- Jikan results ----

function renderApiResults(result) {
  const container = document.getElementById('api-results');
  apiCharacters = result.characters;

  if (apiCharacters.length === 0) {
    container.innerHTML = '<p class="ad-note">No characters found. Try a different search or page.</p>';
  } else {
    container.innerHTML = `
      <table class="ad-table">
        <thead><tr><th>Character</th><th>Image</th><th>Action</th></tr></thead>
        <tbody>
          ${apiCharacters
            .map((c, index) => {
              let action = `<button class="btn btn-p ad-sm" data-import="${index}">Import</button>`;
              if (c.alreadyImported) action = '<span class="ad-tag">Imported</span>';
              else if (!c.imageUrl) action = '<span class="ad-tag">No image</span>';
              return `
                <tr>
                  <td>${escapeHtml(c.name)}</td>
                  <td>${characterImage(c.imageUrl, c.name)}</td>
                  <td>${action}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  }

  const { currentPage: page, lastPage, hasNextPage } = result.pagination;
  document.getElementById('api-pager').hidden = false;
  document.getElementById('page-label').textContent = `Page ${page} of ${lastPage}`;
  document.getElementById('prev-page').disabled = page <= 1;
  document.getElementById('next-page').disabled = !hasNextPage;
}

async function fetchCharacters(page) {
  const fetchBtn = document.getElementById('fetch-btn');
  const pagerButtons = document.querySelectorAll('#api-pager button');
  fetchBtn.disabled = true;
  pagerButtons.forEach((btn) => (btn.disabled = true));
  document.getElementById('api-results').innerHTML = '<p class="ad-note">Loading characters from Jikan…</p>';

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (currentSearch) params.set('search', currentSearch);

  try {
    const result = await api.get(`/admin/characters/api?${params}`);
    currentPage = page;
    renderApiResults(result);
  } catch (err) {
    document.getElementById('api-results').innerHTML = `<p class="ad-note ad-err">${escapeHtml(err.message)}</p>`;
    document.getElementById('api-pager').hidden = true;
  } finally {
    fetchBtn.disabled = false;
  }
}

async function importCharacter(index, button) {
  const c = apiCharacters[index];
  button.disabled = true;
  try {
    await api.post('/admin/characters/import', {
      externalApiId: c.externalApiId,
      name: c.name,
      imageUrl: c.imageUrl,
      description: c.description,
    });
    c.alreadyImported = true;
    button.outerHTML = '<span class="ad-tag">Imported</span>';
    showToast(`${c.name} imported.`);
    loadImported();
  } catch (err) {
    showToast(err.message, { isError: true });
    button.disabled = false;
  }
}

// ---- Imported characters ----

async function loadImported() {
  const container = document.getElementById('imported-list');
  let characters;
  try {
    characters = await api.get('/admin/characters');
  } catch (err) {
    container.innerHTML = `<p class="ad-note ad-err">${escapeHtml(err.message)}</p>`;
    return;
  }

  if (characters.length === 0) {
    container.innerHTML = '<p class="ad-note">No characters imported yet.</p>';
    return;
  }

  container.innerHTML = `
    <table class="ad-table">
      <thead><tr><th>Name</th><th>Image</th><th>Description</th><th>Edit</th><th>Delete</th></tr></thead>
      <tbody>
        ${characters
          .map(
            (c) => `
            <tr data-id="${c.id}">
              <td>${escapeHtml(c.name)}</td>
              <td>${characterImage(c.image_path, c.name)}</td>
              <td class="ad-desc">${escapeHtml(c.description || '')}</td>
              <td><button class="btn btn-s ad-sm" data-edit>Edit</button></td>
              <td><button class="btn btn-d ad-sm" data-delete>Delete</button></td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function startEdit(row) {
  const cell = row.querySelector('.ad-desc');
  if (cell.querySelector('textarea')) return;
  const original = cell.textContent;

  cell.innerHTML = `
    <textarea class="ad-textarea" maxlength="500" rows="3"></textarea>
    <div class="ad-row-acts">
      <button class="btn btn-p ad-sm" data-save>Save</button>
      <button class="btn btn-s ad-sm" data-cancel>Cancel</button>
    </div>`;
  const textarea = cell.querySelector('textarea');
  textarea.value = original;
  textarea.focus();

  cell.querySelector('[data-cancel]').addEventListener('click', () => {
    cell.textContent = original;
  });
  cell.querySelector('[data-save]').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const updated = await api.put(`/admin/characters/${row.dataset.id}`, { description: textarea.value });
      cell.textContent = updated.description;
      showToast('Description updated.');
    } catch (err) {
      showToast(err.message, { isError: true });
      event.target.disabled = false;
    }
  });
}

// Delete needs two clicks so a character is not removed by accident.
async function deleteCharacter(row, button) {
  if (!button.dataset.confirming) {
    button.dataset.confirming = 'yes';
    button.textContent = 'Confirm';
    setTimeout(() => {
      delete button.dataset.confirming;
      button.textContent = 'Delete';
    }, 4000);
    return;
  }

  button.disabled = true;
  try {
    await api.delete(`/admin/characters/${row.dataset.id}`);
    showToast('Character deleted.');
    loadImported();
    // Lets the deleted character be imported again from the current Jikan page.
    if (apiCharacters.length) fetchCharacters(currentPage);
  } catch (err) {
    showToast(err.message, { isError: true });
    button.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar('admin');
  refreshIcons();

  // The server decides access: 401 means logged out, 403 means not an ADMIN.
  try {
    await api.get('/admin/dashboard');
  } catch (err) {
    window.location.href = err.status === 403 ? 'questboard.html' : 'login.html';
    return;
  }

  showAdminNavLink();
  await loadAndApplyTheme();
  document.getElementById('admin-characters').hidden = false;
  loadImported();

  document.getElementById('fetch-form').addEventListener('submit', (event) => {
    event.preventDefault();
    currentSearch = event.target.elements.search.value.trim();
    if (currentSearch && currentSearch.length < 3) {
      showToast('Search must be at least 3 characters.', { isError: true });
      return;
    }
    fetchCharacters(1);
  });
  document.getElementById('prev-page').addEventListener('click', () => fetchCharacters(currentPage - 1));
  document.getElementById('next-page').addEventListener('click', () => fetchCharacters(currentPage + 1));

  document.getElementById('api-results').addEventListener('click', (event) => {
    const button = event.target.closest('[data-import]');
    if (button) importCharacter(Number(button.dataset.import), button);
  });
  document.getElementById('imported-list').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    if (event.target.closest('[data-edit]')) startEdit(row);
    const deleteBtn = event.target.closest('[data-delete]');
    if (deleteBtn) deleteCharacter(row, deleteBtn);
  });
});
