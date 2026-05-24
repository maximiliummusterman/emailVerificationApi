import { verificationConfig } from '../lib/config.js';
import { badRequest, getClientIp, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { createRequestLogger, maskEmail, safeBody } from '../lib/logger.js';
import { sendVerificationEmail } from '../lib/resend.js';
import { generateCode, hashCode, keyHash, normalizeEmail, normalizePurpose } from '../lib/security.js';
import { deleteVerification, saveVerification } from '../lib/verificationStore.js';

export default async function handler(req, res) {
  const logger = createRequestLogger(req, 'send-verification-code');
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
    const ip = getClientIp(req);
    const config = verificationConfig();
    logger.log('verification_request_normalized', { email: maskEmail(email), purpose });

    const emailLimit = await checkRateLimit(
      `guandan:email-verification:rate:email:${purpose}:${keyHash(email)}`,
      config.emailSendLimit,
      config.rateLimitWindowSeconds
    );

    if (!emailLimit.allowed) {
      logger.warn('rate_limit_email_blocked', { email: maskEmail(email), purpose, count: emailLimit.count });
      return json(res, 429, {
        success: false,
        error: 'Too many verification emails sent to this address. Please wait and try again.'
      });
    }

    const ipLimit = await checkRateLimit(
      `guandan:email-verification:rate:ip:${purpose}:${keyHash(ip)}`,
      config.ipSendLimit,
      config.rateLimitWindowSeconds
    );

    if (!ipLimit.allowed) {
      logger.warn('rate_limit_ip_blocked', { purpose, count: ipLimit.count });
      return json(res, 429, {
        success: false,
        error: 'Too many verification requests. Please wait and try again.'
      });
    }

    const code = generateCode();
    const codeHash = hashCode(email, purpose, code);
    logger.log('code_generated', { email: maskEmail(email), purpose });

    await saveVerification({
      email,
      purpose,
      codeHash,
      ttlSeconds: config.codeTtlSeconds,
      maxAttempts: config.maxAttempts
    });
    logger.log('verification_saved', { email: maskEmail(email), purpose, ttlSeconds: config.codeTtlSeconds });

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      logger.error('resend_send_failed', error, { email: maskEmail(email), purpose });
      await deleteVerification(purpose, email);
      return json(res, 502, {
        success: false,
        error: error.message || 'Could not send verification email.'
      });
    }

    logger.log('request_success', { email: maskEmail(email), purpose });

    return json(res, 200, {
      success: true,
      expiresIn: config.codeTtlSeconds
    });
  } catch (error) {
    logger.error('request_failed', error);

    if (error.message?.startsWith('Enter') || error.message?.startsWith('Invalid')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
