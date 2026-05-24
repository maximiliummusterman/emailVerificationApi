import { requiredEnv } from './config.js';

function baseUrl() {
  return requiredEnv('POCKETBASE_URL').replace(/\/$/, '');
}

async function pocketBaseFetch(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  console.log(JSON.stringify({
    level: response.ok ? 'info' : 'error',
    event: response.ok ? 'pocketbase_request_success' : 'pocketbase_request_failed',
    path,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    error: data.message
  }));

  if (!response.ok) {
    const error = new Error(data.message || `PocketBase request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function createPocketBaseUser({ email, username, password }) {
  return pocketBaseFetch('/api/collections/users/records', {
    method: 'POST',
    body: JSON.stringify({
      email,
      username,
      password,
      passwordConfirm: password,
      emailVisibility: true
    })
  });
}

export async function authPocketBaseUser({ email, password }) {
  return pocketBaseFetch('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({
      identity: email,
      password
    })
  });
}

export async function refreshPocketBaseAuth(token) {
  return pocketBaseFetch('/api/collections/users/auth-refresh', {
    method: 'POST',
    headers: {
      Authorization: token
    }
  });
}

export function pocketBaseErrorMessage(error) {
  const data = error.data?.data;

  if (data?.email) {
    return 'This email is already registered.';
  }

  if (data?.username) {
    return 'This username is already taken.';
  }

  if (data?.password) {
    return 'Password must be at least 8 characters.';
  }

  return error.data?.message || error.message || 'PocketBase request failed.';
}
