-- Note: written when the importer used Jikan. The importer now uses AniList, and
-- external_api_id stores AniList character ids. The columns are the same either way.
--
-- Prepares the existing characters table for characters imported from the Jikan API
-- (fresh installs get these columns from schema.sql). No rows are deleted. The 5 built-in
-- characters keep external_api_id = NULL; imported ones store their Jikan (MyAnimeList) id.
-- Run once:
--   mysql -u root -p focusarc < database/migrations/002_characters_jikan.sql
USE focusarc;

ALTER TABLE characters
  ADD COLUMN external_api_id INT NULL UNIQUE AFTER id,
  MODIFY COLUMN name VARCHAR(100) NOT NULL,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Some existing databases already have created_at. If so, this last statement fails with
-- "Duplicate column name 'created_at'"; that is expected and safe to ignore.
ALTER TABLE characters
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
