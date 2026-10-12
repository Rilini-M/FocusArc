const pool = require('../config/database');
const { success, failure } = require('../utils/responses');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// GET /api/characters
// - With ?page, ?limit or ?search (Character Guide): one page of characters plus pagination info.
// - Without them (Settings, theme picker): the full list, exactly as before.
async function list(req, res, next) {
  const { page: pageParam, limit: limitParam, search: searchParam } = req.query;

  try {
    if (pageParam === undefined && limitParam === undefined && searchParam === undefined) {
      const [rows] = await pool.query(
        `SELECT id, name, description, image_path FROM characters ORDER BY id ASC`
      );
      return success(res, rows);
    }

    const page = Number(pageParam || 1);
    const limit = Number(limitParam || DEFAULT_PAGE_SIZE);
    const search = typeof searchParam === 'string' ? searchParam.trim() : '';

    if (!Number.isInteger(page) || page < 1) {
      return failure(res, 'Page must be a whole number of 1 or more.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return failure(res, `Limit must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    if (search.length > 100) {
      return failure(res, 'Search must be 100 characters or fewer.');
    }

    // Escape LIKE wildcards so a search for "_" or "%" matches those characters literally.
    const where = search ? 'WHERE name LIKE ?' : '';
    const params = search ? [`%${search.replace(/[\\%_]/g, '\\$&')}%`] : [];

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM characters ${where}`, params);

    // Built-in characters (no external id) first, then imported ones in the order they were added.
    const [rows] = await pool.query(
      `SELECT id, external_api_id, name, description, image_path FROM characters ${where}
       ORDER BY external_api_id IS NOT NULL, id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    return success(res, {
      characters: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, image_path FROM characters WHERE id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return failure(res, 'Character not found.', 404);
    }

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function quotes(req, res, next) {
  try {
    const [characterRows] = await pool.query(`SELECT id FROM characters WHERE id = ?`, [
      req.params.id,
    ]);

    if (characterRows.length === 0) {
      return failure(res, 'Character not found.', 404);
    }

    const [rows] = await pool.query(
      `SELECT id, quote_text FROM quotes WHERE character_id = ? ORDER BY id ASC`,
      [req.params.id]
    );

    return success(res, rows);
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, quotes };
