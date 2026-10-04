const { failure } = require('../utils/responses');

const QUEST_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
const THEMES = ['default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk'];
// Kept identical to QUEST_LIMITS in frontend/js/questboard.js.
const QUEST_TITLE_MIN = 2;
const QUEST_TITLE_MAX = 19;
const QUEST_DESCRIPTION_MIN = 9;
const QUEST_DESCRIPTION_MAX = 60;

// Username and email checks (kept identical in backend/middleware/validate.js and frontend/js/auth.js).
// A username is a name: 2–50 letters A–Z only (50 matches the users table column).
function usernameError(username) {
  const value = (username || '').trim();
  if (!value) return 'Username is required.';
  if (!/^[A-Za-z]+$/.test(value)) return 'Username can only contain letters (A–Z), with no numbers, spaces or symbols.';
  if (value.length < 2) return 'Username must be at least 2 letters.';
  if (value.length > 50) return 'Username must be 50 letters or fewer.';
  return null;
}

// Only Gmail addresses shaped like "richa@gmail.com" or "richa123@gmail.com": letters A–Z first,
// then optional numbers 0–9, then exactly "@gmail.com". No dots or other symbols.
function emailError(email) {
  const value = (email || '').trim().toLowerCase();
  if (/\s/.test(value)) return 'Email cannot contain spaces.';
  if (!value.endsWith('@gmail.com') || value.indexOf('@') !== value.length - '@gmail.com'.length || value.length > 255) {
    return 'Enter a Gmail address ending in @gmail.com, like name@gmail.com.';
  }
  const local = value.slice(0, -'@gmail.com'.length);
  if (!/^[a-z]+[0-9]*$/.test(local)) {
    return 'Before @gmail.com, use letters first, then optional numbers, like richa123@gmail.com.';
  }
  return null;
}

// Date of birth must be a real YYYY-MM-DD calendar date between 1900-01-01 and today.
function dateOfBirthError(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!date || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3]) || match[1] < '1900') {
    return 'A valid date of birth is required.';
  }
  if (date > new Date()) {
    return 'Date of birth cannot be in the future.';
  }
  return null;
}

// Shared by sign-up and profile update.
function accountError({ username, email, dateOfBirth }) {
  const usernameProblem = usernameError(username);
  if (usernameProblem) {
    return usernameProblem;
  }
  const emailProblem = emailError(email);
  if (emailProblem) {
    return emailProblem;
  }
  return dateOfBirthError(dateOfBirth);
}

function validateRegistration(req, res, next) {
  const { password, confirmPassword } = req.body;

  const error = accountError(req.body);
  if (error) {
    return failure(res, error);
  }
  if (!password || password.length < 8) {
    return failure(res, 'Password must be at least 8 characters.');
  }
  if (password !== confirmPassword) {
    return failure(res, 'Passwords do not match.');
  }

  return next();
}

function validateProfile(req, res, next) {
  const error = accountError(req.body);
  return error ? failure(res, error) : next();
}

function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return failure(res, 'Username and password are required.');
  }

  return next();
}

function validateQuest(req, res, next) {
  const { title, description, status } = req.body;

  if (!title || !title.trim()) {
    return failure(res, 'Quest title is required.');
  }
  if (title.trim().length < QUEST_TITLE_MIN || title.trim().length > QUEST_TITLE_MAX) {
    return failure(res, `Quest title must be ${QUEST_TITLE_MIN}–${QUEST_TITLE_MAX} characters.`);
  }
  if (!description || !description.trim()) {
    return failure(res, 'Quest description is required.');
  }
  if (description.trim().length < QUEST_DESCRIPTION_MIN || description.trim().length > QUEST_DESCRIPTION_MAX) {
    return failure(res, `Quest description must be ${QUEST_DESCRIPTION_MIN}–${QUEST_DESCRIPTION_MAX} characters.`);
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
  validateRegistration,
  validateLogin,
  validateProfile,
  validateQuest,
  validateStatus,
  validateTheme,
};
