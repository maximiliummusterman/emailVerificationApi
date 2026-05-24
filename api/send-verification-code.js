import { verificationConfig } from '../lib/config.js';
import { badRequest, getClientIp, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { sendVerificationEmail } from '../lib/resend.js';
import { generateCode, hashCode, keyHash, normalizeEmail, normalizePurpose } from '../lib/security.js';
import { deleteVerification, saveVerification } from '../lib/verificationStore.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const purpose = normalizePurpose(body.purpose);
    const ip = getClientIp(req);
    const config = verificationConfig();

    const emailLimit = await checkRateLimit(
      `guandan:email-verification:rate:email:${purpose}:${keyHash(email)}`,
      config.emailSendLimit,
      config.rateLimitWindowSeconds
    );

    if (!emailLimit.allowed) {
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
      return json(res, 429, {
        success: false,
        error: 'Too many verification requests. Please wait and try again.'
      });
    }

    const code = generateCode();
    const codeHash = hashCode(email, purpose, code);

    await saveVerification({
      email,
      purpose,
      codeHash,
      ttlSeconds: config.codeTtlSeconds,
      maxAttempts: config.maxAttempts
    });

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      await deleteVerification(purpose, email);
      return json(res, 502, {
        success: false,
        error: error.message || 'Could not send verification email.'
      });
    }

    return json(res, 200, {
      success: true,
      expiresIn: config.codeTtlSeconds
    });
  } catch (error) {
    if (error.message?.startsWith('Enter') || error.message?.startsWith('Invalid')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
