import { verificationConfig } from '../lib/config.js';
import { badRequest, getAuthToken, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { createRequestLogger, maskEmail, safeBody } from '../lib/logger.js';
import { refreshPocketBaseAuth } from '../lib/pocketbase.js';
import { normalizeEmail } from '../lib/security.js';
import {
  deleteVerificationToken,
  getVerificationToken,
  markExternalUserVerified
} from '../lib/verificationStore.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req, 'complete-existing-user-verification');
  logger.log('request_start');

  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const authToken = getAuthToken(req);
    const body = await readJson(req);
    logger.log('request_body_parsed', { body: safeBody(body) });

    const email = normalizeEmail(body.email);
    let userId = String(body.userId || '').trim();
    const verificationToken = String(body.verificationToken || '').trim();

    if (!verificationToken) {
      return badRequest(res, 'Missing verification token.');
    }

    if (authToken) {
      try {
        const authData = await refreshPocketBaseAuth(authToken);
        const record = authData.record;
        const recordEmail = normalizeEmail(record.email);
        logger.log('pocketbase_auth_refreshed', { userId: record.id, email: maskEmail(recordEmail) });

        if (recordEmail !== email) {
          logger.warn('email_mismatch', { requestedEmail: maskEmail(email), recordEmail: maskEmail(recordEmail), userId: record.id });
          return json(res, 403, { success: false, error: 'The verified email does not match the signed-in user.' });
        }

        userId = record.id;
      } catch (error) {
        logger.warn('pocketbase_auth_refresh_failed_using_email_code_only', { error: error.message, email: maskEmail(email) });
      }
    }

    const tokenRecord = await getVerificationToken('existing-user', verificationToken);
    logger.log('verification_token_loaded', { email: maskEmail(email), found: Boolean(tokenRecord) });

    if (!tokenRecord || tokenRecord.email !== email || tokenRecord.expiresAt <= Date.now()) {
      logger.warn('verification_token_invalid', { email: maskEmail(email), found: Boolean(tokenRecord) });
      return badRequest(res, 'Email verification expired. Please request a new code.');
    }

    const config = verificationConfig();
    const verifiedRecord = await markExternalUserVerified({
      userId,
      email,
      ttlSeconds: config.externalVerificationTtlSeconds
    });

    await deleteVerificationToken('existing-user', verificationToken);
    logger.log('request_success', { userId: userId || null, email: maskEmail(email) });

    return json(res, 200, {
      success: true,
      verified: true,
      userId: userId || null,
      email,
      verifiedAt: verifiedRecord.verifiedAt
    });
  } catch (error) {
    logger.error('request_failed', error);

    if (error.message?.startsWith('Enter')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
