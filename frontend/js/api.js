const API_BASE = '/api';

async function apiRequest(path, { method = 'GET', body } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error('Network error. Please check your connection and try again.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (parseErr) {
  }

  if (!response.ok || !payload || payload.success === false) {
    const message = (payload && payload.message) || 'Something went wrong. Please try again.';
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return payload.data;
}

const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  delete: (path) => apiRequest(path, { method: 'DELETE' }),
};
