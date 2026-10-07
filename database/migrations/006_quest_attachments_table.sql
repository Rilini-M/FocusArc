-- A quest can have several attachments (up to 5, enforced by the server), so they move out of
-- the quests table into their own table: one row per file. The files themselves stay on disk
-- in uploads/quests/; these rows only describe them.
-- Existing single attachments are copied over first, then the old quests.file_* columns are
-- dropped. No file is lost.
-- Run once (check first that there is no quest_attachments table yet):
--   mysql -u root -p focusarc < database/migrations/006_quest_attachments_table.sql
USE focusarc;

CREATE TABLE quest_attachments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quest_id    INT UNSIGNED NOT NULL,
  file_name   VARCHAR(255) NOT NULL,  -- original (cleaned-up) name shown to the user
  file_path   VARCHAR(255) NOT NULL,  -- random server-side name inside uploads/
  file_type   VARCHAR(100) NOT NULL,
  file_size   INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_quest_attachments_quest_id (quest_id),
  CONSTRAINT fk_quest_attachments_quest FOREIGN KEY (quest_id) REFERENCES quests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO quest_attachments (quest_id, file_name, file_path, file_type, file_size)
  SELECT id, file_name, file_path, file_type, file_size FROM quests WHERE file_path IS NOT NULL;

ALTER TABLE quests
  DROP COLUMN file_name,
  DROP COLUMN file_path,
  DROP COLUMN file_type,
  DROP COLUMN file_size;
