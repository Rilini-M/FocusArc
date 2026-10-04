CREATE DATABASE focusarc;
USE focusarc;

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  date_of_birth  DATE         NOT NULL
);

CREATE TABLE characters (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(50)  NOT NULL UNIQUE,
  description  TEXT,
  image_path   VARCHAR(255) NOT NULL
);

CREATE TABLE quotes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  character_id  INT          NOT NULL,
  quote_text    VARCHAR(500) NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE quests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NOT NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT         NOT NULL,
  status       ENUM('TODO', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'TODO',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE study_sessions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT      NOT NULL,
  quest_id          INT,
  started_at        DATETIME NOT NULL,
  ended_at          DATETIME,
  duration_minutes  INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL
);


CREATE TABLE user_settings (
  user_id       INT PRIMARY KEY,
  character_id  INT NOT NULL DEFAULT 1,
  theme         ENUM('default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk') NOT NULL DEFAULT 'default',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id)
);
