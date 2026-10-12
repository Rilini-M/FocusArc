const fs = require('fs');
const pool = require('../config/database');
const { success, failure } = require('../utils/responses');
const { hasReachedQuestLimit, MAX_QUESTS_PER_USER } = require('../services/questLimit.service');
const { refreshQuestStatus } = require('../services/questStatus.service');
const { closeStaleSessions } = require('../services/studySession.service');
const files = require('../services/questFiles.service');

// status is still returned (Analytics uses it) but is set by the server, never by the user.
// deadline is stored in UTC and read as "YYYY-MM-DD HH:MM:SS" (the pool uses dateStrings); the
// API sends it as an ISO instant ("2026-10-10T14:15:00Z") that the browser shows in local time.
// character_id is the quest's own companion; NULL means the character chosen in Settings.
const QUEST_COLUMNS = `id, title, description, time_required, deadline, character_id, status, created_at`;

// "2026-10-10T14:15:00.000Z" from the browser -> "2026-10-10 14:15:00" (UTC, whole seconds);
// empty -> null (no deadline). The validator has already checked the format.
function deadlineValue(deadline) {
  const value = String(deadline ?? '').trim();
  return value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
}

// A stored deadline ("2026-10-10 14:15:00", UTC) as a timestamp in ms; null without one.
function deadlineMs(deadline) {
  return deadline ? Date.parse(`${String(deadline).replace(' ', 'T')}Z`) : null;
}

// The Missing rule (isQuestMissing() in frontend/js/questShared.js is the same): an unfinished
// quest whose deadline has passed. A completed quest is never Missing, nor is a quest without
// a deadline. Worked out on every read, never stored, so extending the deadline (or completing
// the quest) takes it out of Missing, and a new deadline that passes puts it back.
function isMissing(quest, now = Date.now()) {
  const due = deadlineMs(quest.deadline);
  return quest.status !== 'COMPLETED' && due !== null && due <= now;
}

// The quest's character from the form: null when not chosen (validateQuest checked the format).
// Resolves to undefined when the character doesn't exist.
async function characterValue(characterId) {
  const value = String(characterId ?? '').trim();
  if (!value) return null;
  const [rows] = await pool.query(`SELECT id FROM characters WHERE id = ?`, [Number(value)]);
  return rows.length ? rows[0].id : undefined;
}

// API shape of one attachment. The file's location on disk is never sent to the browser.
function toAttachment(row) {
  return {
    id: row.id,
    name: row.file_name,
    type: row.file_type,
    size: row.file_size,
    url: `/api/quests/${row.quest_id}/attachments/${row.id}`,
  };
}

// Quests with their attachments (oldest attachment first) and their actual study time, in the
// given order. studied_seconds is the real time between start and stop of every finished study
// session on the quest, added up — the same numbers Analytics totals. A session still running
// is not included (the study page adds its live time on top).
async function withAttachments(questRows) {
  if (questRows.length === 0) return [];
  const questIds = questRows.map((q) => q.id);
  const [attachmentRows] = await pool.query(
    `SELECT id, quest_id, file_name, file_type, file_size FROM quest_attachments
     WHERE quest_id IN (?) ORDER BY id`,
    [questIds]
  );
  const [studyRows] = await pool.query(
    `SELECT quest_id, SUM(TIMESTAMPDIFF(SECOND, started_at, ended_at)) AS seconds
     FROM study_sessions WHERE quest_id IN (?) AND ended_at IS NOT NULL
     GROUP BY quest_id`,
    [questIds]
  );
  const studied = new Map(studyRows.map((r) => [r.quest_id, Number(r.seconds) || 0]));
  return questRows.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
    time_required: q.time_required,
    deadline: q.deadline ? `${String(q.deadline).replace(' ', 'T')}Z` : null,
    character_id: q.character_id ?? null,
    status: q.status,
    missing: isMissing(q),
    studied_seconds: studied.get(q.id) || 0,
    created_at: q.created_at,
    attachments: attachmentRows.filter((a) => a.quest_id === q.id).map(toAttachment),
  }));
}

