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

function wireSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  // Checks a field on blur, then live while its message is showing, so the user sees exactly
  // what to fix without being nagged mid-typing.
  function liveCheck(name, check) {
    const input = form.querySelector(`input[name="${name}"]`);
    const field = document.getElementById(`${name}-field`);
    const errorText = document.getElementById(`${name}-error`);
    const validate = () => {
      const error = check(input.value);
      field.classList.toggle('invalid', Boolean(error));
      errorText.hidden = !error;
      if (error) errorText.textContent = error;
      return !error;
    };
    input.addEventListener('input', () => {
      if (errorText.hidden === false) validate();
    });
    input.addEventListener('blur', validate);
    return { input, validate, error: () => check(input.value) };
  }

  const usernameCheck = liveCheck('username', usernameError);
  const emailCheck = liveCheck('email', emailError);
  const passwordCheck = liveCheck('password', (value) => {
    if (!value) return 'Password is required.';
    return value.length < 8 ? 'Password must be at least 8 characters.' : null;
  });
  const confirmCheck = liveCheck('confirmPassword', (value) => {
    if (!value) return 'Please confirm your password.';
    return value !== passwordCheck.input.value ? 'Passwords do not match.' : null;
  });
  const dateOfBirthCheck = liveCheck('dateOfBirth', dateOfBirthError);
  const checks = [usernameCheck, emailCheck, passwordCheck, confirmCheck, dateOfBirthCheck];

  // Re-check "Passwords do not match" when the first password changes, once confirm has a value.
  passwordCheck.input.addEventListener('input', () => {
    if (confirmCheck.input.value) confirmCheck.validate();
  });
  // Date pickers often change without a blur, so check as soon as a date is picked.
  dateOfBirthCheck.input.addEventListener('change', dateOfBirthCheck.validate);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const username = formData.get('username').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const dateOfBirth = formData.get('dateOfBirth');

    // Check every field so each problem shows under its own input, then point at the first one.
    const failed = checks.filter((check) => !check.validate());
    if (failed.length) {
      showToast(failed[0].error(), { isError: true });
      failed[0].input.focus();
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
