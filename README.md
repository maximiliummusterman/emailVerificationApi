# Guandan Email Verification API

Small Vercel serverless API for email verification with six-digit Resend codes. It avoids PocketBase hooks, PocketBase migrations, PocketBase production filesystem access, and frontend secrets.

## Why This Exists

PocketBase email verification requires server-side PocketBase settings/hooks. If you cannot access the hosted PocketBase files/config/restart, this API verifies email before creating a PocketBase user.

## Required Services

- Vercel project for this folder.
- Resend API key with `guandan.de` verified.
- Upstash Redis or Vercel KV. Use the REST URL and REST token.

## Environment Variables

Set these in Vercel Project Settings, not in frontend code:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM=Guandan <no-reply@guandan.de>
RESEND_REPLY_TO=no-reply@guandan.de
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CODE_PEPPER=generate-a-long-random-secret
POCKETBASE_URL=https://guandan.de/hcgi/platform
ALLOWED_ORIGINS=https://guandan.de,https://www.guandan.de,https://164361ea-3280-4df4-963e-f7be8de4b15a.app-preview.com,http://localhost:3000,http://localhost:5173
```

Optional tuning:

```text
CODE_TTL_SECONDS=600
VERIFICATION_TOKEN_TTL_SECONDS=600
MAX_VERIFY_ATTEMPTS=5
RATE_LIMIT_WINDOW_SECONDS=900
SEND_RATE_LIMIT_EMAIL_MAX=3
SEND_RATE_LIMIT_IP_MAX=20
EXTERNAL_VERIFICATION_TTL_SECONDS=0
```

`EXTERNAL_VERIFICATION_TTL_SECONDS=0` means existing-user verification markers do not expire.

Generate `CODE_PEPPER` with something like:

```bash
openssl rand -base64 48
```

## Endpoints

### `POST /api/send-verification-code`

Request:

```json
{
  "email": "player@example.com",
  "purpose": "signup"
}
```

`purpose` can be `signup` or `existing-user`.

Response:

```json
{
  "success": true,
  "expiresIn": 600
}
```

### `POST /api/verify-email-code`

Request:

```json
{
  "email": "player@example.com",
  "purpose": "signup",
  "code": "123456"
}
```

Response:

```json
{
  "success": true,
  "verificationToken": "temporary-one-time-token",
  "expiresIn": 600
}
```

### `POST /api/complete-signup`

Creates and logs in a PocketBase user after signup email verification.

Request:

```json
{
  "email": "player@example.com",
  "username": "Player",
  "password": "password123",
  "verificationToken": "temporary-one-time-token"
}
```

Response:

```json
{
  "success": true,
  "token": "pocketbase-auth-token",
  "record": {}
}
```

In the frontend, save the auth data with:

```js
pb.authStore.save(result.token, result.record);
```

### `POST /api/complete-existing-user-verification`

Marks an already-created PocketBase user as externally verified. Requires the user to already be signed in to PocketBase.

Headers:

```text
Authorization: Bearer <pocketbase-auth-token>
```

Request:

```json
{
  "email": "player@example.com",
  "verificationToken": "temporary-one-time-token"
}
```

### `GET /api/check-existing-user-verification`

Checks if the signed-in PocketBase user is verified either in PocketBase or in this external verification service.

Headers:

```text
Authorization: Bearer <pocketbase-auth-token>
```

## Signup Frontend Flow

1. User enters email, username, password.
2. Call `/api/send-verification-code` with `purpose: "signup"`.
3. User enters the six-digit code.
4. Call `/api/verify-email-code` with `purpose: "signup"`.
5. Call `/api/complete-signup` with email, username, password, and `verificationToken`.
6. Save returned PocketBase auth data with `pb.authStore.save(token, record)`.
7. This endpoint also stores the user as externally verified, so future calls to `/api/check-existing-user-verification` return `verified: true`.

Do not call `pb.collection('users').create(...)` directly from the signup UI after this change.

## Already Signed-Up Users

Yes, existing users can be verified with this workaround, but it does not modify PocketBase's built-in `verified` field unless you also have PocketBase admin access.

Flow:

1. User logs in with PocketBase password auth.
2. Frontend calls `/api/check-existing-user-verification` with the PocketBase auth token.
3. If `verified` is false, send a code with `purpose: "existing-user"`.
4. Verify the code with `/api/verify-email-code` using `purpose: "existing-user"`.
5. Call `/api/complete-existing-user-verification` with the PocketBase auth token and the returned `verificationToken`.
6. On future logins, `/api/check-existing-user-verification` returns `verified: true`.

Important limitation: PocketBase itself will not know about this external verification marker. If you need backend-enforced security, you must eventually change PocketBase rules/config or use a PocketBase admin credential from a trusted backend.

## Deployment

1. Create a new Vercel project from this `email-verification-api` folder.
2. Add the environment variables above.
3. Deploy.
4. Optionally add a custom domain such as `verify.guandan.de`.
5. Set `ALLOWED_ORIGINS` to your production frontend origin and any preview origins you use.

For your current Hostinger preview, include:

```text
https://164361ea-3280-4df4-963e-f7be8de4b15a.app-preview.com
```

The API also supports wildcard origins such as:

```text
https://*.app-preview.com
```

After changing Vercel environment variables, redeploy the API.

If deploying from the full Guandan repository, set Vercel's Project Settings -> Build and Development Settings -> Root Directory to `email-verification-api`. If the root directory is wrong, Vercel will deploy the wrong folder and every `/api/...` endpoint will return `404: NOT_FOUND`.

After deployment, test:

```text
https://your-vercel-domain.vercel.app/api/health
```

The project also rewrites `/` to `/api/health`, so the base URL should return the same health response after redeploying this version.

The health response includes safe configuration checks like `hasResendApiKey` and `hasUpstashToken`. It does not expose secret values.

## Security Notes

- Rotate any Resend API key that was pasted into chat or frontend code.
- Never expose `RESEND_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, or `CODE_PEPPER` in the web app.
- Codes expire after 10 minutes by default.
- Codes are stored as HMAC hashes, not plaintext.
- Verification tokens are one-time server-side tokens stored in Redis.
- Rate limits are enforced per email and per IP.

## Debugging Logs

Frontend logs are written to the browser console with the prefix:

```text
[email-verification]
```

These logs show the endpoint URL, HTTP status, duration, and sanitized response. Passwords, codes, auth tokens, and verification tokens are redacted.

Server logs are written to Vercel Function Logs as JSON lines. In Vercel, open:

```text
Project -> Logs
```

Look for events such as:

```text
request_start
request_body_parsed
verification_saved
resend_send_start
resend_send_success
code_valid
pocketbase_create_user_start
pocketbase_request_failed
request_failed
```

Each request has a `requestId` so you can follow one request across all log lines. Secrets and raw codes are not logged.
