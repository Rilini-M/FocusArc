/*
  Shared auth guard + notification helper for every authenticated page, and the
  login/signup form handlers.
*/

function showToast(message, { isError = false } = {}) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Call at the top of every protected page. Redirects to login if not authenticated.
async function requireAuth() {
  try {
    const user = await api.get('/auth/me');
    return user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    window.location.href = 'login.html';
  }
}

function wireLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const username = formData.get('username').trim();
    const password = formData.get('password');

    if (!username || !password) {
      showToast('Please fill in all fields.', { isError: true });
      return;
    }

    submitBtn.disabled = true;
    try {
      await api.post('/auth/login', { username, password });
      await openThemeSelect();
      window.location.href = 'questboard.html';
    } catch (err) {
      showToast(err.message, { isError: true });
      submitBtn.disabled = false;
    }
  });
}

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

function wireSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  const emailInput = form.querySelector('input[name="email"]');
  const emailField = document.getElementById('email-field');
  const emailErrorText = document.getElementById('email-error');

  function validateEmail() {
    const error = emailError(emailInput.value);
    emailField.classList.toggle('invalid', Boolean(error));
    emailErrorText.hidden = !error;
    if (error) emailErrorText.textContent = error;
    return !error;
  }

  emailInput.addEventListener('input', () => {
    if (emailErrorText.hidden === false) validateEmail();
  });
  emailInput.addEventListener('blur', validateEmail);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const dateOfBirth = formData.get('dateOfBirth');

    if (!username || !email || !password || !confirmPassword || !dateOfBirth) {
      showToast('Please fill in all fields.', { isError: true });
      return;
    }
    if (!validateEmail()) {
      showToast(emailError(email), { isError: true });
      emailInput.focus();
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', { isError: true });
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters.', { isError: true });
      return;
    }
    const dobError = dateOfBirthError(dateOfBirth);
    if (dobError) {
      showToast(dobError, { isError: true });
      return;
    }

    submitBtn.disabled = true;
    try {
      await api.post('/auth/register', { username, email, password, confirmPassword, dateOfBirth });
      await openThemeSelect();
      window.location.href = 'questboard.html';
    } catch (err) {
      showToast(err.message, { isError: true });
      submitBtn.disabled = false;
    }
  });
}

// Same rule as the server: a real date between 1900-01-01 and today.
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateOfBirthError(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return 'Please enter a valid date of birth.';
  if (value > todayISO()) return 'Date of birth cannot be in the future.';
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  // Stops the date picker offering future dates (signup and Settings → Update Profile).
  document.querySelectorAll('input[name="dateOfBirth"]').forEach((input) => {
    input.min = '1900-01-01';
    input.max = todayISO();
  });
  wireLoginForm();
  wireSignupForm();
});
