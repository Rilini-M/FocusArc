# Backend Guide

Node.js + Express, no ORM — `mysql2/promise` with parameterized queries throughout.

## Module responsibilities

- **`server.js`** — creates the Express app, wires CORS/JSON/cookie-parser middleware, serves
  `frontend/` and `assets/` as static directories, mounts every route module under `/api`, and
  registers the 404 + error-handling middleware last.
- **`config/database.js`** — a single `mysql2` connection pool built from `DB_*` env vars,
  imported by every controller that needs the database. `dateStrings: true` so MySQL DATE
  columns come back as plain `YYYY-MM-DD` strings instead of JS Date objects (matters for
  `date_of_birth` and streak-date comparisons).
- **`middleware/auth.middleware.js`** — reads the `focusarc_token` cookie, verifies the JWT,
  and sets `req.user.id`; returns 401 on anything else. Every route file that needs auth calls
  `router.use(authenticate)` once at the top rather than per-route.
- **`middleware/validate.js`** — request-body validation for registration, login, quests, quest
  status, and theme. Runs before the controller so controllers can assume valid input.
- **`middleware/errorHandler.js`** — `notFoundHandler` for unmatched `/api/*` routes, and a
  catch-all `errorHandler` that logs the real error server-side but only ever sends
  `{ success: false, message }` to the client (never a stack trace). Recognizes MySQL's
  `ER_DUP_ENTRY` and turns it into a friendly "already in use" message.
- **`services/questLimit.service.js`** — the single source of truth for the 10-quest cap.
  `quests.controller.js#create` calls `hasReachedQuestLimit()` before inserting; this is what
  makes the limit unbypassable from the API directly, not just hidden in the UI.
- **`services/analytics.service.js`** — every aggregation query behind the Analytics page.
  Each function returns an explicit `hasData` (or `hasStudyData`) flag so the frontend can
  render a real empty state instead of a misleading zero.
- **`utils/password.js`** — bcryptjs hash/compare (pure JS, no native build step — chosen over
  `bcrypt` to avoid its `node-pre-gyp`/`tar` supply-chain CVEs).
- **`utils/jwt.js`** — sign/verify + cookie set/clear, centralizing the cookie name and options
  (httpOnly, SameSite=Lax, `secure` in production) in one place.
- **`utils/responses.js`** — `success(res, data, status)` / `failure(res, message, status)` so
  every controller returns the same envelope shape.

## Adding a new endpoint

1. Add the query/logic to the relevant `services/` file if it's shared, or directly in a new
   controller function otherwise.
2. Add the controller function (validate `req.user.id` scoping — never trust a body-supplied
   user id).
3. Wire it in the matching `routes/*.routes.js`, adding any `validate.js` middleware needed.
4. Document it in [API.md](API.md).
