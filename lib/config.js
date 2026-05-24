const DEFAULT_ALLOWED_ORIGINS = [
  'https://guandan.de',
  'https://www.guandan.de',
  'http://localhost:3000',
  'http://localhost:5173'
];

export function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function requiredEnv(name) {
  const value = env(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function numberEnv(name, fallback) {
  const raw = env(name, String(fallback));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function allowedOrigins() {
  const configured = env('ALLOWED_ORIGINS');

  if (!configured) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function emailConfig() {
  return {
    apiKey: requiredEnv('RESEND_API_KEY'),
    from: env('RESEND_FROM', 'Guandan <no-reply@guandan.de>'),
    replyTo: env('RESEND_REPLY_TO', 'no-reply@guandan.de')
  };
}

export function verificationConfig() {
  return {
    codeTtlSeconds: numberEnv('CODE_TTL_SECONDS', 10 * 60),
    tokenTtlSeconds: numberEnv('VERIFICATION_TOKEN_TTL_SECONDS', 10 * 60),
    maxAttempts: numberEnv('MAX_VERIFY_ATTEMPTS', 5),
    rateLimitWindowSeconds: numberEnv('RATE_LIMIT_WINDOW_SECONDS', 15 * 60),
    emailSendLimit: numberEnv('SEND_RATE_LIMIT_EMAIL_MAX', 3),
    ipSendLimit: numberEnv('SEND_RATE_LIMIT_IP_MAX', 20),
    externalVerificationTtlSeconds: numberEnv('EXTERNAL_VERIFICATION_TTL_SECONDS', 0)
  };
}
