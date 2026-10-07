-- Quest Board redesign: quests get a "Time Required" and an optional file attachment.
-- * time_required: minutes the student expects the quest to take. Existing quests get 60.
-- * file_*: the attachment's original name, its path inside the server's uploads/ folder,
--   its type and its size. The file itself is stored on disk, not in MySQL.
-- * status stays, but is no longer chosen by the user: the server sets it from study
--   sessions (first session -> IN_PROGRESS, studied minutes >= time_required -> COMPLETED),
--   and Analytics keeps using it. Existing values are kept as they are.
-- Run once (check first that quests has no time_required column yet):
--   mysql -u root -p focusarc < database/migrations/005_quest_attachments_and_time.sql
USE focusarc;

ALTER TABLE quests
  ADD COLUMN time_required SMALLINT UNSIGNED NOT NULL DEFAULT 60 AFTER description,
  ADD COLUMN file_name     VARCHAR(255) NULL AFTER time_required,
  ADD COLUMN file_path     VARCHAR(255) NULL AFTER file_name,
  ADD COLUMN file_type     VARCHAR(100) NULL AFTER file_path,
  ADD COLUMN file_size     INT UNSIGNED NULL AFTER file_type;
