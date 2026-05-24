import { getAuthToken, handleCors, json, methodNotAllowed, serverError } from '../lib/http.js';
import { refreshPocketBaseAuth } from '../lib/pocketbase.js';
import { normalizeEmail } from '../lib/security.js';
import { isExternalUserVerified } from '../lib/verificationStore.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  try {
    const authToken = getAuthToken(req);

    if (!authToken) {
      return json(res, 401, { success: false, error: 'Missing PocketBase auth token.' });
    }

    const authData = await refreshPocketBaseAuth(authToken);
    const record = authData.record;
    const email = normalizeEmail(record.email);
    const externallyVerified = await isExternalUserVerified(record.id, email);
    const pocketBaseVerified = record.verified === true;

    return json(res, 200, {
      success: true,
      verified: pocketBaseVerified || externallyVerified,
      pocketBaseVerified,
      externallyVerified,
      userId: record.id,
      email
    });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return json(res, error.status, { success: false, error: 'Invalid PocketBase auth token.' });
    }

    return serverError(res, error.message);
  }
}
