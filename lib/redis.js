import { requiredEnv } from './config.js';

function redisUrl(path = '') {
  const baseUrl = requiredEnv('UPSTASH_REDIS_REST_URL').replace(/\/$/, '');
  return `${baseUrl}${path}`;
}

async function redisFetch(path, body) {
  const response = await fetch(redisUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEnv('UPSTASH_REDIS_REST_TOKEN')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    throw new Error(data.error || `Redis request failed with status ${response.status}`);
  }

  return data;
}

export async function redis(command, ...args) {
  const startedAt = Date.now();
  const data = await redisFetch('', [command, ...args]);

  console.log(JSON.stringify({
    level: 'info',
    event: 'redis_command_success',
    command,
    elapsedMs: Date.now() - startedAt
  }));

  return data.result;
}

export async function getJson(key) {
  const value = await redis('GET', key);

  if (!value) {
    return null;
  }

  return JSON.parse(value);
}

export async function setJson(key, value, ttlSeconds = 0) {
  const payload = JSON.stringify(value);

  if (ttlSeconds > 0) {
    return redis('SET', key, payload, 'EX', ttlSeconds);
  }

  return redis('SET', key, payload);
}

export async function deleteKey(key) {
  return redis('DEL', key);
}

export async function incrementWithExpiry(key, windowSeconds) {
  const count = Number(await redis('INCR', key));

  if (count === 1) {
    await redis('EXPIRE', key, windowSeconds);
  }

  return count;
}
