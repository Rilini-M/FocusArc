-- Adds the role column to an existing FocusArc database (fresh installs get it from schema.sql).
-- Safe for existing data: no rows are deleted, and every existing user becomes 'USER'
-- through the column default. Run once:
--   mysql -u root -p focusarc < database/migrations/001_add_user_role.sql
USE focusarc;

ALTER TABLE users
  ADD COLUMN role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';
