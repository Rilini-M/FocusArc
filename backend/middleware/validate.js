const { failure } = require('../utils/responses');

// Light/Dark appearance modes. (Study themes are rows in the `themes` table, checked in
// settings.controller.js.)
const APPEARANCES = ['dark', 'light'];
// Kept identical to QUEST_LIMITS in frontend/js/questboard.js.
const QUEST_TITLE_MIN = 2;
const QUEST_TITLE_MAX = 19;
const QUEST_DESCRIPTION_MIN = 9;
const QUEST_DESCRIPTION_MAX = 99;
// Time Required, in whole minutes (up to 24 hours).
const QUEST_TIME_MIN = 1;
const QUEST_TIME_MAX = 1440;
// Deadlines travel as UTC instants (the browser converts the user's local time):
// "2026-10-10T14:15:00.000Z", as made by Date.prototype.toISOString(). Seconds optional.
const DEADLINE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?Z$/;

// A real calendar date and time ("2026-02-30T10:00:00Z" is rejected).
function isValidDeadline(value) {
  const match = DEADLINE_RE.exec(value);
  if (!match) return false;
  const [y, mo, d, h, mi] = match.slice(1, 6).map(Number);
  const s = Number(match[6] || 0);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    y >= 2000 && y <= 2100 &&
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d &&
    date.getUTCHours() === h && date.getUTCMinutes() === mi && date.getUTCSeconds() === s
  );
}

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

// Only Gmail addresses shaped like "richa123@gmail.com": one or more letters, then one or more
// numbers, then exactly "@gmail.com". No dots, symbols or letters after the numbers.
const EMAIL_RE = /^[A-Za-z]+[0-9]+@gmail\.com$/;

function emailError(email) {
  const value = (email || '').trim();
  if (/\s/.test(value)) return 'Email cannot contain spaces.';
  if (EMAIL_RE.test(value) && value.length <= 255) return null;
  if (!value.endsWith('@gmail.com') || value.indexOf('@') !== value.length - '@gmail.com'.length) {
    return 'Enter a Gmail address ending in @gmail.com, like richa123@gmail.com.';
  }
  return 'Before @gmail.com, use letters followed by numbers, like richa123@gmail.com.';
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

// Create/edit quest. Runs after the upload parser, so multipart fields arrive as strings.
function validateQuest(req, res, next) {
  const { title, description, timeRequired, deadline, characterId } = req.body;

  if (typeof title !== 'string' || !title.trim()) {
    return failure(res, 'Quest title is required.');
  }
  if (title.trim().length < QUEST_TITLE_MIN || title.trim().length > QUEST_TITLE_MAX) {
    return failure(res, `Quest title must be ${QUEST_TITLE_MIN}–${QUEST_TITLE_MAX} characters.`);
  }
  if (typeof description !== 'string' || !description.trim()) {
    return failure(res, 'Quest description is required.');
  }
  if (description.trim().length < QUEST_DESCRIPTION_MIN || description.trim().length > QUEST_DESCRIPTION_MAX) {
    return failure(res, `Quest description must be ${QUEST_DESCRIPTION_MIN}–${QUEST_DESCRIPTION_MAX} characters.`);
  }
  const minutes = String(timeRequired ?? '').trim();
  if (!/^\d+$/.test(minutes) || Number(minutes) < QUEST_TIME_MIN || Number(minutes) > QUEST_TIME_MAX) {
    return failure(res, `Time required must be a whole number of minutes from ${QUEST_TIME_MIN} to ${QUEST_TIME_MAX}.`);
  }
  // Not sent or empty: no deadline.
  if (deadline !== undefined && String(deadline).trim() !== '' && !isValidDeadline(String(deadline).trim())) {
    return failure(res, 'Deadline must be a valid date and time.');
  }
  // Not sent or empty: the quest uses the character from Settings. Whether the character
  // exists is checked against the database.
  if (characterId !== undefined && String(characterId).trim() !== '' && !/^[1-9]\d{0,9}$/.test(String(characterId).trim())) {
    return failure(res, 'Invalid character.');
  }

  return next();
}

// Extend Deadline: the new deadline is required. Whether it is later than the current one and
// in the future is checked against the quest in the controller.
function validateDeadlineExtension(req, res, next) {
  const { deadline } = req.body || {};
  if (typeof deadline !== 'string' || !isValidDeadline(deadline.trim())) {
    return failure(res, 'Choose a valid new deadline.');
  }
  return next();
}

function validateTheme(req, res, next) {
  const { theme } = req.body;

  // Shape check only; whether the theme exists is checked against the database.
  if (typeof theme !== 'string' || !/^[a-z0-9-]{1,40}$/.test(theme)) {
    return failure(res, 'Invalid theme.');
  }

  return next();
}

function validateAppearance(req, res, next) {
  const { appearance } = req.body;

  if (!APPEARANCES.includes(appearance)) {
    return failure(res, 'Appearance must be light or dark.');
  }

  return next();
}

module.exports = {
  validateRegistration,
  validateLogin,
  validateProfile,
  validateQuest,
  validateDeadlineExtension,
  validateTheme,
  validateAppearance,
};
