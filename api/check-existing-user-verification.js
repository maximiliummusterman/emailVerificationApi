import { getAuthToken, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { createRequestLogger, maskEmail, safeBody } from '../lib/logger.js';
import { refreshPocketBaseAuth } from '../lib/pocketbase.js';
import { normalizeEmail } from '../lib/security.js';
import { isExternalUserVerified } from '../lib/verificationStore.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req, 'check-existing-user-verification');
  logger.log('request_start');

  if (handleCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const authToken = getAuthToken(req);
    let email = '';
    let userId = '';
    let pocketBaseVerified = false;

    if (req.method === 'POST') {
      const body = await readJson(req);
      logger.log('request_body_parsed', { body: safeBody(body) });
      email = normalizeEmail(body.email);
    }

    if (authToken) {
      try {
        const authData = await refreshPocketBaseAuth(authToken);
        const record = authData.record;
        email = normalizeEmail(record.email);
        userId = record.id;
        pocketBaseVerified = record.verified === true;
        logger.log('pocketbase_auth_refreshed', { userId, email: maskEmail(email), pocketBaseVerified });
      } catch (error) {
        logger.warn('pocketbase_auth_refresh_failed_using_email_fallback', { error: error.message, email: email ? maskEmail(email) : '' });
      }
    }

    if (!email) {
      return json(res, 401, { success: false, error: 'Missing email or valid PocketBase auth token.' });
    }

    const externallyVerified = await isExternalUserVerified(userId, email);
    logger.log('verification_status_loaded', {
      userId: userId || null,
      email: maskEmail(email),
      pocketBaseVerified,
      externallyVerified
    });

    return json(res, 200, {
      success: true,
      verified: pocketBaseVerified || externallyVerified,
      pocketBaseVerified,
      externallyVerified,
      userId: userId || null,
      email
    });
  } catch (error) {
    logger.error('request_failed', error);

    return serverError(res, error.message);
  }
}
