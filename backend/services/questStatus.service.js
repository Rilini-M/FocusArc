const pool = require('../config/database');

// Quest status is no longer picked by the user (the Quest Board shows no status). The server
// keeps it up to date from the quest's study sessions, so Analytics (completed quests,
// completion rate, quest progress and distribution) still has meaningful data:
//   TODO        — no study session on the quest yet
//   IN_PROGRESS — at least one study session started on it
//   COMPLETED   — finished sessions add up to at least the quest's time_required
// Status only ever moves forward, so earlier progress (including statuses set before this
// change) is never undone.
async function refreshQuestStatus(questId) {
  if (!questId) return;
  await pool.query(
    `UPDATE quests q
     SET q.status = CASE
       WHEN q.status = 'COMPLETED' THEN 'COMPLETED'
       WHEN (SELECT COALESCE(SUM(s.duration_minutes), 0) FROM study_sessions s WHERE s.quest_id = q.id) >= q.time_required
         THEN 'COMPLETED'
       WHEN EXISTS (SELECT 1 FROM study_sessions s WHERE s.quest_id = q.id) THEN 'IN_PROGRESS'
       ELSE q.status
     END
     WHERE q.id = ?`,
    [questId]
  );
}

module.exports = { refreshQuestStatus };
