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

Prerequisites: Node.js and MySQL 8.

```
npm install
cp .env.example .env   # then fill in real DB_* and JWT_SECRET values
mysql -u root -p < database/schema.sql
mysql -u root -p focusarc < database/seed.sql
npm start
```

Then open `http://localhost:3000` in a browser.