async function findOwnQuest(questId, userId) {
  const [rows] = await pool.query(`SELECT ${QUEST_COLUMNS} FROM quests WHERE id = ? AND user_id = ?`, [questId, userId]);
  return rows[0] || null;
}

async function questResponse(questId, userId) {
  const quest = await findOwnQuest(questId, userId);
  return quest ? (await withAttachments([quest]))[0] : null;
}

// Checks every uploaded file and returns the first problem, or null.
function uploadedFilesError(uploaded) {
  for (const file of uploaded) {
    const problem = files.fileError(file);
    if (problem) return problem;
  }
  return null;
}

// Writes the checked files to disk. Returns their quest_attachments columns.
async function saveFiles(uploaded) {
  const saved = [];
  try {
    for (const file of uploaded) saved.push(await files.saveQuestFile(file));
    return saved;
  } catch (err) {
    await Promise.all(saved.map((s) => files.removeQuestFile(s.file_path)));
    throw err;
  }
}

async function insertAttachments(connection, questId, saved) {
  if (saved.length === 0) return;
  await connection.query(
    `INSERT INTO quest_attachments (quest_id, file_name, file_path, file_type, file_size) VALUES ?`,
    [saved.map((s) => [questId, s.file_name, s.file_path, s.file_type, s.file_size])]
  );
}

