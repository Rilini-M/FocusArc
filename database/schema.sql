CREATE DATABASE focusarc;
USE focusarc;

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  date_of_birth  DATE         NOT NULL,
  role           ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER'
);

-- external_api_id is the AniList character id; NULL for the built-in characters.
-- image_path holds a local /assets path for built-ins, or the AniList image URL for imports.
CREATE TABLE characters (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  external_api_id  INT          NULL UNIQUE,
  name             VARCHAR(100) NOT NULL UNIQUE,
  description      TEXT,
  image_path       VARCHAR(255) NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  -- Minutes the student expects the quest to take.
  time_required SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  -- Optional attachment: stored on disk under uploads/, only its details are kept here.
  file_name    VARCHAR(255) NULL,
  file_path    VARCHAR(255) NULL,
  file_type    VARCHAR(100) NULL,
  file_size    INT UNSIGNED NULL,
  -- Set by the server from study sessions (not shown on the Quest Board); used by Analytics.
  status       ENUM('TODO', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'TODO',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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


-- Study themes: the source of truth for which themes exist and their colors. The frontend loads
-- them from GET /api/themes; admins add or edit themes through /api/admin/themes.
CREATE TABLE themes (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  theme_key         VARCHAR(40)  COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE, -- used in data-theme="..."
  label             VARCHAR(60)  NOT NULL,
  accent            CHAR(7)      NOT NULL,            -- primary color, #rrggbb
  accent_2          CHAR(7)      NOT NULL,            -- secondary color
  accent_3          CHAR(7)      NULL,                -- optional third color (defaults to accent_2)
  background        CHAR(7)      NULL,                -- dark-mode page base (defaults to FocusArc's)
  symbol            VARCHAR(8)   NULL,                -- small decorative icon
  particle_style    VARCHAR(20)  NOT NULL DEFAULT 'dot',
  particle_density  DECIMAL(3,2) NOT NULL DEFAULT 0.60,
  sort_order        INT          NOT NULL DEFAULT 0,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,  -- inactive themes are hidden from the picker
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO themes (theme_key, label, accent, accent_2, accent_3, background, symbol, particle_style, particle_density, sort_order) VALUES
  ('default',        'FocusArc',       '#2dd4bf', '#67e8f9', NULL,      '#07090c', '✦', 'leaf',    1.00, 1),
  ('nature',         'Nature',         '#4ade80', '#a3e635', '#d9a441', '#06140e', '❀', 'leaf',    0.70, 2),
  ('cyberpunk',      'Cyberpunk',      '#22d3ee', '#e879f9', NULL,      '#070a18', '◈', 'spark',   0.55, 3),
  ('royal',          'Royal',          '#f4c95d', '#5b7cfa', '#7c3aed', '#0a0b22', '♛', 'sparkle', 0.55, 4),
  ('vampire',        'Vampire',        '#e11d48', '#f87171', '#7f1d1d', '#12060a', '❖', 'ember',   0.60, 5),
  ('sakura',         'Sakura',         '#f472b6', '#fda4af', '#c084fc', '#170a15', '✿', 'petal',   0.70, 6),
  ('cosmic',         'Cosmic',         '#a78bfa', '#38bdf8', '#f0abfc', '#080920', '✧', 'star',    0.90, 7),
  ('ocean',          'Ocean',          '#0ea5e9', '#2dd4bf', NULL,      '#041420', '≋', 'bubble',  0.60, 8),
  ('frost',          'Frost',          '#93c5fd', '#c7d2fe', '#e0f2fe', '#0a1422', '❄', 'snow',    0.80, 9),
  ('ember',          'Ember',          '#fb923c', '#fbbf24', '#ef4444', '#110c09', '✺', 'ember',   0.80, 10),
  ('moonlight',      'Moonlight',      '#cbd5e1', '#a5b4fc', NULL,      '#070c1c', '☾', 'star',    0.70, 11),
  ('academia',       'Academia',       '#d4a373', '#a3b18a', '#e9c46a', '#14100b', '✎', 'dust',    0.50, 12),
  ('japanese-night', 'Japanese Night', '#f87171', '#818cf8', '#f9a8d4', '#0a0b20', '◎', 'lantern', 0.60, 13),
  ('sunset',         'Sunset',         '#fb7185', '#fdba74', '#a855f7', '#160b1a', '☼', 'ember',   0.50, 14),
  ('forest',         'Forest',         '#10b981', '#d9a441', NULL,      '#06100a', '♣', 'firefly', 0.55, 15),
  ('lavender',       'Lavender',       '#c4b5fd', '#f0abfc', NULL,      '#120d1f', '❁', 'petal',   0.55, 16),
  ('crimson',        'Crimson',        '#ef4444', '#fbbf24', NULL,      '#110607', '♦', 'ember',   0.55, 17),
  ('neon',           'Neon',           '#a3e635', '#f472b6', '#22d3ee', '#08080f', 'ϟ', 'spark',   0.50, 18),
  ('celestial',      'Celestial',      '#fde68a', '#a5b4fc', '#ffffff', '#060813', '✶', 'star',    0.80, 19),
  ('mist',           'Mist',           '#94a3b8', '#99f6e4', NULL,      '#0e1216', '∿', 'dust',    0.70, 20),
  ('twilight',       'Twilight',       '#6366f1', '#fb923c', '#f472b6', '#0b0b21', '✵', 'star',    0.60, 21);


CREATE TABLE user_settings (
  user_id       INT PRIMARY KEY,
  character_id  INT NOT NULL DEFAULT 1,
  -- Study theme (a themes.theme_key) and Light/Dark website mode are separate choices.
  theme         VARCHAR(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default',
  appearance    ENUM('dark', 'light') NOT NULL DEFAULT 'dark',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (theme) REFERENCES themes(theme_key) ON UPDATE CASCADE
);
