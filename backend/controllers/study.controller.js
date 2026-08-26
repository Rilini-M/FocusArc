const pool = require('../config/database');
const { success, failure } = require('../utils/responses');

async function create(req, res, next) {
  try {
    const { questId, startedAt, endedAt, durationMinutes } = req.body;

    if (!startedAt) {
      return failure(res, 'startedAt is required.');
    }

    if (questId) {
      const [questRows] = await pool.query(
        `SELECT id FROM quests WHERE id = ? AND user_id = ?`,
        [questId, req.user.id]
      );
      if (questRows.length === 0) {
        return failure(res, 'Quest not found.', 404);
      }
    }

    const [result] = await pool.query(
      `INSERT INTO study_sessions (user_id, quest_id, started_at, ended_at, duration_minutes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, questId || null, startedAt, endedAt || null, durationMinutes || null]
    );

    const [rows] = await pool.query(`SELECT * FROM study_sessions WHERE id = ?`, [
      result.insertId,
    ]);

    return success(res, rows[0], 201);
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, quest_id, started_at, ended_at, duration_minutes, created_at
       FROM study_sessions WHERE user_id = ? ORDER BY started_at DESC`,
      [req.user.id]
    );
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
}

async function summary(req, res, next) {
  try {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(duration_minutes), 0) AS totalMinutes, COUNT(*) AS sessionCount
       FROM study_sessions WHERE user_id = ? AND duration_minutes IS NOT NULL`,
      [req.user.id]
    );

    return success(res, {
      hasData: row.sessionCount > 0,
      totalMinutes: Number(row.totalMinutes) || 0,
      sessionCount: Number(row.sessionCount) || 0,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, summary };
