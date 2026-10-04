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

module.exports = { getOverview, getQuestProgress };
