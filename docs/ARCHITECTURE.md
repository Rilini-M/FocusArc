# Architecture

## Overview

Plain three-tier architecture. No frontend framework — vanilla HTML/CSS/JS. No separate
frontend dev server: Express serves the static frontend and the REST API from a single process
on one port.

```
Browser (HTML/CSS/vanilla JS, fetch())
        │  HTTP/JSON, credentials: 'include'
        ▼
Node.js + Express (REST API, JWT auth via httpOnly cookie)
        │  mysql2 (parameterized queries / connection pool)
        ▼
MySQL
```

## Authentication

JWT, signed with `JWT_SECRET`, stored in an **httpOnly, SameSite=Lax cookie** (not
localStorage — reduces XSS token theft risk). `backend/middleware/auth.middleware.js` verifies
the cookie on every protected route and attaches `req.user.id`. The frontend never handles the
raw token; it only ever checks `GET /api/auth/me` to know if it's logged in.

## Backend layout

```
backend/
├── server.js               Express app entrypoint, mounts all routes + middleware
├── config/database.js      mysql2 connection pool (reads DB_* from .env)
├── routes/                 one file per resource — request routing + middleware wiring only
├── controllers/             one file per resource — request/response handling
├── middleware/               auth.middleware.js, errorHandler.js, validate.js
├── services/                questLimit.service.js, analytics.service.js — shared business logic
└── utils/                    password.js (bcryptjs), jwt.js, responses.js (success/failure envelope)
```

Controllers talk to MySQL directly via `mysql2/promise` parameterized queries — no ORM. Shared
cross-cutting logic (the 10-quest cap, analytics aggregation) lives in `services/` so it isn't
duplicated across controllers.

## Frontend layout

```
frontend/
├── *.html                  one static page per route, no client-side router
├── css/                    themes.css (variables only) + global.css (layout/components) +
│                            one stylesheet per page for page-specific styling
└── js/                      api.js, auth.js, theme.js, nav.js (shared) + one script per page
```

`js/api.js` is the single place that calls `fetch()` — every page module goes through it so
error handling and `credentials: 'include'` aren't duplicated. `js/nav.js` renders the shared
sidebar into `#sidebar-root` on every authenticated page instead of duplicating that markup.

## Response format

Every API response is one of:

```json
{ "success": true, "data": { } }
{ "success": false, "message": "Human-readable message." }
```

No stack traces or internal error detail ever reach the client (`backend/middleware/errorHandler.js`).
