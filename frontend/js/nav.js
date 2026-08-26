/*
  Shared sidebar navigation, rendered into <div id="sidebar-root"> on every authenticated page.
  Reused instead of duplicating the nav markup per page.
*/

const FOCUSARC_NAV_ICONS = {
  quests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  character: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 000-2l1.2-1.9-1.7-1.7L17 8.6a1.7 1.7 0 00-2 0l-1.9-1.2-1.7 1.7L10.6 11a1.7 1.7 0 000 2l-1.2 1.9 1.7 1.7L13 15.4a1.7 1.7 0 002 0l1.9 1.2 1.7-1.7z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 20C5 10 12 4 20 4c0 8-6 15-16 16z"/><path d="M6 19c4-5 8-8 13-11"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
};

const NAV_ITEMS = [
  { key: 'questboard', label: 'Quest Board', href: 'questboard.html', icon: 'quests' },
  { key: 'analytics', label: 'Analytics', href: 'analytics.html', icon: 'analytics' },
  { key: 'character', label: 'Character Guide', href: 'character.html', icon: 'character' },
  { key: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' },
];

function renderSidebar(activeKey) {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  const links = NAV_ITEMS.map(
    (item) => `
      <li>
        <a class="nav-link${item.key === activeKey ? ' active' : ''}" href="${item.href}">
          ${FOCUSARC_NAV_ICONS[item.icon]}
          <span>${item.label}</span>
        </a>
      </li>`
  ).join('');

  root.innerHTML = `
    <button class="mobile-nav-toggle" id="mobile-nav-toggle" aria-label="Open navigation">
      ${FOCUSARC_NAV_ICONS.menu}
    </button>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-brand-icon">${FOCUSARC_NAV_ICONS.leaf}</span>
        <span class="sidebar-brand-text brand">FocusArc</span>
      </div>
      <div class="sidebar-tagline">Study Quest System</div>
      <ul class="nav-list">${links}</ul>
      <div class="nav-logout">
        <a class="nav-link" href="#" id="logout-link">
          ${FOCUSARC_NAV_ICONS.logout}
          <span>Logout</span>
        </a>
      </div>
    </aside>
  `;

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
