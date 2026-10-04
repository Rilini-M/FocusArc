const { failure } = require('../utils/responses');

const QUEST_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
const THEMES = ['default', 'nature', 'dark', 'royal', 'vampire', 'cyberpunk'];
// Kept identical to QUEST_LIMITS in frontend/js/questboard.js.
const QUEST_TITLE_MIN = 2;
const QUEST_TITLE_MAX = 19;
const QUEST_DESCRIPTION_MIN = 9;
const QUEST_DESCRIPTION_MAX = 99;

// Email check (kept identical in backend/middleware/validate.js and frontend/js/auth.js).
// Valid format, plus a spelling check for well-known providers: "gmial.com" or "gmail.con"
// is almost always a typo, so it is rejected with a suggested fix.
const EMAIL_RE = /^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9-]+\.)+[a-z]{2,}$/;
const EMAIL_PROVIDERS = { gmail: 'gmail.com', yahoo: 'yahoo.com', hotmail: 'hotmail.com', outlook: 'outlook.com', icloud: 'icloud.com' };
const REAL_LOOKALIKES = ['mail', 'email', 'ymail', 'gmx', 'cloud']; // real providers that look like typos
const COM_TYPOS = ['con', 'cmo', 'cm', 'om', 'comm', 'coom', 'vom', 'xom', 'cpm'];

// Letters changed, added, removed or swapped to turn a into b.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function emailError(email) {
  const value = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 255) return 'Enter a valid email address, like name@gmail.com.';
  const [local, domain] = value.split('@');
  const name = domain.split('.')[0];
  const ending = domain.slice(name.length + 1);
  const suggest = (fixed) => `Check the spelling — did you mean ${local}@${fixed}?`;

  if (EMAIL_PROVIDERS[name]) {
    if (name === 'gmail' && ending !== 'com') return suggest('gmail.com');
    if (COM_TYPOS.includes(ending) || ending === 'co') return suggest(EMAIL_PROVIDERS[name]);
    return null;
  }
  if (!REAL_LOOKALIKES.includes(name)) {
    for (const provider of Object.keys(EMAIL_PROVIDERS)) {
      const allowed = provider === 'gmail' || provider.length >= 7 ? 2 : 1;
      if (name.length >= 3 && editDistance(name, provider) <= allowed) return suggest(EMAIL_PROVIDERS[provider]);
    }
  }
  if (COM_TYPOS.includes(ending)) return suggest(`${name}.com`);
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

// Shared by sign-up and profile update. Lengths match the users table columns.
function accountError({ username, email, dateOfBirth }) {
  if (!username || username.trim().length < 3 || username.trim().length > 50) {
    return 'Username must be 3–50 characters.';
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
