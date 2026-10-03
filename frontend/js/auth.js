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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function wireSignupForm() {
  const form = document.getElementById('signup-form');
  if (!form) return;

  const emailInput = form.querySelector('input[name="email"]');
  const emailField = document.getElementById('email-field');
  const emailError = document.getElementById('email-error');

  function validateEmail() {
    const email = emailInput.value.trim();
    const valid = EMAIL_RE.test(email);
    emailField.classList.toggle('invalid', !valid);
    emailError.hidden = valid;
    return valid;
  }

  emailInput.addEventListener('input', () => {
    if (emailError.hidden === false) validateEmail();
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
      showToast('Please enter a valid email address.', { isError: true });
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

document.addEventListener('DOMContentLoaded', () => {
  wireLoginForm();
  wireSignupForm();
});
