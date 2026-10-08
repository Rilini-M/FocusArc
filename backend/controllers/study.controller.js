const pool = require('../config/database');
const { success, failure } = require('../utils/responses');
const { refreshQuestStatus } = require('../services/questStatus.service');
const { SESSION_COLUMNS, closeStaleSessions } = require('../services/studySession.service');

// The caller's own session with this id (open or not), or null.
async function findOwnSession(id, userId) {
  if (!/^\d+$/.test(String(id))) return null;
  const [rows] = await pool.query(`SELECT ${SESSION_COLUMNS} FROM study_sessions WHERE id = ? AND user_id = ?`, [
    id,
    userId,
  ]);
  return rows[0] || null;
}

// Starts a live-tracked session (the study page's Start Study). A user may only have
// one open session (ended_at IS NULL) at a time — enforced here, not just in the UI.
async function startSession(req, res, next) {
  try {
    const { questId } = req.body;
    await closeStaleSessions(req.user.id);

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
      `INSERT INTO study_sessions (user_id, quest_id, started_at, last_active_at) VALUES (?, ?, NOW(), NOW())`,
      [req.user.id, questId || null]
    );
    // Studying a quest moves it from To Do to In Progress (used by Analytics).
    await refreshQuestStatus(questId);

    return success(res, await findOwnSession(result.insertId, req.user.id), 201);
  } catch (err) {
    return next(err);
  }
}

// Stops the caller's own session. The duration is worked out by the database from started_at
// and the stop time — nothing the browser sends is trusted. Safe to call more than once (the
// study page may send it from several page-closing events): only the first call ends the
// session; later calls change nothing and return the saved session.
async function stopSession(req, res, next) {
  try {
    const { id } = req.params;
    // A session abandoned long ago ends at its last activity, not now.
    await closeStaleSessions(req.user.id);

    const session = await findOwnSession(id, req.user.id);
    if (!session) {
      return failure(res, 'Study session not found.', 404);
    }
    if (session.ended_at) {
      return success(res, session);
    }

    // `ended_at IS NULL` makes this a no-op if another stop request got here first.
    const [result] = await pool.query(
      `UPDATE study_sessions
       SET ended_at = GREATEST(started_at, NOW()),
           last_active_at = GREATEST(started_at, NOW()),
           duration_minutes = ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, NOW())) / 60)
       WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
      [id, req.user.id]
    );
    // Enough study time completes the quest (used by Analytics).
    if (result.affectedRows > 0) await refreshQuestStatus(session.quest_id);

    return success(res, await findOwnSession(id, req.user.id));
  } catch (err) {
    return next(err);
  }
}

// Sent by the open study page about once a minute: "still studying". Returns the session, so
// the page can see if it was already ended (stopped elsewhere, or closed as stale after the
// computer slept).
async function heartbeat(req, res, next) {
  try {
    const { id } = req.params;
    await closeStaleSessions(req.user.id);

    await pool.query(
      `UPDATE study_sessions SET last_active_at = NOW() WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
      [id, req.user.id]
    );
    const session = await findOwnSession(id, req.user.id);
    if (!session) {
      return failure(res, 'Study session not found.', 404);
    }
    return success(res, session);
  } catch (err) {
    return next(err);
  }
}

// The caller's open session, if any (the Quest Board shows its running timer from the real
// started_at rather than any client-side clock).
async function activeSession(req, res, next) {
  try {
    await closeStaleSessions(req.user.id);
    const [rows] = await pool.query(
      `SELECT id, quest_id, started_at FROM study_sessions WHERE user_id = ? AND ended_at IS NULL LIMIT 1`,
      [req.user.id]
    );
    return success(res, rows[0] || null);
  } catch (err) {
    return next(err);
  }
}

module.exports = { startSession, stopSession, heartbeat, activeSession };
