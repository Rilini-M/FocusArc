const pool = require('../config/database');

async function getOverview(userId) {
  const [[questCounts]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'COMPLETED') AS completed
     FROM quests WHERE user_id = ?`,
    [userId]
  );

  const [[studyTime]] = await pool.query(
    `SELECT COALESCE(SUM(duration_minutes), 0) AS totalMinutes, COUNT(*) AS sessionCount
     FROM study_sessions WHERE user_id = ? AND duration_minutes IS NOT NULL`,
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
    studyTimeMinutes: Number(studyTime.totalMinutes) || 0,
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

async function getProductivityTrend(userId, days = 7) {
  const [rows] = await pool.query(
    `SELECT DATE(started_at) AS day, COALESCE(SUM(duration_minutes), 0) AS minutes
     FROM study_sessions
     WHERE user_id = ? AND duration_minutes IS NOT NULL
       AND started_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(started_at)
     ORDER BY day ASC`,
    [userId, days]
  );

  return {
    hasData: rows.length > 0,
    trend: rows.map((r) => ({ date: r.day, minutes: Number(r.minutes) })),
  };
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

// "Focus" here means a session logged through to a real end time/duration, as opposed to
// one that was started and abandoned — this is the only completion signal the schema
// actually captures, so it's what the ratio is built from (no fabricated study/break split).
async function getFocusRatio(userId) {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS totalSessions,
       SUM(duration_minutes IS NOT NULL) AS completedSessions,
       COALESCE(SUM(duration_minutes), 0) AS focusMinutes
     FROM study_sessions WHERE user_id = ?`,
    [userId]
  );

  const totalSessions = Number(row.totalSessions) || 0;
  const completedSessions = Number(row.completedSessions) || 0;

  return {
    hasData: totalSessions > 0,
    totalSessions,
    completedSessions,
    focusMinutes: Number(row.focusMinutes) || 0,
    focusRatio: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
  };
}

module.exports = { getOverview, getProductivityTrend, getQuestProgress, getFocusRatio };
