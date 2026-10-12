const pool = require('../config/database');
const { refreshQuestStatus } = require('./questStatus.service');

// The study page sends a heartbeat about once a minute while it is open (browsers may delay
// timers in background tabs, so allow several missed beats). A session not heard from for
// longer than this is treated as abandoned — e.g. the browser crashed before it could send
// its stop request.
const STALE_AFTER_MINUTES = 5;

// Columns returned for a session. duration_seconds comes straight from the two timestamps.
const SESSION_COLUMNS = `id, quest_id, started_at, ended_at, duration_minutes,
  TIMESTAMPDIFF(SECOND, started_at, ended_at) AS duration_seconds`;

// Closes the user's abandoned open sessions, ending each at its last sign of life rather than
// now, so time after the page died is never counted. Called before any study-time read or
// change, so stale sessions are gone before anything looks at them.
async function closeStaleSessions(userId) {
  const [stale] = await pool.query(
    `SELECT id, quest_id FROM study_sessions
     WHERE user_id = ? AND ended_at IS NULL
       AND COALESCE(last_active_at, started_at) < NOW() - INTERVAL ? MINUTE`,
    [userId, STALE_AFTER_MINUTES]
  );
  if (stale.length === 0) return;

  await pool.query(
    `UPDATE study_sessions
     SET ended_at = GREATEST(started_at, COALESCE(last_active_at, started_at)),
         duration_minutes = ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, COALESCE(last_active_at, started_at))) / 60)
     WHERE id IN (?) AND ended_at IS NULL`,
    [stale.map((s) => s.id)]
  );
  for (const questId of new Set(stale.map((s) => s.quest_id))) {
    await refreshQuestStatus(questId);
  }
}

module.exports = { SESSION_COLUMNS, closeStaleSessions };
