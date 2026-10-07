const fs = require('fs');
const pool = require('../config/database');
const { success, failure } = require('../utils/responses');
const { hasReachedQuestLimit, MAX_QUESTS_PER_USER } = require('../services/questLimit.service');
const { refreshQuestStatus } = require('../services/questStatus.service');
const files = require('../services/questFiles.service');

// status is still returned (Analytics uses it) but is set by the server, never by the user.
const QUEST_COLUMNS = `id, title, description, time_required, status, file_name, file_type, file_size, file_path, created_at`;

// API shape of a quest. The file's location on disk is never sent to the browser.
function toQuest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    time_required: row.time_required,
    status: row.status,
    created_at: row.created_at,
    attachment: row.file_path
      ? { name: row.file_name, type: row.file_type, size: row.file_size, url: `/api/quests/${row.id}/attachment` }
      : null,
  };
}

async function findOwnQuest(questId, userId) {
  const [rows] = await pool.query(`SELECT ${QUEST_COLUMNS} FROM quests WHERE id = ? AND user_id = ?`, [questId, userId]);
  return rows[0] || null;
}

// GET /api/quests — the user's latest quests, newest first.
async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT ${QUEST_COLUMNS} FROM quests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      [req.user.id, MAX_QUESTS_PER_USER]
    );
    return success(res, rows.map(toQuest));
  } catch (err) {
    return next(err);
  }
}

// POST /api/quests — multipart/form-data: title, description, timeRequired and an optional file.
async function create(req, res, next) {
  let saved = null;
  try {
    if (await hasReachedQuestLimit(req.user.id)) {
      return failure(res, `You have reached the maximum of ${MAX_QUESTS_PER_USER} quests.`, 409);
    }

    if (req.file) {
      const problem = files.fileError(req.file);
      if (problem) return failure(res, problem);
      saved = await files.saveQuestFile(req.file);
    }

    const { title, description, timeRequired } = req.body;
    const [result] = await pool.query(
      `INSERT INTO quests (user_id, title, description, time_required, file_name, file_path, file_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        title.trim(),
        description.trim(),
        Number(timeRequired),
        saved && saved.file_name,
        saved && saved.file_path,
        saved && saved.file_type,
        saved && saved.file_size,
      ]
    );

    return success(res, toQuest(await findOwnQuest(result.insertId, req.user.id)), 201);
  } catch (err) {
    if (saved) await files.removeQuestFile(saved.file_path); // don't leave an unused file behind
    return next(err);
  }
}

// PUT /api/quests/:id — same fields as create. A new file replaces the old one;
// removeAttachment=true removes it.
async function update(req, res, next) {
  let saved = null;
  try {
    const existing = await findOwnQuest(req.params.id, req.user.id);
    if (!existing) return failure(res, 'Quest not found.', 404);

    if (req.file) {
      const problem = files.fileError(req.file);
      if (problem) return failure(res, problem);
      saved = await files.saveQuestFile(req.file);
    }

    const removeAttachment = req.body.removeAttachment === 'true' || req.body.removeAttachment === true;
    const replacesFile = Boolean(saved) || removeAttachment;
    const fileColumns = saved || { file_name: null, file_path: null, file_type: null, file_size: null };

    const { title, description, timeRequired } = req.body;
    await pool.query(
      `UPDATE quests SET title = ?, description = ?, time_required = ?
       ${replacesFile ? ', file_name = ?, file_path = ?, file_type = ?, file_size = ?' : ''}
       WHERE id = ? AND user_id = ?`,
      [
        title.trim(),
        description.trim(),
        Number(timeRequired),
        ...(replacesFile ? [fileColumns.file_name, fileColumns.file_path, fileColumns.file_type, fileColumns.file_size] : []),
        req.params.id,
        req.user.id,
      ]
    );

    // The old file is deleted only once the quest no longer points at it.
    if (replacesFile && existing.file_path) await files.removeQuestFile(existing.file_path);

    // A shorter time_required may mean the time already studied now completes the quest.
    await refreshQuestStatus(existing.id);

    return success(res, toQuest(await findOwnQuest(existing.id, req.user.id)));
  } catch (err) {
    if (saved) await files.removeQuestFile(saved.file_path);
    return next(err);
  }
}

// GET /api/quests/:id/attachment — opens/downloads the quest's file, for its owner only.
async function attachment(req, res, next) {
  try {
    const quest = await findOwnQuest(req.params.id, req.user.id);
    const absolute = quest && files.storedFilePath(quest.file_path);
    if (!absolute || !fs.existsSync(absolute)) return failure(res, 'Attachment not found.', 404);

    const { contentType, disposition } = files.downloadInfo(quest.file_path, quest.file_name);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'X-Content-Type-Options': 'nosniff',
      // Files opened in the browser can't run scripts or reach the rest of the app.
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    return res.sendFile(absolute);
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

    const existing = await findOwnQuest(req.params.id, req.user.id);
    if (!existing) return failure(res, 'Quest not found.', 404);

    await pool.query(`DELETE FROM quests WHERE id = ? AND user_id = ?`, [existing.id, req.user.id]);
    if (existing.file_path) await files.removeQuestFile(existing.file_path);

    return success(res, {});
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, attachment, remove };
