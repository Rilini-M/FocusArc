# Changelog

## [Unreleased]

### Added
- Initial project scaffolding: folder structure, `package.json`, `.env.example`, `.gitignore`.
- MySQL schema (`users`, `quests`, `study_sessions`, `characters`, `quotes`, `user_settings`)
  and seed data for the 5 characters and their motivational quotes.
- Backend: JWT-cookie authentication, quest CRUD with a server-enforced 10-quest cap, study
  sessions, characters/quotes, settings, and profile REST endpoints.
- Analytics endpoints computing overview stats, a 7-day productivity trend, quest-progress
  breakdown, and a focus-completion ratio, all from real stored data with explicit empty
  states.
- Frontend: Login, Sign Up, Quest Board, Analytics, Character Guide, and Settings pages, a
  shared 6-theme CSS variable system, and shared JS modules for API calls, auth guarding,
  theming, and navigation.
