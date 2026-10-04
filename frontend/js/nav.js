/*
  Shared sidebar navigation, rendered into <div id="sidebar-root"> on every authenticated page.
  Reused instead of duplicating the nav markup per page.
*/

const NAV_ITEMS = [
  { key: 'questboard', label: 'Quest Board', href: 'questboard.html', icon: 'list-checks' },
  { key: 'analytics', label: 'Analytics', href: 'analytics.html', icon: 'bar-chart-3' },
  { key: 'character', label: 'Character Guide', href: 'character.html', icon: 'user-round' },
  { key: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' },
];

function renderSidebar(activeKey) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  const links = NAV_ITEMS.map(
    (item) => `
      <li>
        <a class="nav-a${item.key === activeKey ? ' active' : ''}" href="${item.href}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </a>
      </li>`
  ).join('');

  root.innerHTML = `
    <button class="nav-tog" id="mobile-nav-toggle" aria-label="Open navigation">
      ${icon('menu', 20)}
    </button>
    <div class="side-bg" id="sidebar-backdrop"></div>
    <aside class="side" id="sidebar">
      <div class="side-brand">
        <img class="sb-icon" src="/assets/logo/logo.png.png" alt="FocusArc" />
        <span class="sb-text brand">FocusArc</span>
      </div>
      <div class="side-tag">Study Quest System</div>
      <ul class="nav-ul">${links}</ul>
      <div class="nav-out">
        <a class="nav-a" href="#" id="logout-link">
          ${icon('log-out')}
          <span>Logout</span>
        </a>
      </div>
    </aside>
  `;

  refreshIcons();

  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });

  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggle = document.getElementById('mobile-nav-toggle');

  toggle.addEventListener('click', () => {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
  });
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
  });
}
