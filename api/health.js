import { env } from '../lib/config.js';
import { handleCors, json } from '../lib/http.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  return json(res, 200, {
    success: true,
    service: 'guandan-email-verification-api',
    config: {
      hasResendApiKey: Boolean(env('RESEND_API_KEY')),
      hasUpstashUrl: Boolean(env('UPSTASH_REDIS_REST_URL')),
      hasUpstashToken: Boolean(env('UPSTASH_REDIS_REST_TOKEN')),
      hasCodePepper: Boolean(env('CODE_PEPPER')),
      pocketBaseUrl: env('POCKETBASE_URL'),
      allowedOrigins: env('ALLOWED_ORIGINS')
    }
  });
}
