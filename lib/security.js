import crypto from 'node:crypto';
import { requiredEnv } from './config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PURPOSES = new Set(['signup', 'existing-user']);

export function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw new Error('Enter a valid email address.');
  }

  return normalized;
}

export function normalizePurpose(purpose = 'signup') {
  const normalized = String(purpose || 'signup').trim();

  if (!PURPOSES.has(normalized)) {
    throw new Error('Invalid verification purpose.');
  }

  return normalized;
}

export function normalizeCode(code) {
  const normalized = String(code || '').replace(/\D/g, '');

  if (normalized.length !== 6) {
    throw new Error('Enter the 6-digit verification code.');
  }

  return normalized;
}

export function generateCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(email, purpose, code) {
  return crypto
    .createHmac('sha256', requiredEnv('CODE_PEPPER'))
    .update(`${purpose}:${email}:${code}`)
    .digest('hex');
}

export function codeMatches(expectedHash, email, purpose, code) {
  const actualHash = hashCode(email, purpose, code);
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function keyHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}
