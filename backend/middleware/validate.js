const { failure } = require('../utils/responses');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUEST_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
const THEMES = ['default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk'];

function validateRegistration(req, res, next) {
  const { username, email, password, confirmPassword, dateOfBirth } = req.body;

  if (!username || username.trim().length < 3) {
    return failure(res, 'Username must be at least 3 characters.');
  }
  if (!email || !EMAIL_RE.test(email)) {
    return failure(res, 'A valid email address is required.');
  }
  if (!password || password.length < 8) {
    return failure(res, 'Password must be at least 8 characters.');
  }
  if (password !== confirmPassword) {
    return failure(res, 'Passwords do not match.');
  }
  if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) {
    return failure(res, 'A valid date of birth is required.');
  }

  return next();
}

function validateLogin(req, res, next) {
  const { username, password, dateOfBirth } = req.body;

  if (!username || !password || !dateOfBirth) {
    return failure(res, 'Username, password, and date of birth are required.');
  }

  return next();
}

function validateQuest(req, res, next) {
  const { title, description, status } = req.body;

  if (!title || !title.trim()) {
    return failure(res, 'Quest title is required.');
  }
  if (!description || !description.trim()) {
    return failure(res, 'Quest description is required.');
  }
  if (status && !QUEST_STATUSES.includes(status)) {
    return failure(res, 'Invalid quest status.');
  }

  return next();
}

function validateStatus(req, res, next) {
  const { status } = req.body;

  if (!status || !QUEST_STATUSES.includes(status)) {
    return failure(res, 'Invalid quest status.');
  }

  return next();
}

function validateTheme(req, res, next) {
  const { theme } = req.body;

  if (!theme || !THEMES.includes(theme)) {
    return failure(res, 'Invalid theme.');
  }

  return next();
}

module.exports = {
  QUEST_STATUSES,
  THEMES,
  validateRegistration,
  validateLogin,
  validateQuest,
  validateStatus,
  validateTheme,
};
