const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken, setAuthCookie, clearAuthCookie } = require('../utils/jwt');
const { success, failure } = require('../utils/responses');

async function register(req, res, next) {
  try {
    const { username, email, password, dateOfBirth } = req.body;

    const passwordHash = await hashPassword(password);

    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, date_of_birth)
       VALUES (?, ?, ?, ?)`,
      [username.trim(), email.trim().toLowerCase(), passwordHash, dateOfBirth]
    );

    const userId = result.insertId;

    await pool.query(
      `INSERT INTO user_settings (user_id, character_id, theme) VALUES (?, 1, 'default')`,
      [userId]
    );

    const token = signToken({ userId });
    setAuthCookie(res, token);

    return success(res, { id: userId, username, email }, 201);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password, dateOfBirth } = req.body;

    const [rows] = await pool.query(
      `SELECT id, username, email, password_hash, date_of_birth
       FROM users WHERE username = ?`,
      [username.trim()]
    );

    if (rows.length === 0) {
      return failure(res, 'Invalid username, password, or date of birth.', 401);
    }

    const user = rows[0];
    const passwordMatches = await verifyPassword(password, user.password_hash);
    const dobMatches = user.date_of_birth === dateOfBirth;

    if (!passwordMatches || !dobMatches) {
      return failure(res, 'Invalid username, password, or date of birth.', 401);
    }

    const token = signToken({ userId: user.id });
    setAuthCookie(res, token);

    return success(res, { id: user.id, username: user.username, email: user.email });
  } catch (err) {
    return next(err);
  }
}

function logout(req, res) {
  clearAuthCookie(res);
  return success(res, {});
}

async function me(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, email, date_of_birth, created_at FROM users WHERE id = ?`,
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

module.exports = { register, login, logout, me };
