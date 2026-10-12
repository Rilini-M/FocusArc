-- Quests get an optional deadline: the date and time the quest must be finished by.
-- * Separate from time_required (how long the student expects the quest to take) — the
--   study progress bar uses time_required, never the deadline.
-- * Stored as the wall-clock time the user picked (no time zone), NULL when not set.
--   Existing quests have no deadline.
-- Run once (check first that quests has no deadline column yet):
--   mysql -u root -p focusarc < database/migrations/008_quest_deadline.sql
USE focusarc;

ALTER TABLE quests
  ADD COLUMN deadline DATETIME NULL AFTER time_required;
