const pool = require('../config/database');
const { authenticate } = require('./auth.middleware');
const { failure } = require('../utils/responses');

// Runs after authenticate. The role is read from the database rather than trusted from the
// token, so promoting or demoting a user takes effect immediately, without a new login.
async function checkAdmin(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT role FROM users WHERE id = ?`, [req.user.id]);

    if (rows.length === 0) {
      return failure(res, 'You must be logged in to do that.', 401);
    }

    if (rows[0].role !== 'ADMIN') {
      return failure(res, 'You do not have permission to do that.', 403);
    }

    req.user.role = 'ADMIN';
    return next();
  } catch (err) {
    return next(err);
  }
}

// Use as `router.use(requireAdmin)`: 401 if not logged in, 403 if logged in but not an ADMIN.
const requireAdmin = [authenticate, checkAdmin];

module.exports = { requireAdmin };
