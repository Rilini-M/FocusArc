# Frontend Guide

Vanilla HTML/CSS/JS, no build step, no framework. Each `.html` file is a real page — navigating
between them is a normal browser navigation, not client-side routing.

## Shared modules (`frontend/js/`)

- **`api.js`** — the only place `fetch()` is called. `api.get/post/put/patch/delete(path, body)`
  always sends `credentials: 'include'`, parses JSON, and throws a normal `Error` with a
  human-readable `.message` (from the backend's `{ success:false, message }` envelope) on any
  failure — every page's `catch` block can just do `showToast(err.message, { isError: true })`.
- **`auth.js`** — `requireAuth()` (call at the top of every protected page's `DOMContentLoaded`;
  redirects to `login.html` on 401), `logout()`, `showToast()`, and the form handlers for
  `login.html`/`signup.html`.
- **`theme.js`** — `applyTheme(theme)` sets `data-theme` on `<html>`; `loadAndApplyTheme()`
  fetches `/api/settings` and applies the saved theme before the page finishes rendering, so
  authenticated pages never flash the default theme. Theme and character are handled
  completely independently — this module never reads or writes character state.
- **`nav.js`** — `renderSidebar(activeKey)` injects the sidebar (Quest Board / Analytics /
  Character Guide / Settings / Logout) into `<div id="sidebar-root">`, highlights the active
  link, and wires the mobile hamburger toggle + logout click. Every authenticated page calls
  this once instead of hand-writing the nav markup.

## Per-page scripts

`questboard.js`, `analytics.js`, `character.js`, `settings.js` each own exactly one page: they
call `requireAuth()` + `loadAndApplyTheme()` + `renderSidebar()` on load, then fetch and render
that page's data. Quote auto-rotation (`questboard.js`'s companion banner, `character.js`'s
hero) uses `setInterval` driven by `quote_interval`/`auto_quote` from `/api/settings` — there is
deliberately no manual prev/next control or "x/5" counter anywhere.

## CSS structure

- **`themes.css`** — only custom properties (`--bg-primary`, `--accent`, `--border`, `--glow`,
  etc.), one block per theme keyed off `[data-theme='...']`. Never put layout rules here.
- **`global.css`** — resets, typography, the sidebar/app-shell layout, and every reusable
  component class (`.card`, `.btn`, `.field`, `.status-pill`, `.empty-state`, `.toast`, mobile
  nav breakpoints). Shared across all pages.
- **`login.css` / `signup.css` / `questboard.css` / `character.css` / `settings.css` /
  `analytics.css`** — page-specific layout only; they lean on `global.css` classes rather than
  re-defining buttons/cards/fields.

## Adding a new page

1. Create `frontend/<page>.html` linking `themes.css` → `global.css` → `<page>.css`, with
   `<div id="sidebar-root"></div>` inside `.app-shell` if it's an authenticated page.
2. Create `frontend/js/<page>.js`; on `DOMContentLoaded` call `requireAuth()`,
   `loadAndApplyTheme()`, `renderSidebar('<key>')`, then load/render data through `api.js`.
3. Add the page to `NAV_ITEMS` in `nav.js` if it belongs in the sidebar.
