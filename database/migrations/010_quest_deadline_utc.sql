-- Quest deadlines are stored in UTC, so the server and every browser compare the same instant
-- whatever their time zones (a quest is Missing once its deadline has passed). The browser
-- converts between UTC and the user's local time for display and input.
-- * Existing deadlines were saved as the local wall-clock time the user picked. They are
--   converted from this database's time zone (the same machine's clock the browser used).
-- * No rows are deleted and nothing else changes. Safe to run twice: the column's 'UTC'
--   comment marks it as converted, and a converted column is left alone.
-- Run once, after 008 (and 009):
--   mysql -u root -p focusarc < database/migrations/010_quest_deadline_utc.sql
USE focusarc;

SET @deadline_is_utc = (
  SELECT COLUMN_COMMENT = 'UTC' FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quests' AND COLUMN_NAME = 'deadline'
);

UPDATE quests
SET deadline = deadline - INTERVAL TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) MINUTE
WHERE deadline IS NOT NULL AND NOT @deadline_is_utc;

ALTER TABLE quests MODIFY COLUMN deadline DATETIME NULL COMMENT 'UTC';
