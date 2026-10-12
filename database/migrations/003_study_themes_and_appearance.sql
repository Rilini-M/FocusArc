-- Study themes + Light/Dark appearance mode.
-- * user_settings.theme can now hold all 21 study themes.
-- * New user_settings.appearance column ('dark' or 'light'); existing users start in 'dark',
--   which is how the app looked before.
-- * The old "dark" study theme (L's grey theme) becomes the "moonlight" study theme, because
--   "Dark" is now the appearance mode. No rows are deleted.
-- Run once (check first that user_settings has no appearance column yet):
--   mysql -u root -p focusarc < database/migrations/003_study_themes_and_appearance.sql
USE focusarc;

-- 1. Allow the new theme names (keeping 'dark' for a moment so existing rows stay valid).
ALTER TABLE user_settings
  MODIFY COLUMN theme ENUM('default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk', 'sakura', 'cosmic', 'ocean', 'frost', 'ember', 'moonlight', 'academia', 'japanese-night', 'sunset', 'forest', 'lavender', 'crimson', 'neon', 'celestial', 'mist', 'twilight') NOT NULL DEFAULT 'default';

-- 2. Add the Light/Dark appearance mode.
ALTER TABLE user_settings
  ADD COLUMN appearance ENUM('dark', 'light') NOT NULL DEFAULT 'dark' AFTER theme;

-- 3. Move users of the old "dark" study theme to "moonlight".
UPDATE user_settings SET theme = 'moonlight' WHERE theme = 'dark';

-- 4. Remove 'dark' from the study theme list now that no row uses it.
ALTER TABLE user_settings
  MODIFY COLUMN theme ENUM('default', 'nature', 'cyberpunk', 'royal', 'vampire', 'sakura', 'cosmic', 'ocean', 'frost', 'ember', 'moonlight', 'academia', 'japanese-night', 'sunset', 'forest', 'lavender', 'crimson', 'neon', 'celestial', 'mist', 'twilight') NOT NULL DEFAULT 'default';
