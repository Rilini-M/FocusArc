const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const { failure } = require('../utils/responses');

function authenticate(req, res, next) {
  const token = req.cookies[COOKIE_NAME];

  if (!token) {
    return failure(res, 'You must be logged in to do that.', 401);
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.userId };
    return next();
  } catch (err) {
    return failure(res, 'Your session has expired. Please log in again.', 401);
  }
}

module.exports = { authenticate };
