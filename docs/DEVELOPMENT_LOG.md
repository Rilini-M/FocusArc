# Development Log

## 2026-08-26

### Richa — Backend

Feature:
Project scaffolding, database schema, and full REST API

Changes:
- Created folder structure (`backend/`, `database/`, `docs/`, `assets/backgrounds|decorations|icons/`)
- `package.json` with express, mysql2, bcryptjs, jsonwebtoken, cookie-parser, dotenv, cors
- `database/schema.sql`: users, quests, study_sessions, characters, quotes, user_settings,
  with foreign keys, indexes, and cascading deletes
- `database/seed.sql`: 5 characters (Tanjiro, L, Sung Jin-Woo, Gilgamesh, Alucard) with 4
  motivational quotes each — no fake user/quest/session data
- `backend/config/database.js` — mysql2 connection pool from `.env`
- `backend/utils/` — bcryptjs password hashing, JWT sign/verify + httpOnly cookie helpers,
  `{success,data}`/`{success:false,message}` response envelope
- `backend/middleware/` — JWT-cookie auth guard, request validation, centralized error handler
  (never leaks stack traces)
- `backend/services/questLimit.service.js` — server-enforced 10-quest-per-user cap
- `backend/services/analytics.service.js` — overview/productivity/quest-progress/focus
  aggregation queries, each returning an explicit `hasData` flag instead of fabricated numbers
- Full REST API: `/api/auth/*`, `/api/quests/*`, `/api/study-sessions/*`, `/api/analytics/*`,
  `/api/characters/*`, `/api/settings/*`, `/api/profile/*`, `/api/health`
- `backend/server.js` — wires everything, serves `frontend/` and `assets/` as static content

Reason:
Kickoff of the full application per the agreed plan
(`C:\Users\rilin\.claude\plans\you-are-claude-code-transient-lamport.md`). MySQL was not yet
installed on the dev machine, so this layer is written and reviewable but untested against a
live database (see Known Issues).

Testing:
- `npm install` — 0 vulnerabilities after switching `bcrypt` → `bcryptjs` (native `bcrypt`'s
  `node-pre-gyp`/`tar` build chain carried 1 critical + 1 high advisory; pure-JS `bcryptjs`
  has no native build step and eliminates it)
- All 32 backend + frontend JS files pass `node --check` (syntax-only)
- Server boots cleanly; `GET /api/health` verified returning `200 {"success":true,"data":{"status":"ok"}}`
- `POST /api/auth/register` verified returning a clean `500 {"success":false,"message":"..."}`
  (no crash, no stack trace) with no MySQL instance connected — expected given Known Issues

Known issues:
- MySQL is not installed/connected yet — no endpoint touching the database has been exercised
  against real data. Needs: install MySQL (or point `.env` at a remote instance), run
  `schema.sql` + `seed.sql`, then re-verify register/login/quest CRUD/analytics end-to-end.
- Git is not installed yet — this work exists only on disk, not in version control. See
  [GIT_WORKFLOW.md](GIT_WORKFLOW.md).

### Aashika — Frontend

Feature:
Full page set, shared theme system, and shared JS modules

Changes:
- `frontend/css/themes.css` — 6 themes (default teal/cyan, nature, dark, royal, vampire,
  cyberpunk) as CSS custom properties only; layout never changes between themes
- `frontend/css/global.css` — resets, typography (Cinzel display / Inter body via Google
  Fonts), sidebar/app-shell layout with mobile collapse, `.card`/`.btn`/`.field`/
  `.status-pill`/`.empty-state`/`.toast` component classes, reduced-motion support
- `frontend/js/api.js`, `auth.js`, `theme.js`, `nav.js` — shared fetch wrapper, auth guard +
  toast helper, theme application, and sidebar rendering, so no page duplicates this logic
- `login.html`/`signup.html` + `login.css` — atmospheric dark teal/cyan split layout with a
  character portrait, falling-leaf decoration, and the glowing form card, following the
  reference mockups' visual mood; the reference's "Level up. Learn faster. Achieve more."
  tagline was intentionally dropped (banned by spec)
- `questboard.html`/`.css`/`.js` — companion banner with auto-rotating quote (no manual
  nav/counter), filter tabs, quest CRUD with an inline status `<select>`, Add Quest disabled at
  10 quests client-side (mirroring the server-side cap)
- `character.html`/`.css`/`.js` — large character hero with auto-rotating quote and a
  companion picker grid across all 5 characters; no XP/Level bar (banned by spec)
- `settings.html`/`.css`/`.js` — character grid, theme swatches (6), Update Profile / Change
  Password / Delete Account modals, Logout
- `analytics.html`/`.css`/`.js` — Total Quests, Completed Quests, Study Time, Completion Rate,
  a 7-day Productivity Trend bar chart, a Focus Ratio donut, Quest Progress bars, and a Study
  Streak card — all from real API data with "No study sessions yet."/"No quests yet." empty
  states; deliberately excludes Subject Progress and week-over-week % comparisons (banned by
  spec, even though the reference mockup showed both)
- `index.html` — redirects to `questboard.html` or `login.html` based on `/api/auth/me`

Reason:
Same kickoff as above. `assets/backgrounds/`, `assets/decorations/`, and `assets/icons/` don't
exist yet (only `assets/characters/*.jpg`), so all atmospheric backgrounds/decorations are
CSS-only placeholders and icons are inline SVG — structured so real asset files can drop in
later without markup/JS changes, per the user's decision to supply those assets later.

Testing:
- All 6 pages + `index.html` verified serving `200 OK` from the running Express server, along
  with `global.css`, `themes.css`, `api.js`, and a sample character asset
- Full interactive walkthrough (login → quest board → analytics → character → settings →
  logout, across themes/breakpoints) not yet possible — needs a connected MySQL instance so
  registration/login actually succeed

Known issues:
- Same MySQL and Git gaps as the backend entry above block full end-to-end UI verification.
