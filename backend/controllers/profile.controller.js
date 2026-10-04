const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { clearAuthCookie } = require('../utils/jwt');
const { success, failure } = require('../utils/responses');

async function get(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, email, date_of_birth FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return failure(res, 'User not found.', 404);
    }

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { username, email, dateOfBirth } = req.body;

    await pool.query(
      `UPDATE users SET username = ?, email = ?, date_of_birth = ? WHERE id = ?`,
      [username.trim(), email.trim().toLowerCase(), dateOfBirth, req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT id, username, email, date_of_birth FROM users WHERE id = ?`,
      [req.user.id]
    );

    return success(res, rows[0]);
  } catch (err) {
    return next(err);
  }
}

async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return failure(res, 'A valid current and new password (8+ characters) are required.');
    }

    const [rows] = await pool.query(`SELECT password_hash FROM users WHERE id = ?`, [
      req.user.id,
    ]);

    if (rows.length === 0) {
      return failure(res, 'User not found.', 404);
    }

    const matches = await verifyPassword(currentPassword, rows[0].password_hash);
    if (!matches) {
      return failure(res, 'Current password is incorrect.', 401);
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.user.id]);

    return success(res, {});
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    await pool.query(`DELETE FROM users WHERE id = ?`, [req.user.id]);
    clearAuthCookie(res);
    return success(res, {});
  } catch (err) {
    return next(err);
  }
}

module.exports = { get, update, updatePassword, remove };
