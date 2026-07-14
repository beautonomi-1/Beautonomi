# Vercel Firewall & Mobile Apps

## Symptom

Provider or customer mobile apps fail with Sentry warnings like:

- `HTTP 429` on `/api/me/portal`, `/api/provider/devices`, `/api/public/third-party-config`, etc.
- `Server returned a web page instead of JSON (HTTP 429)`
- `provider_index_portal_exhausted`
- `Device registration rejected: Server returned a web page instead of JSON`

## Root cause

**Vercel Bot Protection** treats React Native `fetch` as non-browser traffic and returns an HTML challenge/block page (429), not Beautonomi JSON.

This is **not** the app-level Upstash rate limits in `apps/web/src/lib/rate-limit/`. Those return JSON with `Retry-After`.

Custom WAF rate limits on `/api/public/search` only affect those paths. Bot Protection is **global** and breaks all mobile API calls.

## Immediate fix (Vercel Dashboard)

1. Open **Vercel → Project → Firewall → Configure**
2. Add **Bypass** rules (higher priority than Bot Protection), e.g.:

| Rule name | If | Then |
|-----------|-----|------|
| Bypass authenticated API | Path starts with `/api/` **AND** Header `Authorization` exists | **Bypass** |
| Bypass mobile apps | Path starts with `/api/` **AND** Header `X-App` equals `provider` or `customer` | **Bypass** |
| Bypass webhooks | Path starts with `/api/webhooks/` | **Bypass** |
| Bypass cron | Path starts with `/api/cron/` | **Bypass** |

3. **Publish** firewall changes (no redeploy needed)

If issues persist, temporarily set **Bot Protection → Log only** to confirm, then re-enable with bypass rules above.

## What not to do

- Do **not** rely on search-only rate limits to protect mobile apps — they hit `/api/me/*`, `/api/provider/*`, etc.
- Do **not** embed `x-vercel-protection-bypass` in mobile app binaries — that secret is for CI/automation only.

## Verify

After bypass rules publish:

1. Provider app: sign out → sign in → home loads without `portal_exhausted`
2. Sentry: no new `HTML_ERROR` / 429 on `www.beautonomi.com/api/*`
3. `GET /api/me/portal` with `Authorization: Bearer …` returns JSON 200

## Related

- Search scrape rate limits: `/api/public/search`, `/api/public/providers/*` (custom WAF rules only)
- Webhooks: Paystack, Didit, Twilio under `/api/webhooks/*`
