const pool = require('../config/database');
const { success, failure } = require('../utils/responses');

async function get(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT character_id, theme, auto_quote, quote_interval
       FROM user_settings WHERE user_id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return failure(res, 'Settings not found.', 404);
    }

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { characterId, theme, autoQuote, quoteInterval } = req.body;

    if (characterId) {
      const [characterRows] = await pool.query(`SELECT id FROM characters WHERE id = ?`, [
        characterId,
      ]);
      if (characterRows.length === 0) {
        return failure(res, 'Invalid character.');
      }
    }

    const [result] = await pool.query(
      `UPDATE user_settings SET
         character_id = COALESCE(?, character_id),
         theme = COALESCE(?, theme),
         auto_quote = COALESCE(?, auto_quote),
         quote_interval = COALESCE(?, quote_interval)
       WHERE user_id = ?`,
      [characterId || null, theme || null, autoQuote, quoteInterval || null, req.user.id]
    );

    if (result.affectedRows === 0) {
      return failure(res, 'Settings not found.', 404);
    }

    const [rows] = await pool.query(
      `SELECT character_id, theme, auto_quote, quote_interval
       FROM user_settings WHERE user_id = ?`,
      [req.user.id]
    );

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function updateCharacter(req, res, next) {
  try {
    const { characterId } = req.body;

    if (!characterId) {
      return failure(res, 'characterId is required.');
    }

    const [characterRows] = await pool.query(`SELECT id FROM characters WHERE id = ?`, [
      characterId,
    ]);
    if (characterRows.length === 0) {
      return failure(res, 'Invalid character.');
    }

    await pool.query(`UPDATE user_settings SET character_id = ? WHERE user_id = ?`, [
      characterId,
      req.user.id,
    ]);

    return success(res, { characterId });
  } catch (err) {
    return next(err);
  }
}

async function updateTheme(req, res, next) {
  try {
    const { theme } = req.body;

    await pool.query(`UPDATE user_settings SET theme = ? WHERE user_id = ?`, [
      theme,
      req.user.id,
    ]);

    return success(res, { theme });
  } catch (err) {
    return next(err);
  }
}

module.exports = { get, update, updateCharacter, updateTheme };
