/*
  Admin Dashboard. Access is decided by the server: GET /api/admin/dashboard answers 401 when
  logged out and 403 for non-admins, and this page redirects accordingly.
*/

function renderAdminSections(sections) {
  const container = document.getElementById('admin-sections');
  container.innerHTML = sections
    .map(
      (section) => `
      <section class="card ad-card">
        <div class="ad-icon">${icon(section.icon, 20)}</div>
        <h3>${escapeHtml(section.label)}</h3>
        <p>${escapeHtml(section.description)}</p>
        <span class="ad-soon">Coming soon</span>
      </section>`
    )
    .join('');
  refreshIcons();
}

document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar('admin');

  let dashboard;
  try {
    dashboard = await api.get('/admin/dashboard');
  } catch (err) {
    window.location.href = err.status === 403 ? 'questboard.html' : 'login.html';
    return;
  }

  showAdminNavLink();
  await loadAndApplyTheme();
  renderAdminSections(dashboard.sections);
});
