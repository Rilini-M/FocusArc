/*
  Thin wrapper around the Lucide icon library (loaded via CDN script tag on every page).
  Centralizing this so every page/module creates icons the same way and remembers to
  re-run lucide.createIcons() after injecting new data-lucide markup via innerHTML.
*/

function icon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