// IDs from a form field sent once or several times ("removeAttachments").
function idList(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

// GET /api/quests — the user's latest quests, newest first, with their attachments.
async function list(req, res, next) {
  try {
    // An abandoned session (crashed browser) is closed first, so its time counts.
    await closeStaleSessions(req.user.id);
    const [rows] = await pool.query(
      `SELECT ${QUEST_COLUMNS} FROM quests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      [req.user.id, MAX_QUESTS_PER_USER]
    );
    return success(res, await withAttachments(rows));
  } catch (err) {
    return next(err);
  }
}

// POST /api/quests — multipart/form-data: title, description, timeRequired, optional
// deadline, optional characterId and 0–5 "files".
async function create(req, res, next) {
  const uploaded = req.files || [];
  let saved = [];
  let connection;
  try {
    if (await hasReachedQuestLimit(req.user.id)) {
      return failure(res, `You have reached the maximum of ${MAX_QUESTS_PER_USER} quests.`, 409);
    }
    if (uploaded.length > files.MAX_FILES) return failure(res, files.TOO_MANY_FILES);
    const problem = uploadedFilesError(uploaded);
    if (problem) return failure(res, problem);

    const characterId = await characterValue(req.body.characterId);
    if (characterId === undefined) return failure(res, 'That character no longer exists.');

    saved = await saveFiles(uploaded);

    const { title, description, timeRequired, deadline } = req.body;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO quests (user_id, title, description, time_required, deadline, character_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, title.trim(), description.trim(), Number(timeRequired), deadlineValue(deadline), characterId]
    );
    await insertAttachments(connection, result.insertId, saved);
    await connection.commit();

    return success(res, await questResponse(result.insertId, req.user.id), 201);
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    await Promise.all(saved.map((s) => files.removeQuestFile(s.file_path))); // no unused files
    return next(err);
  } finally {
    if (connection) connection.release();
  }
}

// PUT /api/quests/:id — same fields as create, plus removeAttachments (attachment ids, sent
// once per id). Attachments not listed there are kept; new "files" are added. The quest can
// never end up with more than 5 attachments.
async function update(req, res, next) {
  const uploaded = req.files || [];
  let saved = [];
  let connection;
  try {
    const existing = await findOwnQuest(req.params.id, req.user.id);
    if (!existing) return failure(res, 'Quest not found.', 404);

    const [current] = await pool.query(`SELECT id, file_path FROM quest_attachments WHERE quest_id = ?`, [existing.id]);
    const removeIds = idList(req.body.removeAttachments);
    const removed = current.filter((a) => removeIds.includes(a.id));
    if (current.length - removed.length + uploaded.length > files.MAX_FILES) {
      return failure(res, files.TOO_MANY_FILES);
    }
    const problem = uploadedFilesError(uploaded);
    if (problem) return failure(res, problem);
    const characterId = await characterValue(req.body.characterId);
    if (characterId === undefined) return failure(res, 'That character no longer exists.');

    saved = await saveFiles(uploaded);

    const { title, description, timeRequired, deadline } = req.body;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
      `UPDATE quests SET title = ?, description = ?, time_required = ?, deadline = ?, character_id = ? WHERE id = ? AND user_id = ?`,
      [title.trim(), description.trim(), Number(timeRequired), deadlineValue(deadline), characterId, existing.id, req.user.id]
    );
    if (removed.length > 0) {
      await connection.query(`DELETE FROM quest_attachments WHERE quest_id = ? AND id IN (?)`, [
        existing.id,
        removed.map((a) => a.id),
      ]);
    }
    await insertAttachments(connection, existing.id, saved);
    await connection.commit();
    connection.release();
    connection = null;

    // Removed files are deleted only once no row points at them any more.
    await Promise.all(removed.map((a) => files.removeQuestFile(a.file_path)));

    // A shorter time_required may mean the time already studied now completes the quest.
    await refreshQuestStatus(existing.id);

    return success(res, await questResponse(existing.id, req.user.id));
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    await Promise.all(saved.map((s) => files.removeQuestFile(s.file_path)));
    return next(err);
  } finally {
    if (connection) connection.release();
  }
}

// PATCH /api/quests/:id/deadline — Extend Deadline: { deadline } (an ISO UTC instant). Only the
// owner's own quest; only the deadline changes (character, files, estimate and study sessions
// are untouched). The new deadline must be later than the current one and in the future. A
// completed quest can't be reopened this way, and a quest without a deadline has none to extend.
async function extendDeadline(req, res, next) {
  try {
    const existing = await findOwnQuest(req.params.id, req.user.id);
    if (!existing) return failure(res, 'Quest not found.', 404);
    if (existing.status === 'COMPLETED') {
      return failure(res, 'This quest is completed. Its deadline can no longer be changed.', 409);
    }
    if (!existing.deadline) return failure(res, 'This quest has no deadline to extend.');

    const newDeadline = deadlineValue(req.body.deadline);
    const newMs = deadlineMs(newDeadline);
    if (newMs <= deadlineMs(existing.deadline)) {
      return failure(res, 'The new deadline must be later than the current deadline.');
    }
    if (newMs <= Date.now()) return failure(res, 'The new deadline must be in the future.');

    // `status <> 'COMPLETED'` guards against the quest completing between the check and here.
    const [result] = await pool.query(
      `UPDATE quests SET deadline = ? WHERE id = ? AND user_id = ? AND status <> 'COMPLETED'`,
      [newDeadline, existing.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return failure(res, 'This quest is completed. Its deadline can no longer be changed.', 409);
    }

    return success(res, await questResponse(existing.id, req.user.id));
  } catch (err) {
    return next(err);
  }
}

// GET /api/quests/:id/attachments/:attachmentId — opens one file, for the quest's owner only.
async function attachment(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT a.file_name, a.file_path FROM quest_attachments a
       JOIN quests q ON q.id = a.quest_id
       WHERE a.id = ? AND a.quest_id = ? AND q.user_id = ?`,
      [req.params.attachmentId, req.params.id, req.user.id]
    );
    const row = rows[0];
    const absolute = row && files.storedFilePath(row.file_path);
    if (!absolute || !fs.existsSync(absolute)) return failure(res, 'Attachment not found.', 404);

    res.set(files.downloadHeaders(row.file_path, row.file_name));
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

    const [attachments] = await pool.query(`SELECT file_path FROM quest_attachments WHERE quest_id = ?`, [existing.id]);
    // Attachment rows go with the quest (ON DELETE CASCADE); then their files are deleted.
    await pool.query(`DELETE FROM quests WHERE id = ? AND user_id = ?`, [existing.id, req.user.id]);
    await Promise.all(attachments.map((a) => files.removeQuestFile(a.file_path)));

    return success(res, {});
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, extendDeadline, attachment, remove };
