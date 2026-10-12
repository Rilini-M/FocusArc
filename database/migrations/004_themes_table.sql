-- Study themes move into the database.
-- * New `themes` table: the list of study themes and each theme's colors, background, symbol and
--   particle style. The frontend loads it from GET /api/themes, so a theme added here (or through
--   the admin API) appears in the theme picker without any frontend change.
-- * Seeded with the 21 existing themes, using exactly the colors the app already shows.
-- * user_settings.theme changes from a fixed ENUM to a reference to themes.theme_key.
--   Existing values are kept as they are; no rows are deleted.
-- Run once (check first that there is no `themes` table yet):
--   mysql -u root -p focusarc < database/migrations/004_themes_table.sql
USE focusarc;

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

-- user_settings.theme: fixed ENUM -> any theme in the themes table.
ALTER TABLE user_settings
  MODIFY COLUMN theme VARCHAR(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default';

ALTER TABLE user_settings
  ADD CONSTRAINT fk_user_settings_theme FOREIGN KEY (theme) REFERENCES themes (theme_key) ON UPDATE CASCADE;
