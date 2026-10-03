# FocusArc — Study Quest System

An anime-inspired study productivity web app. Plan study tasks as "quests", track them through
TODO → IN PROGRESS → COMPLETED, study with a motivational anime study companion, and review
your real study analytics. FocusArc is a productivity tool — it has no game mechanics, XP,
levels, or rewards.

## Team

- **Richa** — Backend: Node.js, Express, MySQL, REST APIs, server-side logic
- **Aashika** — Frontend: HTML, CSS, vanilla JavaScript, UI/UX

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript (no framework)
- Backend: Node.js, Express.js
- Database: MySQL

## Getting Started

See [docs/SETUP.md](docs/SETUP.md) for full setup instructions (Node install, MySQL setup,
`.env` configuration, running the server).

Quick start once prerequisites are installed:

```
npm install
cp .env.example .env   # then fill in real DB_* and JWT_SECRET values
mysql -u root -p < database/schema.sql
mysql -u root -p focusarc < database/seed.sql
npm start
```

Then open `http://localhost:3000` in a browser.

## Documentation

- [docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md) — full run guide + a section-by-section
  explanation of every file, database to backend to frontend
- [docs/QUESTION_BANK.md](docs/QUESTION_BANK.md) — 1000 practice questions about the codebase,
  for project defense / interview prep
- [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — what FocusArc is and isn't
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture
- [docs/DATABASE.md](docs/DATABASE.md) — schema reference
- [docs/API.md](docs/API.md) — REST API reference
- [docs/FRONTEND.md](docs/FRONTEND.md) / [docs/BACKEND.md](docs/BACKEND.md) — module guides
- [docs/SETUP.md](docs/SETUP.md) — local development setup
- [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) — branching & commit conventions
- [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) — running log of work done
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — release history
