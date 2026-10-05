# CSP & Paystack readiness (report-only → enforce)

## Current setup

- **Enforced CSP:** `apps/web/next.config.mjs` (production responses).
- **Report-only CSP:** `apps/web/src/proxy.ts` via `buildReportOnlyCsp` — use browser console / reporting endpoint to triage violations **before** tightening policy.

## Paystack checkout

Web card pay uses Paystack **hosted checkout** (`authorization_url` redirect). That flow does **not** require loading Paystack checkout JS on the booking page in the common path.

Before enabling **`strict-dynamic`** or removing `'unsafe-inline'`:

1. On staging, complete a **test card** booking through the payment step.
2. Confirm report-only CSP logs show **no blockers** for:
   - Same-origin booking + API calls
   - Redirect to `checkout.paystack.com` (or test host)
   - Return/callback URLs after payment
3. If inline scripts are required on a return page, document the nonce/hash exception explicitly.

## Turnstile (adjacent)

When `TURNSTILE_SECRET_KEY` is set, OTP send and optional public booking captcha may load Cloudflare Turnstile — ensure CSP `script-src` / `frame-src` allow Turnstile domains on staging before enabling in production.

## Action

Keep **report-only** on staging until one clean Paystack E2E + gate OTP session is captured in CSP reports. Only then mirror stricter rules to enforced CSP in `next.config.mjs`.
