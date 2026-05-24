import { verificationConfig } from '../lib/config.js';
import { badRequest, handleCors, json, methodNotAllowed, readJson, serverError } from '../lib/http.js';
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
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const body = await readJson(req);
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

    if (!tokenRecord || tokenRecord.email !== email || tokenRecord.expiresAt <= Date.now()) {
      return badRequest(res, 'Email verification expired. Please request a new code.');
    }

    try {
      await createPocketBaseUser({ email, username, password });
      const authData = await authPocketBaseUser({ email, password });
      const config = verificationConfig();

      await markExternalUserVerified({
        userId: authData.record.id,
        email,
        ttlSeconds: config.externalVerificationTtlSeconds
      });

      await deleteVerificationToken('signup', verificationToken);

      return json(res, 200, {
        success: true,
        token: authData.token,
        record: authData.record
      });
    } catch (error) {
      return json(res, error.status || 502, {
        success: false,
        error: pocketBaseErrorMessage(error)
      });
    }
  } catch (error) {
    if (error.message?.startsWith('Enter')) {
      return badRequest(res, error.message);
    }

    return serverError(res, error.message);
  }
}
