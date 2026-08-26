# API Reference

Base path: `/api`. All responses: `{ "success": true, "data": ... }` or
`{ "success": false, "message": "..." }`. Authenticated routes require the `focusarc_token`
httpOnly cookie set by `/api/auth/login` or `/api/auth/register`.

## Auth (`/api/auth`)

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | /register | — | username, email, password, confirmPassword, dateOfBirth | Creates user + default settings row, logs in |
| POST | /login | — | username, password, dateOfBirth | All three must match |
| POST | /logout | — | — | Clears the auth cookie |
| GET | /me | ✓ | — | Returns id, username, email, date_of_birth, created_at |

## Quests (`/api/quests`) — all require auth

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | / | — | List the caller's quests |
| GET | /:id | — | 404 if not owned |
| POST | / | title, description, status? | **409** if the user already has 10 quests |
| PUT | /:id | title, description, status | Full update |
| PATCH | /:id/status | status | TODO / IN_PROGRESS / COMPLETED, either direction |
| DELETE | /:id | — | |

## Study sessions (`/api/study-sessions`) — all require auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | / | questId?, startedAt, endedAt?, durationMinutes? | questId optional, must belong to caller if given |
| GET | / | — | Newest first |
| GET | /summary | — | `{ hasData, totalMinutes, sessionCount }` |

## Analytics (`/api/analytics`) — all require auth, all computed from real rows

| Method | Path | Returns |
|---|---|---|
| GET | /overview | totalQuests, completedQuests, completionRate, studyTimeMinutes, hasStudyData, studyStreakDays |
| GET | /productivity | `{ hasData, trend: [{ date, minutes }] }` (last 7 days) |
| GET | /quest-progress | `{ hasData, total, progress: { TODO, IN_PROGRESS, COMPLETED } }` |
| GET | /focus | `{ hasData, totalSessions, completedSessions, focusMinutes, focusRatio }` — ratio of sessions logged through to a real end/duration vs. abandoned |

When there's no underlying data, `hasData`/`hasStudyData` is `false` and the frontend renders
an explicit empty state ("No study sessions yet.") — numbers are never fabricated.

## Characters (`/api/characters`) — all require auth

| Method | Path | Notes |
|---|---|---|
| GET | / | All 5 characters |
| GET | /:id | One character |
| GET | /:id/quotes | That character's quotes |

## Settings (`/api/settings`) — all require auth

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | / | — | character_id, theme, auto_quote, quote_interval |
| PUT | / | characterId?, theme?, autoQuote?, quoteInterval? | Partial update |
| PATCH | /character | characterId | |
| PATCH | /theme | theme | Must be one of the 6 valid themes |

## Profile (`/api/profile`) — all require auth

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | / | — | |
| PUT | / | username, email, dateOfBirth | |
| PUT | /password | currentPassword, newPassword | Verifies current password first |
| DELETE | / | — | Cascades to quests, study_sessions, user_settings |

## Health

| Method | Path | Notes |
|---|---|---|
| GET | /api/health | No auth required, used for uptime checks |
