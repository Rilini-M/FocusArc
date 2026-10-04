const pool = require('../config/database');

const MAX_QUESTS_PER_USER = 10;

async function hasReachedQuestLimit(userId) {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM quests WHERE user_id = ?', [
    userId,
  ]);
  return rows[0].count >= MAX_QUESTS_PER_USER;
}

module.exports = { MAX_QUESTS_PER_USER, hasReachedQuestLimit };
