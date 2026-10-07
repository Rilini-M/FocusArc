const pool = require('../config/database');
const anilist = require('../services/anilist.service');
const { detectTraits, buildPersonality } = require('../services/characterQuotes.service');
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

// Saves an imported character's motivational quotes and its trait line (shown under the name,
// like "Brave and loyal."). Runs inside the caller's transaction.
async function savePersonality(connection, characterId, personality) {
  await connection.query(`INSERT INTO quotes (character_id, quote_text) VALUES ?`, [
    personality.quotes.map((quote) => [characterId, quote]),
  ]);
  await connection.query(`UPDATE characters SET description = ? WHERE id = ?`, [personality.traitLine, characterId]);
}

// Validates one AniList character and saves it together with its motivational quotes.
// Shared by the single and the bulk import.
// Returns { status: 'imported' | 'exists' | 'invalid', message, character }.
async function saveCharacter(input) {
  const externalApiId = Number(input.externalApiId);
  const name = text(input.name);
  const imageUrl = text(input.imageUrl);
  // Traits come from the AniList description (see anilist.service.js); unknown values are ignored.
  const traits = Array.isArray(input.traits) ? input.traits.filter((t) => typeof t === 'string') : [];

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

  const [existing] = await pool.query(`SELECT id FROM characters WHERE external_api_id = ?`, [externalApiId]);
  if (existing.length > 0) {
    return { status: 'exists', message: 'Character already exists.' };
  }

  // Character names are unique in the table (the Character Guide and theme picker look them up by name).
  const [sameName] = await pool.query(`SELECT id FROM characters WHERE name = ?`, [name]);
  if (sameName.length > 0) {
    return { status: 'exists', message: `A character named "${name}" already exists.` };
  }

  const personality = buildPersonality({ id: externalApiId, traits });

  // The character and its quotes are saved together: either both are stored or neither is.
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO characters (external_api_id, name, description, image_path) VALUES (?, ?, ?, ?)`,
      [externalApiId, name, personality.traitLine, imageUrl]
    );
    await savePersonality(connection, result.insertId, personality);
    await connection.commit();
    return {
      status: 'imported',
      character: { id: result.insertId, external_api_id: externalApiId, name, description: personality.traitLine, image_path: imageUrl },
    };
  } catch (err) {
    if (connection) await connection.rollback();
    // Two imports of the same character at the same moment: the UNIQUE index still blocks the duplicate.
    if (err.code === 'ER_DUP_ENTRY') return { status: 'exists', message: 'Character already exists.' };
    throw err;
  } finally {
    if (connection) connection.release();
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
    return failure(res, 'A bulk import or quote update is already running. Please wait for it to finish.', 409);
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

// Adds motivational quotes to imported characters that have none (for example characters
// imported before quotes existed). Characters that already have quotes are never touched, so
// running it again creates no duplicates. Full descriptions are fetched from AniList in groups of
// 50; if AniList cannot be reached, the description saved in MySQL is used instead.
// Returns { total, updated, usedSavedDescription }.
async function addMissingQuotes() {
  const [rows] = await pool.query(
    `SELECT c.id, c.external_api_id, c.description FROM characters c
     WHERE c.external_api_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.character_id = c.id)
     ORDER BY c.id`
  );
  const counts = { total: rows.length, updated: 0, usedSavedDescription: 0 };

  for (let i = 0; i < rows.length; i += BULK_PAGE_SIZE) {
    if (i > 0) await pause(BULK_PAUSE_MS);
    const group = rows.slice(i, i + BULK_PAGE_SIZE);

    const traitsById = new Map();
    try {
      const found = await anilist.fetchCharactersByIds(group.map((row) => row.external_api_id));
      found.forEach((c) => traitsById.set(c.externalApiId, c.traits));
    } catch (err) {
      if (!err.status) throw err;
      console.error('Quote update: AniList unavailable, using saved descriptions.', err.message);
    }

    for (const row of group) {
      let traits = traitsById.get(row.external_api_id);
      if (!traits) {
        traits = detectTraits(row.description);
        counts.usedSavedDescription += 1;
      }
      const personality = buildPersonality({ id: row.external_api_id, traits });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // Lock the character, then re-check, so two runs at once cannot both add quotes.
        await connection.query(`SELECT id FROM characters WHERE id = ? FOR UPDATE`, [row.id]);
        const [[{ quoteCount }]] = await connection.query(
          `SELECT COUNT(*) AS quoteCount FROM quotes WHERE character_id = ?`,
          [row.id]
        );
        if (quoteCount === 0) {
          await savePersonality(connection, row.id, personality);
          counts.updated += 1;
        }
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
  }

  return counts;
}

// POST /api/admin/characters/generate-quotes
async function generateMissingQuotes(req, res, next) {
  if (bulkImportRunning) {
    return failure(res, 'A bulk import or quote update is already running. Please wait for it to finish.', 409);
  }
  bulkImportRunning = true;
  try {
    return success(res, await addMissingQuotes());
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

module.exports = {
  fetchFromApi,
  importCharacter,
  importBulk,
  generateMissingQuotes,
  addMissingQuotes,
  listImported,
  updateDescription,
  remove,
};
