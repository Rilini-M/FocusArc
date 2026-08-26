-- FocusArc — Study Quest System
-- MySQL schema

CREATE DATABASE IF NOT EXISTS focusarc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE focusarc;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  date_of_birth   DATE         NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- characters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(50)  NOT NULL,
  description  TEXT         NULL,
  image_path   VARCHAR(255) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_characters_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id  INT UNSIGNED NOT NULL,
  quote_text    VARCHAR(500) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quotes_character
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  INDEX idx_quotes_character_id (character_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- quests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quests (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT         NOT NULL,
  status       ENUM('TODO', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'TODO',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quests_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_quests_user_id (user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- study_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_sessions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  quest_id          INT UNSIGNED NULL,
  started_at        DATETIME NOT NULL,
  ended_at          DATETIME NULL,
  duration_minutes  INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_study_sessions_quest
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL,
  INDEX idx_study_sessions_user_id (user_id),
  INDEX idx_study_sessions_quest_id (quest_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  character_id    INT UNSIGNED NOT NULL DEFAULT 1,
  theme           ENUM('default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk')
                    NOT NULL DEFAULT 'default',
  auto_quote      BOOLEAN NOT NULL DEFAULT TRUE,
  quote_interval  INT UNSIGNED NOT NULL DEFAULT 8000,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_settings_user_id (user_id),
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_settings_character
    FOREIGN KEY (character_id) REFERENCES characters(id)
) ENGINE=InnoDB;
