import { allowedOrigins } from './config.js';

const JSON_LIMIT_BYTES = 20 * 1024;

export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function handleCors(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

export function json(res, status, body) {
  res.status(status).json(body);
}

export function methodNotAllowed(res) {
  json(res, 405, { success: false, error: 'Method not allowed.' });
}

export function badRequest(res, error, extra = {}) {
  json(res, 400, { success: false, error, ...extra });
}

export function serverError(res, error = 'Internal server error.') {
  json(res, 500, { success: false, error });
}

export async function readJson(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
  }

  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > JSON_LIMIT_BYTES) {
      throw new Error('Request body is too large.');
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

export function getAuthToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : header.trim();
}
