import { verificationConfig } from '../lib/config.js';
import { badRequest, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { createRequestLogger, maskEmail, safeBody } from '../lib/logger.js';
import {
  authPocketBaseUser,
  createPocketBaseUser,
  pocketBaseErrorMessage
} from '../lib/pocketbase.js';
import { normalizeEmail } from '../lib/security.js';
import {
  deleteVerificationToken,
  getVerificationToken,
  markExternalUserVerified
} from '../lib/verificationStore.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req, 'complete-signup');
  logger.log('request_start');

  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const body = await readJson(req);
    logger.log('request_body_parsed', { body: safeBody(body) });

    const email = normalizeEmail(body.email);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const verificationToken = String(body.verificationToken || '').trim();

    if (!username) {
      return badRequest(res, 'Username is required.');
    }

    if (password.length < 8) {
      return badRequest(res, 'Password must be at least 8 characters.');
    }

    if (!verificationToken) {
      return badRequest(res, 'Missing verification token.');
    }

    const tokenRecord = await getVerificationToken('signup', verificationToken);
    logger.log('verification_token_loaded', { email: maskEmail(email), found: Boolean(tokenRecord) });

    if (!tokenRecord || tokenRecord.email !== email || tokenRecord.expiresAt <= Date.now()) {
      logger.warn('verification_token_invalid', { email: maskEmail(email), found: Boolean(tokenRecord) });
      return badRequest(res, 'Email verification expired. Please request a new code.');
    }

    try {
      logger.log('pocketbase_create_user_start', { email: maskEmail(email), username });
      await createPocketBaseUser({ email, username, password });
      logger.log('pocketbase_auth_start', { email: maskEmail(email) });
      const authData = await authPocketBaseUser({ email, password });
      const config = verificationConfig();

      await markExternalUserVerified({
        userId: authData.record.id,
        email,
        ttlSeconds: config.externalVerificationTtlSeconds
      });
      logger.log('external_verified_marker_saved', { email: maskEmail(email), userId: authData.record.id });

      await deleteVerificationToken('signup', verificationToken);
      logger.log('request_success', { email: maskEmail(email), userId: authData.record.id });

      return json(res, 200, {
        success: true,
        token: authData.token,
        record: authData.record
      });
    } catch (error) {
      logger.error('pocketbase_signup_failed', error, { email: maskEmail(email) });
      return json(res, error.status || 502, {
        success: false,
        error: pocketBaseErrorMessage(error)
      });
    }
  } catch (error) {
    logger.error('request_failed', error);

    if (error.message?.startsWith('Enter')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
