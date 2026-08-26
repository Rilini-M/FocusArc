# Project Overview

**FocusArc — Study Quest System** is an anime-inspired study productivity web app.

It is **not** an anime game, an RPG, or a game with mechanics. "Quest" is simply the name for a
study task. The anime component is purely visual/motivational identity; the underlying
functionality is a real study productivity system:

Plan study tasks → Study → Complete quests → Track study progress → Analyze productivity →
Stay motivated with an anime study companion.

## Team

- **Richa** — Backend: Node.js, Express.js, MySQL, REST APIs, server-side logic
- **Aashika** — Frontend: HTML, CSS, vanilla JavaScript, UI/UX

## What FocusArc explicitly is not

- No XP, levels, coins, achievements, inventory, or game rewards
- No Dashboard page — after login, users land directly on the Quest Board
- No manual quote navigation (no prev/next arrows, no "x/5" counters) — motivational quotes
  rotate automatically only
- No quest fields beyond title, description, and status (no category, priority, due date,
  estimated time, XP, or points)
- A hard cap of **10 quests per user**, enforced server-side regardless of what the frontend
  sends

## Core pages

Login · Sign Up · Quest Board · Analytics · Character Guide · Settings

## Theme system

Six themes (Default Teal/Cyan, Nature, Dark, Royal, Vampire, Cyberpunk) implemented as CSS
custom properties. Layout never changes between themes — only the color/glow variables do.
Character selection and theme selection are fully independent settings.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), and [API.md](API.md) for
implementation detail.
