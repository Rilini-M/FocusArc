const pool = require('../config/database');
const { success, failure } = require('../utils/responses');

async function list(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, image_path FROM characters ORDER BY id ASC`
    );
    return success(res, rows);
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
