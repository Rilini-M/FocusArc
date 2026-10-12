-- Study sessions remember when their study page was last seen alive.
-- * New study_sessions.last_active_at: set when a session starts and refreshed by the study
--   page about once a minute (POST /api/study-sessions/:id/heartbeat) while it is open.
-- * Closing the study page stops its session right away. If the browser crashes or the
--   computer dies before it can, the server closes the session itself once it has not been
--   seen for a few minutes, ending it at last_active_at, so it never keeps counting.
-- * Sessions left open before this migration have no last_active_at; the server treats their
--   started_at as the last activity, so they are closed with no study time added.
-- Run once (check first that study_sessions has no last_active_at column yet):
--   mysql -u root -p focusarc < database/migrations/007_study_session_last_active.sql
USE focusarc;

ALTER TABLE study_sessions
  ADD COLUMN last_active_at DATETIME NULL AFTER ended_at;
