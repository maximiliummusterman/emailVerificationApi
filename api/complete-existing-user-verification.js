import { verificationConfig } from '../lib/config.js';
import { badRequest, getAuthToken, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
import { refreshPocketBaseAuth } from '../lib/pocketbase.js';
import { normalizeEmail } from '../lib/security.js';
import {
  deleteVerificationToken,
  getVerificationToken,
  markExternalUserVerified
} from '../lib/verificationStore.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const authToken = getAuthToken(req);

    if (!authToken) {
      return json(res, 401, { success: false, error: 'Missing PocketBase auth token.' });
    }

    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const verificationToken = String(body.verificationToken || '').trim();

    if (!verificationToken) {
      return badRequest(res, 'Missing verification token.');
    }

    const authData = await refreshPocketBaseAuth(authToken);
    const record = authData.record;
    const recordEmail = normalizeEmail(record.email);

    if (recordEmail !== email) {
      return json(res, 403, { success: false, error: 'The verified email does not match the signed-in user.' });
    }

    const tokenRecord = await getVerificationToken('existing-user', verificationToken);

    if (!tokenRecord || tokenRecord.email !== email || tokenRecord.expiresAt <= Date.now()) {
      return badRequest(res, 'Email verification expired. Please request a new code.');
    }

    const config = verificationConfig();
    const verifiedRecord = await markExternalUserVerified({
      userId: record.id,
      email,
      ttlSeconds: config.externalVerificationTtlSeconds
    });

    await deleteVerificationToken('existing-user', verificationToken);

    return json(res, 200, {
      success: true,
      verified: true,
      userId: record.id,
      email,
      verifiedAt: verifiedRecord.verifiedAt
    });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return json(res, error.status, { success: false, error: 'Invalid PocketBase auth token.' });
    }

    if (error.message?.startsWith('Enter')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
