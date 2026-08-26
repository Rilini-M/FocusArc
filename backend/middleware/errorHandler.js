const { failure } = require('../utils/responses');

function notFoundHandler(req, res) {
  return failure(res, 'The requested resource was not found.', 404);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === 'ER_DUP_ENTRY') {
    return failure(res, 'That username or email is already in use.', 409);
  }

  return failure(res, 'Something went wrong. Please try again.', 500);
}

module.exports = { notFoundHandler, errorHandler };
