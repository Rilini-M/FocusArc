-- Prepares the existing characters table for characters imported from the Jikan API
-- (fresh installs get these columns from schema.sql). No rows are deleted. The 5 built-in
-- characters keep external_api_id = NULL; imported ones store their Jikan (MyAnimeList) id.
-- Run once:
--   mysql -u root -p focusarc < database/migrations/002_characters_jikan.sql
USE focusarc;

ALTER TABLE characters
  ADD COLUMN external_api_id INT NULL UNIQUE AFTER id,
  MODIFY COLUMN name VARCHAR(100) NOT NULL,
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
