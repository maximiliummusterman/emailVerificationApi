import { deleteKey, getJson, setJson } from './redis.js';
import { keyHash, randomToken } from './security.js';

const PREFIX = 'guandan:email-verification';

function emailKey(email) {
  return keyHash(email);
}

export function verificationKey(purpose, email) {
  return `${PREFIX}:code:${purpose}:${emailKey(email)}`;
}

export function tokenKey(purpose, token) {
  return `${PREFIX}:token:${purpose}:${keyHash(token)}`;
}

export function verifiedUserKey(userId) {
  return `${PREFIX}:verified-user:${userId}`;
}

export function verifiedEmailKey(email) {
  return `${PREFIX}:verified-email:${emailKey(email)}`;
}

export async function saveVerification({ email, purpose, codeHash, ttlSeconds, maxAttempts }) {
  const now = Date.now();
  const record = {
    email,
    purpose,
    codeHash,
    attemptsLeft: maxAttempts,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000
  };

  await setJson(verificationKey(purpose, email), record, ttlSeconds);
  return record;
}

export async function getVerification(purpose, email) {
  return getJson(verificationKey(purpose, email));
}

export async function updateVerification(purpose, email, record) {
  const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  await setJson(verificationKey(purpose, email), record, ttlSeconds);
}

export async function deleteVerification(purpose, email) {
  await deleteKey(verificationKey(purpose, email));
}

export async function createVerificationToken({ email, purpose, ttlSeconds }) {
  const token = randomToken();
  const now = Date.now();

  await setJson(tokenKey(purpose, token), {
    email,
    purpose,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000
  }, ttlSeconds);

  return token;
}

export async function getVerificationToken(purpose, token) {
  return getJson(tokenKey(purpose, token));
}

export async function deleteVerificationToken(purpose, token) {
  await deleteKey(tokenKey(purpose, token));
}

export async function markExternalUserVerified({ userId, email, ttlSeconds = 0 }) {
  const now = new Date().toISOString();
  const record = { userId: userId || null, email, verifiedAt: now };

  if (userId) {
    await setJson(verifiedUserKey(userId), record, ttlSeconds);
  }

  await setJson(verifiedEmailKey(email), record, ttlSeconds);

  return record;
}

export async function isExternalUserVerified(userId, email) {
  const userRecord = userId ? await getJson(verifiedUserKey(userId)) : null;

  if (userRecord) {
    return true;
  }

  const emailRecord = await getJson(verifiedEmailKey(email));
  return Boolean(emailRecord);
}
