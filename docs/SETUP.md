# Setup

## Prerequisites

- **Node.js** (v18+; developed against v24.19.0) and npm — already installed and verified on
  the dev machine.
- **MySQL** — not yet installed on the primary dev machine as of 2026-08-26. Install one of:
  MySQL Server, XAMPP/WAMP (bundles MySQL), or point `.env` at a remote/cloud MySQL instance.
- **Git** — for version control (see [GIT_WORKFLOW.md](GIT_WORKFLOW.md)).

## Install

```
npm install
```

## Configure environment

```
cp .env.example .env
```

Fill in:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — your MySQL connection
- `JWT_SECRET` — a long random string (never reuse the placeholder in production)
- `PORT` — defaults to 3000

## Create the database

```
mysql -u root -p < database/schema.sql
mysql -u root -p focusarc < database/seed.sql
```

`schema.sql` creates the `focusarc` database and all tables. `seed.sql` inserts the 5 fixed
characters and their motivational quotes only — no fake users, quests, or study sessions are
ever seeded.

## Run

```
npm start        # node backend/server.js
npm run dev       # same, with --watch for auto-restart on file changes
```

Then open `http://localhost:3000` — Express serves both the frontend pages and the `/api/*`
REST endpoints from this one process.

## Verifying it's working

- `GET http://localhost:3000/api/health` → `{ "success": true, "data": { "status": "ok" } }`
  (works even before MySQL is connected).
- Registering an account (`signup.html`) and logging in requires a real, reachable MySQL
  instance with the schema applied — until then, DB-backed routes return a clean
  `{ success:false, message:"Something went wrong..." }` (500) rather than crashing the server.
