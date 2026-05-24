import crypto from 'node:crypto';

export function createRequestLogger(req, scope) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const origin = req.headers.origin || '';
  const method = req.method;

  const base = { requestId, scope, method, origin };

  const log = (event, details = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      event,
      elapsedMs: Date.now() - startedAt,
      ...base,
      ...details
    }));
  };

  const warn = (event, details = {}) => {
    console.warn(JSON.stringify({
      level: 'warn',
      event,
      elapsedMs: Date.now() - startedAt,
      ...base,
      ...details
    }));
  };

  const error = (event, err, details = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      event,
      elapsedMs: Date.now() - startedAt,
      ...base,
      ...details,
      error: err?.message || String(err)
    }));
  };

  return { requestId, log, warn, error };
}

export function maskEmail(email = '') {
  const [name, domain] = String(email).split('@');

  if (!name || !domain) return email;

  return `${name.slice(0, 2)}***@${domain}`;
}

export function safeBody(body = {}) {
  return {
    ...body,
    email: body.email ? maskEmail(body.email) : body.email,
    code: body.code ? `[${String(body.code).length} digits]` : body.code,
    password: body.password ? '[redacted]' : body.password,
    verificationToken: body.verificationToken ? '[redacted]' : body.verificationToken
  };
}
