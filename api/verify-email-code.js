import { verificationConfig } from '../lib/config.js';
import { badRequest, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { createRequestLogger, maskEmail, safeBody } from '../lib/logger.js';
import { codeMatches, normalizeCode, normalizeEmail, normalizePurpose } from '../lib/security.js';
import {
  createVerificationToken,
  deleteVerification,
  getVerification,
  updateVerification
} from '../lib/verificationStore.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req, 'verify-email-code');
  logger.log('request_start');

  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const body = await readJson(req);
    logger.log('request_body_parsed', { body: safeBody(body) });

    const email = normalizeEmail(body.email);
    const purpose = normalizePurpose(body.purpose);
    const code = normalizeCode(body.code);
    const config = verificationConfig();
    const record = await getVerification(purpose, email);
    logger.log('verification_loaded', { email: maskEmail(email), purpose, found: Boolean(record) });

    if (!record || record.expiresAt <= Date.now()) {
      logger.warn('code_expired_or_missing', { email: maskEmail(email), purpose, found: Boolean(record) });
      await deleteVerification(purpose, email);
      return badRequest(res, 'The verification code has expired. Please request a new code.');
    }

    if (record.attemptsLeft <= 0) {
      logger.warn('code_attempts_exhausted', { email: maskEmail(email), purpose });
      await deleteVerification(purpose, email);
      return badRequest(res, 'Too many incorrect attempts. Please request a new code.');
    }

    if (!codeMatches(record.codeHash, email, purpose, code)) {
      record.attemptsLeft -= 1;
      logger.warn('code_invalid', { email: maskEmail(email), purpose, attemptsLeft: record.attemptsLeft });

      if (record.attemptsLeft <= 0) {
        logger.warn('code_attempts_now_exhausted', { email: maskEmail(email), purpose });
        await deleteVerification(purpose, email);
        return badRequest(res, 'Too many incorrect attempts. Please request a new code.');
      }

      await updateVerification(purpose, email, record);
      return badRequest(res, 'Invalid verification code.', { attemptsLeft: record.attemptsLeft });
    }

    await deleteVerification(purpose, email);
    logger.log('code_valid', { email: maskEmail(email), purpose });

    const verificationToken = await createVerificationToken({
      email,
      purpose,
      ttlSeconds: config.tokenTtlSeconds
    });
    logger.log('verification_token_created', { email: maskEmail(email), purpose, ttlSeconds: config.tokenTtlSeconds });

    return json(res, 200, {
      success: true,
      verificationToken,
      expiresIn: config.tokenTtlSeconds
    });
  } catch (error) {
    logger.error('request_failed', error);

    if (error.message?.startsWith('Enter') || error.message?.startsWith('Invalid')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
