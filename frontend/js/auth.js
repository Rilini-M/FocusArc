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
    return { input, validate };
  }

  const usernameCheck = liveCheck('username', usernameError);
  const emailCheck = liveCheck('email', emailError);

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
    if (!usernameCheck.validate()) {
      showToast(usernameError(username), { isError: true });
      usernameCheck.input.focus();
      return;
    }
    if (!emailCheck.validate()) {
      showToast(emailError(email), { isError: true });
      emailCheck.input.focus();
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
