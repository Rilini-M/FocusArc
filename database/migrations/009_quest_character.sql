-- Quests get an optional companion character: the character shown on the quest's study page
-- and file viewer.
-- * NULL means "use the character chosen in Settings" (all existing quests start that way).
-- * Deleting a character (admin) resets the quests that used it to NULL, never deletes them.
-- * The column copies the type of characters.id (INT or INT UNSIGNED, depending on how the
--   database was created), which the foreign key requires.
-- Run once (check first that quests has no character_id column yet):
--   mysql -u root -p focusarc < database/migrations/009_quest_character.sql
USE focusarc;

SET @character_id_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'characters' AND COLUMN_NAME = 'id'
);
SET @add_quest_character = CONCAT(
  'ALTER TABLE quests ADD COLUMN character_id ', @character_id_type, ' NULL AFTER deadline, ',
  'ADD CONSTRAINT fk_quests_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL'
);
PREPARE add_quest_character FROM @add_quest_character;
EXECUTE add_quest_character;
DEALLOCATE PREPARE add_quest_character;
