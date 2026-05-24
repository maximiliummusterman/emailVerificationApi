import { handleCors, json } from '../lib/http.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;

  return json(res, 200, {
    success: true,
    service: 'guandan-email-verification-api'
  });
}
