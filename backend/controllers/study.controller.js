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

// Starts a live-tracked session (Quest Board's Start Study button). A user may only have
// one open session (ended_at IS NULL) at a time — enforced here, not just in the UI.
async function startSession(req, res, next) {
  try {
    const { questId } = req.body;

    const [activeRows] = await pool.query(
      `SELECT id FROM study_sessions WHERE user_id = ? AND ended_at IS NULL LIMIT 1`,
      [req.user.id]
    );
    if (activeRows.length > 0) {
      return failure(
        res,
        'You already have an active study session. Stop it before starting another.',
        409
      );
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
      `INSERT INTO study_sessions (user_id, quest_id, started_at) VALUES (?, ?, NOW())`,
      [req.user.id, questId || null]
    );

    const [rows] = await pool.query(`SELECT * FROM study_sessions WHERE id = ?`, [
      result.insertId,
    ]);
    return success(res, rows[0], 201);
  } catch (err) {
    return next(err);
  }
}

// Stops the caller's own open session. duration_minutes is rounded (not truncated) so a
// short session doesn't collapse to a misleading 0, and floors at 1 minute.
async function stopSession(req, res, next) {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      `SELECT id FROM study_sessions WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return failure(res, 'Active study session not found.', 404);
    }

    await pool.query(
      `UPDATE study_sessions
       SET ended_at = NOW(),
           duration_minutes = GREATEST(1, ROUND(TIMESTAMPDIFF(SECOND, started_at, NOW()) / 60))
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    const [rows] = await pool.query(`SELECT * FROM study_sessions WHERE id = ?`, [id]);
    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

// Lets the frontend restore a running timer after navigation or a full page refresh,
// using the real started_at rather than any client-side clock.
async function activeSession(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, quest_id, started_at FROM study_sessions WHERE user_id = ? AND ended_at IS NULL LIMIT 1`,
      [req.user.id]
    );
    return success(res, rows[0] || null);
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, list, summary, startSession, stopSession, activeSession };
