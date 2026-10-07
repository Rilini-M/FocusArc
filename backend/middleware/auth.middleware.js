const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const { failure } = require('../utils/responses');

function authenticate(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return failure(res, 'You must be logged in to do that.', 401);
  }

  try {
    const payload = verifyToken(token);
    // role comes from the token for convenience only; tokens issued before roles existed have none.
    // Admin checks re-read the role from the database (see admin.middleware.js).
    req.user = { id: payload.userId, role: payload.role || 'USER' };
    return next();
  } catch (err) {
    return failure(res, 'Your session has expired. Please log in again.', 401);
  }
}

module.exports = { authenticate };
