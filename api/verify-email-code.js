import { verificationConfig } from '../lib/config.js';
import { badRequest, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { codeMatches, normalizeCode, normalizeEmail, normalizePurpose } from '../lib/security.js';
import {
  createVerificationToken,
  deleteVerification,
  getVerification,
  updateVerification
} from '../lib/verificationStore.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const purpose = normalizePurpose(body.purpose);
    const code = normalizeCode(body.code);
    const config = verificationConfig();
    const record = await getVerification(purpose, email);

    if (!record || record.expiresAt <= Date.now()) {
      await deleteVerification(purpose, email);
      return badRequest(res, 'The verification code has expired. Please request a new code.');
    }

    if (record.attemptsLeft <= 0) {
      await deleteVerification(purpose, email);
      return badRequest(res, 'Too many incorrect attempts. Please request a new code.');
    }

    if (!codeMatches(record.codeHash, email, purpose, code)) {
      record.attemptsLeft -= 1;

      if (record.attemptsLeft <= 0) {
        await deleteVerification(purpose, email);
        return badRequest(res, 'Too many incorrect attempts. Please request a new code.');
      }

      await updateVerification(purpose, email, record);
      return badRequest(res, 'Invalid verification code.', { attemptsLeft: record.attemptsLeft });
    }

    await deleteVerification(purpose, email);

    const verificationToken = await createVerificationToken({
      email,
      purpose,
      ttlSeconds: config.tokenTtlSeconds
    });

    return json(res, 200, {
      success: true,
      verificationToken,
      expiresIn: config.tokenTtlSeconds
    });
  } catch (error) {
    if (error.message?.startsWith('Enter') || error.message?.startsWith('Invalid')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
