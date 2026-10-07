const pool = require('../config/database');
const anilist = require('../services/anilist.service');
const { success, failure } = require('../utils/responses');

const NAME_MAX = 100; // characters.name column size
const DESCRIPTION_MAX = 500;
const DEFAULT_CHARACTER_ID = 1; // user_settings.character_id default (a built-in character)

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// GET /api/admin/characters/api?page=1&limit=25&search=naruto
// Fetches one page from AniList and marks which results are already in our database.
async function fetchFromApi(req, res, next) {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  const search = text(req.query.search);

  if (!Number.isInteger(page) || page < 1) {
    return failure(res, 'Page must be a whole number of 1 or more.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > anilist.MAX_LIMIT) {
    return failure(res, `Limit must be between 1 and ${anilist.MAX_LIMIT}.`);
  }
  if (search && search.length < 3) {
    return failure(res, 'Search must be at least 3 characters.');
  }

  let result;
  try {
    result = await anilist.fetchCharacters({ page, limit, search });
  } catch (err) {
    // AniList problems (down, timeout, rate limit) are reported to the admin and never crash the server.
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

// Validates one AniList character and saves it. Shared by the single and the bulk import.
// Returns { status: 'imported' | 'exists' | 'invalid', message, character }.
async function saveCharacter(input) {
  const externalApiId = Number(input.externalApiId);
  const name = text(input.name);
  const imageUrl = text(input.imageUrl);
  const description = text(input.description);

  if (!Number.isInteger(externalApiId) || externalApiId < 1) {
    return { status: 'invalid', message: 'A valid AniList character id is required.' };
  }
  if (!name || name.length > NAME_MAX) {
    return { status: 'invalid', message: `Character name is required and must be ${NAME_MAX} characters or fewer.` };
  }
  // https only, and no spaces, quotes or angle brackets, since the URL is placed in an <img src="">.
  if (!/^https:\/\/[^\s"'<>]+$/.test(imageUrl) || imageUrl.length > 255) {
    return { status: 'invalid', message: 'This character has no usable image, so it cannot be imported.' };
  }
  if (description.length > DESCRIPTION_MAX) {
    return { status: 'invalid', message: `Description must be ${DESCRIPTION_MAX} characters or fewer.` };
  }

  const [existing] = await pool.query(`SELECT id FROM characters WHERE external_api_id = ?`, [externalApiId]);
  if (existing.length > 0) {
    return { status: 'exists', message: 'Character already exists.' };
  }

  // Character names are unique in the table (the Character Guide and theme picker look them up by name).
  const [sameName] = await pool.query(`SELECT id FROM characters WHERE name = ?`, [name]);
  if (sameName.length > 0) {
    return { status: 'exists', message: `A character named "${name}" already exists.` };
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO characters (external_api_id, name, description, image_path) VALUES (?, ?, ?, ?)`,
      [externalApiId, name, description, imageUrl]
    );
    return {
      status: 'imported',
      character: { id: result.insertId, external_api_id: externalApiId, name, description, image_path: imageUrl },
    };
  } catch (err) {
    // Two imports of the same character at the same moment: the UNIQUE index still blocks the duplicate.
    if (err.code === 'ER_DUP_ENTRY') return { status: 'exists', message: 'Character already exists.' };
    throw err;
  }
}

// POST /api/admin/characters/import  { externalApiId, name, imageUrl, description }
async function importCharacter(req, res, next) {
  try {
    const outcome = await saveCharacter(req.body);
    if (outcome.status === 'invalid') return failure(res, outcome.message);
    if (outcome.status === 'exists') return failure(res, outcome.message, 409);
    return success(res, outcome.character, 201);
  } catch (err) {
    return next(err);
  }
}

const BULK_DEFAULT_TARGET = 200;
const BULK_MAX_TARGET = 500;
const BULK_PAGE_SIZE = 50; // AniList's largest page
// AniList currently allows 30 requests per minute, so wait over 2 seconds between pages.
const BULK_PAUSE_MS = 2100;
const MAX_RETRY_WAIT_SECONDS = 60;
const ANILIST_MAX_PAGES = 100; // AniList only serves the first 5,000 results (100 pages of 50)
let bulkImportRunning = false;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One AniList page; if AniList says "too many requests", wait as long as it asks (up to a
// minute) and try once more.
async function fetchBulkPage(page) {
  try {
    return await anilist.fetchCharacters({ page, limit: BULK_PAGE_SIZE });
  } catch (err) {
    if (err.status !== 429) throw err;
    await pause(Math.min(err.retryAfterSeconds || MAX_RETRY_WAIT_SECONDS, MAX_RETRY_WAIT_SECONDS) * 1000);
    return anilist.fetchCharacters({ page, limit: BULK_PAGE_SIZE });
  }
}

// POST /api/admin/characters/import-bulk  { target: 200 }
// Walks AniList's most-popular characters page by page (one request at a time) and imports
// new ones until `target` characters were imported or AniList has no more pages. Existing
// characters are skipped, so running it again only adds characters that are not in the database yet.
async function importBulk(req, res, next) {
  const target = Number(req.body.target || BULK_DEFAULT_TARGET);
  if (!Number.isInteger(target) || target < 1 || target > BULK_MAX_TARGET) {
    return failure(res, `Target must be between 1 and ${BULK_MAX_TARGET}.`);
  }
  if (bulkImportRunning) {
    return failure(res, 'A bulk import is already running. Please wait for it to finish.', 409);
  }

  bulkImportRunning = true;
  const counts = { imported: 0, skipped: 0, failed: 0 };
  let pagesFetched = 0;
  let stoppedEarly = null;

  try {
    // Characters imported earlier sit on the first pages and will be skipped, so allow enough
    // pages to get past them (plus a little room for names that clash or have no image).
    const [[{ alreadyImported }]] = await pool.query(
      `SELECT COUNT(*) AS alreadyImported FROM characters WHERE external_api_id IS NOT NULL`
    );
    const maxPages = Math.min(Math.ceil((alreadyImported + target) / BULK_PAGE_SIZE) + 2, ANILIST_MAX_PAGES);

    for (let page = 1; page <= maxPages && counts.imported < target; page++) {
      if (page > 1) await pause(BULK_PAUSE_MS);

      let result;
      try {
        result = await fetchBulkPage(page);
      } catch (err) {
        if (!err.status) throw err;
        // Nothing fetched at all: report that AniList could not be reached. Nothing was imported.
        if (pagesFetched === 0) return failure(res, `Bulk import failed: ${err.message}`, err.status);
        // AniList failed part-way: keep what was imported and say why it stopped.
        stoppedEarly = err.message;
        break;
      }
      pagesFetched += 1;

      for (const character of result.characters) {
        if (counts.imported >= target) break;
        try {
          const outcome = await saveCharacter(character);
          if (outcome.status === 'imported') counts.imported += 1;
          else if (outcome.status === 'exists') counts.skipped += 1;
          else counts.failed += 1;
        } catch (err) {
          console.error('Bulk import could not save character', character.externalApiId, err.message);
          counts.failed += 1;
        }
      }

      if (!result.pagination.hasNextPage) break;
    }

    return success(res, { ...counts, target, pagesFetched, stoppedEarly });
  } catch (err) {
    return next(err);
  } finally {
    bulkImportRunning = false;
  }
}

// GET /api/admin/characters: imported characters (built-ins are not listed).
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

module.exports = { fetchFromApi, importCharacter, importBulk, listImported, updateDescription, remove };
