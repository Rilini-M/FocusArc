const pool = require('../config/database');
const { closeStaleSessions } = require('./studySession.service');

async function getOverview(userId) {
  const [[questCounts]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'COMPLETED') AS completed
     FROM quests WHERE user_id = ?`,
    [userId]
  );

  // Study time is the real time between each finished session's start and end (an open
  // session counts once it is stopped). Abandoned sessions are closed first so they count too.
  await closeStaleSessions(userId);
  const [[studyTime]] = await pool.query(
    `SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)), 0) AS totalSeconds, COUNT(*) AS sessionCount
     FROM study_sessions WHERE user_id = ? AND ended_at IS NOT NULL`,
    [userId]
  );

  const [streakRows] = await pool.query(
    `SELECT DISTINCT DATE(started_at) AS study_date
     FROM study_sessions WHERE user_id = ?
     ORDER BY study_date DESC`,
    [userId]
  );

  const total = Number(questCounts.total) || 0;
  const completed = Number(questCounts.completed) || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasStudyData = studyTime.sessionCount > 0;

  return {
    totalQuests: total,
    completedQuests: completed,
    completionRate,
    studyTimeMinutes: Math.floor(Number(studyTime.totalSeconds) / 60) || 0,
    hasStudyData,
    studyStreakDays: hasStudyData ? computeStreak(streakRows.map((r) => r.study_date)) : 0,
  };
}

function computeStreak(datesDesc) {
  if (datesDesc.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = today;
  let streak = 0;

  const dateSet = new Set(datesDesc.map((d) => new Date(d).toDateString()));

  // Streak counts backward from today (or yesterday, if nothing logged today yet).
  if (!dateSet.has(cursor.toDateString())) {
    cursor = new Date(cursor.getTime() - 86400000);
  }

  while (dateSet.has(cursor.toDateString())) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  return streak;
}

async function getQuestProgress(userId) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM quests WHERE user_id = ? GROUP BY status`,
    [userId]
  );

  const progress = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 };
  rows.forEach((r) => {
    progress[r.status] = Number(r.count);
  });

  const total = progress.TODO + progress.IN_PROGRESS + progress.COMPLETED;

  return { hasData: total > 0, total, progress };
}

// All of the user's study sessions, for the Analytics page's total study time, daily activity,
// streak and per-quest session counts. Times are exact instants (ms since 1970, UTC), so the browser
// can group them into the user's own local days. A running session has end_ms null (the page
// counts it up to now). quest_id is null for sessions of deleted quests; their time still
// counts. Abandoned sessions are closed first, like everywhere else study time is read.
async function getSessions(userId) {
  await closeStaleSessions(userId);
  const [rows] = await pool.query(
    `SELECT id, quest_id,
            UNIX_TIMESTAMP(started_at) * 1000 AS start_ms,
            IF(ended_at IS NULL, NULL, UNIX_TIMESTAMP(ended_at) * 1000) AS end_ms
     FROM study_sessions
     WHERE user_id = ?
     ORDER BY started_at`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    quest_id: r.quest_id,
    start_ms: Math.round(Number(r.start_ms)),
    end_ms: r.end_ms === null ? null : Math.round(Number(r.end_ms)),
  }));
}

module.exports = { getOverview, getQuestProgress, getSessions };
