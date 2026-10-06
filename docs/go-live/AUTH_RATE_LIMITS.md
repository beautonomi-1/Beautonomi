# Auth rate limits (web)

## Upstash (production)

Password sign-in, OTP verify, and payment init **fail closed** when `VERCEL_ENV=production` and Upstash is missing. Configure in **Vercel Production**:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Verify manually in the Vercel dashboard or export env locally before `node scripts/prod/go-live-check.mjs` (check `repo.upstash_auth`).

## Prefixes (web)

| Prefix | Route(s) | Default limit |
|--------|----------|----------------|
| `sign-in-password` | `POST /api/auth/sign-in` | 10 / 15 min / IP |
| `sign-in-password-fail` | Failed password only | 10 / 15 min / IP |
| `account-link` | `POST /api/auth/account-link` | 15 / 15 min / IP |
| `app-review-verify` | `POST /api/auth/app-review/verify-otp` | 30 / 15 min / IP |
| `otp-verify:ip` / `otp-verify:identity` | `POST /api/auth/otp/verify` | 30 IP / 8 identity / 15 min |
| `otp-send:ip` / `otp-send:identity` | `POST /api/auth/otp/send` | 20 IP / 6 identity / 15 min |
| `auth-risk-ip` | OTP send + sign-in captcha challenge | 3 / 15 min / IP |

## Client UX

- **429** responses include `Retry-After`.
- **Login** and **LoginModal**: live cooldown + disabled submits while limited.
- **Booking gate** and **inline signup OTP send**: one toast with fixed `retryAfterSeconds` (no live countdown).

## Symptoms

| User report | Likely cause |
|-------------|----------------|
| 429 on password from `/login` | Shared office IP hitting `sign-in-password` or fail bucket |
| Immediate 429 with no attempts | Production missing Upstash (fail-closed) |
| 429 on OTP verify | `otp-verify:identity` or IP bucket |
