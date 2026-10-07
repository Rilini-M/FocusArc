const pool = require('../config/database');
const jikan = require('../services/jikan.service');
const { success, failure } = require('../utils/responses');

const NAME_MAX = 100; // characters.name column size
const DESCRIPTION_MAX = 500;
const DEFAULT_CHARACTER_ID = 1; // user_settings.character_id default (a built-in character)

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// GET /api/admin/characters/api?page=1&limit=25&search=naruto
// Fetches one page from Jikan and marks which results are already in our database.
async function fetchFromApi(req, res, next) {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || jikan.MAX_LIMIT);
  const search = text(req.query.search);

  if (!Number.isInteger(page) || page < 1) {
    return failure(res, 'Page must be a whole number of 1 or more.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > jikan.MAX_LIMIT) {
    return failure(res, `Limit must be between 1 and ${jikan.MAX_LIMIT}.`);
  }
  if (search && search.length < 3) {
    return failure(res, 'Search must be at least 3 characters.');
  }

  let result;
  try {
    result = await jikan.fetchCharacters({ page, limit, search });
  } catch (err) {
    // Jikan problems (down, timeout, rate limit) are reported to the admin and never crash the server.
    if (err.status) return failure(res, err.message, err.status);
    return next(err);
  }

  try {
    const ids = result.characters.map((c) => c.externalApiId);
    let importedIds = new Set();
    if (ids.length > 0) {
      const [rows] = await pool.query(
        `SELECT external_api_id FROM characters WHERE external_api_id IN (?)`,
        [ids]
      );
      importedIds = new Set(rows.map((row) => row.external_api_id));
    }

    result.characters = result.characters.map((c) => ({ ...c, alreadyImported: importedIds.has(c.externalApiId) }));
    return success(res, result);
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/characters/import  { externalApiId, name, imageUrl, description }
async function importCharacter(req, res, next) {
  try {
    const externalApiId = Number(req.body.externalApiId);
    const name = text(req.body.name);
    const imageUrl = text(req.body.imageUrl);
    const description = text(req.body.description);

    if (!Number.isInteger(externalApiId) || externalApiId < 1) {
      return failure(res, 'A valid Jikan character id is required.');
    }
    if (!name || name.length > NAME_MAX) {
      return failure(res, `Character name is required and must be ${NAME_MAX} characters or fewer.`);
    }
    if (!/^https:\/\/\S+$/.test(imageUrl) || imageUrl.length > 255) {
      return failure(res, 'This character has no usable image, so it cannot be imported.');
    }
    if (description.length > DESCRIPTION_MAX) {
      return failure(res, `Description must be ${DESCRIPTION_MAX} characters or fewer.`);
    }

    const [existing] = await pool.query(`SELECT id FROM characters WHERE external_api_id = ?`, [externalApiId]);
    if (existing.length > 0) {
      return failure(res, 'Character already exists.', 409);
    }

    // Character names are unique in the table (the Character Guide and theme picker look them up by name).
    const [sameName] = await pool.query(`SELECT id FROM characters WHERE name = ?`, [name]);
    if (sameName.length > 0) {
      return failure(res, `A character named "${name}" already exists.`, 409);
    }

    const [result] = await pool.query(
      `INSERT INTO characters (external_api_id, name, description, image_path) VALUES (?, ?, ?, ?)`,
      [externalApiId, name, description, imageUrl]
    );

    return success(res, { id: result.insertId, external_api_id: externalApiId, name, description, image_path: imageUrl }, 201);
  } catch (err) {
    // Two imports of the same character at the same moment: the UNIQUE index still blocks the duplicate.
    if (err.code === 'ER_DUP_ENTRY') return failure(res, 'Character already exists.', 409);
    return next(err);
  }
}

// GET /api/admin/characters: characters imported from Jikan (built-ins are not listed).
async function listImported(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, external_api_id, name, description, image_path
       FROM characters WHERE external_api_id IS NOT NULL ORDER BY name ASC`
    );
    return success(res, rows);
  } catch (err) {
    return next(err);
  }
}

// PUT /api/admin/characters/:id  { description }
async function updateDescription(req, res, next) {
  try {
    const description = text(req.body.description);
    if (description.length > DESCRIPTION_MAX) {
      return failure(res, `Description must be ${DESCRIPTION_MAX} characters or fewer.`);
    }

    const [result] = await pool.query(
      `UPDATE characters SET description = ? WHERE id = ? AND external_api_id IS NOT NULL`,
      [description, req.params.id]
    );
    if (result.affectedRows === 0) {
      return failure(res, 'Imported character not found.', 404);
    }

    return success(res, { id: Number(req.params.id), description });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/characters/:id
// Only imported characters can be deleted, so the built-in default companion always exists.
// Users who had picked the deleted character are moved back to the default one first, because
// user_settings.character_id must point at an existing character.
async function remove(req, res, next) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id FROM characters WHERE id = ? AND external_api_id IS NOT NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return failure(res, 'Imported character not found.', 404);
    }

    await connection.query(`UPDATE user_settings SET character_id = ? WHERE character_id = ?`, [
      DEFAULT_CHARACTER_ID,
      req.params.id,
    ]);
    await connection.query(`DELETE FROM characters WHERE id = ?`, [req.params.id]);

    await connection.commit();
    return success(res, {});
  } catch (err) {
    if (connection) await connection.rollback();
    return next(err);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { fetchFromApi, importCharacter, listImported, updateDescription, remove };
