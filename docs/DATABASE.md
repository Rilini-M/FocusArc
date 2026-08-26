# Database

MySQL. Full DDL lives in [`database/schema.sql`](../database/schema.sql); seed data (characters
and quotes only — no fake users/quests/sessions) lives in [`database/seed.sql`](../database/seed.sql).

## Tables

### `users`
| column | type | notes |
|---|---|---|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| username | VARCHAR(50) | UNIQUE |
| email | VARCHAR(255) | UNIQUE |
| password_hash | VARCHAR(255) | bcryptjs hash, never returned to the client |
| date_of_birth | DATE | |
| created_at / updated_at | TIMESTAMP | |

### `quests`
| column | type | notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| user_id | INT UNSIGNED | FK → users.id, ON DELETE CASCADE |
| title | VARCHAR(150) | |
| description | TEXT | |
| status | ENUM('TODO','IN_PROGRESS','COMPLETED') | default TODO |
| created_at / updated_at | TIMESTAMP | |

No category, priority, due date, estimated time, XP, or points columns — intentionally, per the
project spec. The **maximum of 10 quests per user is enforced in application code**
(`backend/services/questLimit.service.js`), not as a SQL constraint, since MySQL has no native
"max rows per FK value" check.

### `study_sessions`
| column | type | notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| user_id | INT UNSIGNED | FK → users.id, ON DELETE CASCADE |
| quest_id | INT UNSIGNED NULL | FK → quests.id, ON DELETE SET NULL |
| started_at | DATETIME | |
| ended_at | DATETIME NULL | |
| duration_minutes | INT UNSIGNED NULL | |
| created_at | TIMESTAMP | |

### `characters`
5 fixed rows seeded by `seed.sql`: Tanjiro, L, Sung Jin-Woo, Gilgamesh, Alucard.

### `quotes`
Several motivational quotes per character (FK → `characters.id`, `ON DELETE CASCADE`).

### `user_settings`
| column | type | notes |
|---|---|---|
| id | INT UNSIGNED PK | |
| user_id | INT UNSIGNED | UNIQUE, FK → users.id, ON DELETE CASCADE |
| character_id | INT UNSIGNED | FK → characters.id, default 1 |
| theme | ENUM('default','nature','dark','royal','vampire','cyberpunk') | default 'default' |
| auto_quote | BOOLEAN | default TRUE |
| quote_interval | INT UNSIGNED | milliseconds, default 8000 |
| created_at / updated_at | TIMESTAMP | |

## Integrity

Every user-owned table cascades on `users` deletion (`ON DELETE CASCADE`), so deleting an
account via `DELETE /api/profile` leaves no orphan quests, study sessions, or settings rows.
`study_sessions.quest_id` uses `ON DELETE SET NULL` so deleting a quest doesn't destroy the
historical study-time record tied to it.
