const pool = require('../config/database');
const { success, failure } = require('../utils/responses');
const { hasReachedQuestLimit, MAX_QUESTS_PER_USER } = require('../services/questLimit.service');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, status FROM quests WHERE user_id = ? ORDER BY id`,
      [req.user.id]
    );
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    if (await hasReachedQuestLimit(req.user.id)) {
      return failure(res, `You have reached the maximum of ${MAX_QUESTS_PER_USER} quests.`, 409);
    }

    const { title, description, status } = req.body;

    const [result] = await pool.query(
      `INSERT INTO quests (user_id, title, description, status) VALUES (?, ?, ?, ?)`,
      [req.user.id, title.trim(), description.trim(), status || 'TODO']
    );

    const [rows] = await pool.query(
      `SELECT id, title, description, status FROM quests WHERE id = ?`,
      [result.insertId]
    );

    return success(res, rows[0], 201);
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { title, description, status } = req.body;

    const [result] = await pool.query(
      `UPDATE quests SET title = ?, description = ?, status = ?
       WHERE id = ? AND user_id = ?`,
      [title.trim(), description.trim(), status || 'TODO', req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return failure(res, 'Quest not found.', 404);
    }

    const [rows] = await pool.query(
      `SELECT id, title, description, status FROM quests WHERE id = ?`,
      [req.params.id]
    );

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;

    const [result] = await pool.query(
      `UPDATE quests SET status = ? WHERE id = ? AND user_id = ?`,
      [status, req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return failure(res, 'Quest not found.', 404);
    }

    const [rows] = await pool.query(
      `SELECT id, title, description, status FROM quests WHERE id = ?`,
      [req.params.id]
    );

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    // Deleting would orphan an open session (quest_id is SET NULL), leaving it running with
    // no Stop button on the Quest Board — so the session must be stopped first.
    const [activeRows] = await pool.query(
      `SELECT id FROM study_sessions WHERE quest_id = ? AND user_id = ? AND ended_at IS NULL LIMIT 1`,
      [req.params.id, req.user.id]
    );
    if (activeRows.length > 0) {
      return failure(res, 'Stop the active study session before deleting this quest.', 409);
    }

    const [result] = await pool.query(`DELETE FROM quests WHERE id = ? AND user_id = ?`, [
      req.params.id,
      req.user.id,
    ]);

    if (result.affectedRows === 0) {
      return failure(res, 'Quest not found.', 404);
    }

    return success(res, {});
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, updateStatus, remove };
