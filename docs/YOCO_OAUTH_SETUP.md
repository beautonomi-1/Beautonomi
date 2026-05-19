# Yoco OAuth setup & operations runbook

**Owner**: Engineering + Payments
**Last reviewed**: 2026-05-17
**Audience**: Platform operators (Beautonomi), white-label tenants, and on-call engineers.

This document covers everything needed to (a) register a Yoco OAuth application, (b) configure Beautonomi to use it, (c) onboard a provider via the OAuth flow, (d) roll out the new credential-mode architecture to existing providers, and (e) recover from common failure modes.

If you are looking for the compliance / PCI angle, see [`PAYMENTS_MOBILE_COMPLIANCE.md`](./PAYMENTS_MOBILE_COMPLIANCE.md) §7.

---

## 1. Why OAuth (and why we kept the dashboard-key paste path)

Yoco exposes **two distinct APIs** that look similar in their docs but use **completely different authentication**:

| API | Host | Auth | Lets you do |
|---|---|---|---|
| **Checkout API** | `payments.yoco.com` | Dashboard secret key (`sk_live_…` / `sk_test_…`) sent as `Bearer` | Create one-off **hosted checkout pages** the customer pays on in their browser. **Cannot** provision card terminals. |
| **Yoco API** (Web POS / Orders / Payments) | `api.yoco.com` | OAuth 2.0 JWT access token from `iam.yoco.com` | Provision Web POS card terminals, charge them, list payments, manage webhooks, etc. |

The original code in `apps/web/src/app/api/provider/yoco/devices/route.ts` was sending a dashboard `sk_live_…` to `POST api.yoco.com/v1/webpos/`, which always failed with `"The provided credentials are invalid"`. That endpoint requires an OAuth JWT.

The current architecture supports **both**:

- `credential_mode = 'oauth'` — provider went through OAuth, can use real Web POS terminals.
- `credential_mode = 'checkout'` — provider only pasted dashboard keys, can use hosted-checkout links / QR codes (no terminal).
- `credential_mode = 'none'` — not connected yet.

A provider can have both stored at the same time; OAuth wins for terminal operations, and Checkout keys remain available for online links.

---

## 2. Register a Yoco OAuth app

You need this once per environment (sandbox + live) for the **platform-default** app, and optionally once more per **white-label tenant** that wants its own consent screen.

1. Email `developers@yoco.com` (or use the Yoco developer portal once it's GA) and ask to be registered as an **OAuth partner**. You will receive:
   - `client_id`
   - `client_secret`
   - The ability to declare one or more `redirect_uri` values.
2. Provide Yoco the following redirect URIs:
   - **Live**: `https://app.beautonomi.com/api/provider/yoco/oauth/callback`
   - **Sandbox / staging**: `https://staging.beautonomi.com/api/provider/yoco/oauth/callback`
   - (Each white-label tenant brand: `https://<tenant>.example.com/api/provider/yoco/oauth/callback`)
3. Request the scopes Beautonomi needs:
   - `openid`
   - `offline_access` (required for the refresh token)
   - `business/webpos:read`
   - `business/webpos:write`
   - `business/payments:read`
   - `business/webhooks:write` (so we can auto-register webhook subscriptions on callback)

Yoco will return the app credentials over a secure channel. Treat `client_secret` like any other production secret.

---

## 3. Configure Beautonomi (single-platform default)

### 3.1 Environment variables (Vercel + local `.env.local`)

```bash
# Which environment to default new integrations to. Providers can override per-integration row in DB if needed.
YOCO_ENV=live

# Live OAuth app
YOCO_OAUTH_CLIENT_ID=...
YOCO_OAUTH_CLIENT_SECRET=...
YOCO_OAUTH_REDIRECT_URI=https://app.beautonomi.com/api/provider/yoco/oauth/callback

# Sandbox OAuth app (used when a provider explicitly picks "Sandbox" environment, or when YOCO_ENV=sandbox)
YOCO_OAUTH_CLIENT_ID_SANDBOX=...
YOCO_OAUTH_CLIENT_SECRET_SANDBOX=...
YOCO_OAUTH_REDIRECT_URI_SANDBOX=https://staging.beautonomi.com/api/provider/yoco/oauth/callback
```

Add the same variables to the GitHub Actions / preview-deploy secret store for CI.

### 3.2 Default scopes (optional)

If you want to change which scopes are requested without redeploying, set `default_scopes` in the `tenant_yoco_oauth_apps` row (see §4). Otherwise the resolver uses the hard-coded default:

```
openid offline_access business/webpos:read business/webpos:write business/payments:read business/webhooks:write
```

### 3.3 Apply migrations

```bash
pnpm supabase db push
# or, for a specific migration:
pnpm supabase migration up --include 610_yoco_oauth_credential_mode.sql
```

The migration creates:

- `tenant_yoco_oauth_apps` (per-tenant + global OAuth client credentials)
- `provider_yoco_oauth_tokens` (per-provider access + refresh tokens)
- `yoco_oauth_states` (short-lived CSRF state for the authorize→callback handshake)
- New columns `credential_mode` + `environment` on `provider_yoco_integrations`
- New column `credential_mode` on `provider_yoco_devices`
- RLS + `updated_at` triggers on all three new tables
- A backfill that flips existing enabled integrations with a saved secret key to `credential_mode = 'checkout'` (see §6).

---

## 4. Per-tenant overrides (white-label)

A white-label tenant that wants its own Yoco consent screen ("Connect to **Bella Boutique**" instead of "Connect to **Beautonomi**") should register their own Yoco OAuth app and store the credentials per-tenant.

### 4.1 Insert a tenant row

Currently this is done via SQL (an admin UI is a follow-up). As a service-role admin:

```sql
INSERT INTO tenant_yoco_oauth_apps
  (tenant_id, environment, client_id, client_secret, redirect_uri, default_scopes, is_enabled)
VALUES
  ('00000000-0000-0000-0000-000000000123', 'live',
   'tenant-client-id-from-yoco',
   'tenant-client-secret-from-yoco',
   'https://bella.example.com/api/provider/yoco/oauth/callback',
   'openid offline_access business/webpos:read business/webpos:write business/payments:read',
   true);
```

The `tenant_id` must match `tenants.id`. A `tenant_id IS NULL` row is the **global default** that any tenant falls back to when no tenant-specific row exists.

### 4.2 Resolution order

`resolveOauthApp(tenantId, env, supabase)` in `apps/web/src/lib/payments/yoco-oauth.ts` resolves credentials in this order:

1. **Tenant row** — `tenant_id = $tenantId AND environment = $env AND is_enabled = true`
2. **Global row** — `tenant_id IS NULL AND environment = $env AND is_enabled = true`
3. **Env vars** — `YOCO_OAUTH_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` (suffixed `_SANDBOX` for sandbox)

If nothing is found, the route returns a `YOCO_OAUTH_UNCONFIGURED` error and the UI shows an actionable "Yoco OAuth is not configured for this environment" message.

### 4.3 Rotating tenant secrets

`UPDATE tenant_yoco_oauth_apps SET client_secret = '...' WHERE id = '...'` is safe at any time — the next OAuth handshake picks it up immediately because secrets are read fresh per request. Existing access tokens continue to work until they expire; existing refresh tokens continue to work as long as Yoco hasn't revoked them.

---

## 5. Provider connect UX

### 5.1 Web

1. Provider opens **Settings → Sales → Yoco integration** (`/provider/settings/sales/yoco-integration`).
2. Clicks **Connect Yoco** in the primary section.
3. Browser redirects to `iam.yoco.com/oauth2/authorize?...`.
4. Provider logs in to Yoco and grants consent.
5. Yoco redirects back to `/api/provider/yoco/oauth/callback?code=...&state=...`.
6. Callback exchanges the code for `access_token` + `refresh_token`, upserts `provider_yoco_oauth_tokens`, flips `provider_yoco_integrations.credential_mode = 'oauth'`, and auto-registers a webhook subscription.
7. Provider lands back on the settings page with `?yoco_connected=1`, toast confirms success.

If the provider only wants hosted-checkout links (no terminal), they expand **Advanced — Hosted checkout keys** and paste `sk_live_…` + `pk_live_…` + (optional) webhook secret. The integration row gets `credential_mode = 'checkout'`.

### 5.2 Mobile (Provider app)

1. Provider opens **Settings → Yoco devices** (`apps/provider/app/(app)/(tabs)/more/settings/yoco-devices.tsx`).
2. Taps **Connect Yoco** — `useYocoIntegration.connectOauth()` calls `Linking.openURL(<webBase>/api/provider/yoco/oauth/authorize?return_to=<webBase>/provider/settings/sales/yoco-integration?from=mobile)`.
3. System browser handles consent.
4. Yoco redirects back into the web settings page; provider taps **Back to app**.
5. `AppState` foreground listener in `useYocoIntegration` calls `reloadIntegration()`, picking up the new `credential_mode = 'oauth'`.
6. Devices section unlocks the **Add device** button.

If the provider only wants hosted-checkout links, they tap **Use Checkout API keys instead** and paste the keys in the existing sheet.

---

## 6. Rollout / backfill

The plan is intentionally non-disruptive — existing providers keep working while they migrate.

### 6.1 Feature flag

The new architecture is behind feature flag **`yoco_oauth_v2`** (read from the `feature_flags` table). When **off**, the UI hides the "Connect Yoco" button and the legacy paste-keys flow remains the only option (but devices still won't actually work — that's the original bug). When **on**, both options appear.

Recommended sequence:

1. Apply migration 610 (safe — additive only, except the backfill flips existing `credential_mode` from `'none'` to `'checkout'` for already-enabled integrations).
2. Turn `yoco_oauth_v2` on **only for internal tenants** for ~1 week of dogfooding.
3. Run pilot with 2–3 friendly providers; verify Web POS device creation, payment, and webhook delivery end-to-end on live.
4. Turn `yoco_oauth_v2` on globally.

### 6.2 Migration banner

Once `yoco_oauth_v2` is on, every provider with `credential_mode = 'checkout'` (i.e. they pasted keys before OAuth existed) sees a one-time banner:

> **Card terminals now require a one-time Yoco reconnect.** Tap **Connect Yoco** to enable Web POS devices. Your existing online checkout keys keep working.

Dismissing the banner does not disable anything — they can use hosted-checkout links indefinitely. The banner returns until they either complete OAuth or explicitly opt out (stored in `provider_yoco_integrations.banner_dismissed_at`).

### 6.3 Rollback

If something goes wrong, turn `yoco_oauth_v2` off — this immediately hides the "Connect Yoco" button. Existing OAuth tokens **continue to work** for already-connected providers; the flag only controls UI surfacing.

To fully rollback the migration (rarely needed):

```sql
-- Reverts credential_mode to NULL across the board; preserves rows in the new tables in case you re-enable later.
ALTER TABLE provider_yoco_integrations DROP COLUMN credential_mode;
ALTER TABLE provider_yoco_integrations DROP COLUMN environment;
ALTER TABLE provider_yoco_devices DROP COLUMN credential_mode;
-- The three new tables (tenant_yoco_oauth_apps, provider_yoco_oauth_tokens, yoco_oauth_states) can be left in place.
```

---

## 7. Token lifecycle

| Phase | What happens | Where |
|---|---|---|
| **Issue** | `POST iam.yoco.com/oauth2/token` returns `{ access_token, refresh_token, expires_in, scope, id_token }`. We compute `expires_at = now + expires_in - 30s` and upsert into `provider_yoco_oauth_tokens`. | `exchangeCodeForToken` in `yoco-oauth.ts` |
| **Use** | Every Yoco API call goes through `getValidAccessToken(providerId)`. If `expires_at` is within a 5-minute buffer, the helper refreshes synchronously before returning. | `getValidAccessToken` in `yoco-oauth.ts` |
| **Refresh** | `POST iam.yoco.com/oauth2/token` with `grant_type=refresh_token`. New `access_token` and (if Yoco issues one) `refresh_token` are written back; `last_refreshed_at` updated. | `refreshAccessToken` in `yoco-oauth.ts` |
| **Refresh failure** | The error is stored in `provider_yoco_oauth_tokens.last_refresh_error`. Subsequent API calls throw `YocoOAuthRequired` with code `YOCO_OAUTH_EXPIRED`. The UI surfaces a "Reconnect Yoco" banner. | `getValidAccessToken` + `useYocoIntegration` |
| **Revoke** | Provider taps **Disconnect**. `DELETE provider_yoco_oauth_tokens` for that provider. `credential_mode` reverts to `'checkout'` if dashboard keys exist, else `'none'`. | `/api/provider/yoco/oauth/disconnect/route.ts` |

There is **no proactive refresh cron** today — refresh is lazy on first use after expiry. This is fine for active providers but means a provider who hasn't logged in for >Yoco's refresh-token TTL (currently ~30 days) will need to reconnect. A background pre-emptive refresher is a follow-up.

---

## 8. Webhooks

### 8.1 Auto-registration

When a provider completes OAuth, the callback also calls `POST api.yoco.com/v1/webhooks/subscriptions/` with:

- `url = https://<host>/api/provider/yoco/webhook?provider=<providerId>`
- `events = ['payment.succeeded', 'payment.failed', 'payment.refunded']`

The returned `secret` is stored in `provider_yoco_webhooks.signing_secret` and used to verify HMAC signatures on incoming events.

If auto-registration fails (network blip, scope missing), the callback still succeeds and logs the error. The provider can re-trigger it from settings via **Reconnect Yoco**.

### 8.2 Event handling

`/api/provider/yoco/webhook/route.ts` handles both shapes:

- **Yoco API events**: `type = 'payment.succeeded' | 'payment.failed' | 'payment.refunded' | 'payment.created'` with `payload` envelope. Used when `credential_mode = 'oauth'`.
- **Checkout API events**: `type = 'payment.notification'` with `data` envelope. Used when `credential_mode = 'checkout'`.

Both are normalized by `normalizePaymentEvent` before being persisted to `provider_yoco_payments`.

### 8.3 Manual registration (fallback)

If the auto-registration scope was missing, the provider can register the webhook manually in the Yoco dashboard pointing at the same URL, and paste the signing secret into the Checkout-keys form. This works for both modes.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| OAuth flow returns `yoco_error=invalid_state` | State row expired (>10 min) or replayed | Provider re-clicks **Connect Yoco**. Don't bookmark callback URLs. |
| OAuth flow returns `yoco_error=token_exchange_failed` | Wrong `client_secret` or `redirect_uri` mismatch | Verify env vars match what Yoco has on file. Yoco enforces exact-match `redirect_uri`. |
| `YOCO_OAUTH_UNCONFIGURED` shown in UI | No tenant row, no global row, no env vars for this environment | Insert a `tenant_yoco_oauth_apps` row or set `YOCO_OAUTH_CLIENT_ID(_SANDBOX)`. |
| `YOCO_OAUTH_EXPIRED` returned by an API call | Refresh token rejected (revoked or expired) | Provider clicks **Reconnect Yoco** to redo the handshake. |
| `YOCO_CHECKOUT_KEY_INVALID` on a hosted-checkout charge | Dashboard secret key was revoked or is for the wrong environment | Provider opens **Advanced — Hosted checkout keys** and re-pastes a valid `sk_live_…`. |
| Device creation returns `CREDENTIALS_REQUIRED` | `credential_mode = 'none'` | Provider taps **Connect Yoco** to switch to OAuth. |
| Adding a device works on web but mobile shows "OAuth required" | Mobile cached old integration state | Pull-to-refresh on the devices screen, or background+foreground the app to trigger `reloadIntegration()`. |
| Webhook signature verification fails | `webhook_secret` mismatch (rotation) | Re-run **Reconnect Yoco** to re-register the subscription, or paste a new secret manually in the Checkout keys form. |

### 9.1 Logs to check

- Server: search Vercel logs for `Yoco OAuth:` and `Yoco webhook:` prefixes — both are intentionally unique and grep-friendly.
- Client (mobile): RN logs print `[useYocoIntegration]` and `[useYocoPayment]` prefixes.

### 9.2 SQL pokes

```sql
-- See which mode each enabled provider is in
SELECT provider_id, credential_mode, environment, is_enabled
FROM provider_yoco_integrations
WHERE is_enabled = true
ORDER BY updated_at DESC;

-- See current OAuth token state for a provider
SELECT provider_id, environment, business_name, expires_at, last_refreshed_at, last_refresh_error
FROM provider_yoco_oauth_tokens
WHERE provider_id = '<uuid>';

-- See which OAuth app a tenant resolves to (live)
SELECT * FROM tenant_yoco_oauth_apps
WHERE (tenant_id = '<uuid>' OR tenant_id IS NULL)
  AND environment = 'live'
  AND is_enabled = true
ORDER BY tenant_id NULLS LAST  -- tenant row wins over global
LIMIT 1;
```

---

## 10. Security checklist

- [ ] `YOCO_OAUTH_CLIENT_SECRET` and `tenant_yoco_oauth_apps.client_secret` are never committed to git, never returned by any API response, and never logged.
- [ ] `provider_yoco_oauth_tokens` RLS: read restricted to owner/admin; write restricted to service role.
- [ ] `yoco_oauth_states` has a 10-minute TTL and is deleted on use (single-use state).
- [ ] OAuth `state` is at least 256 bits of randomness — `generateState()` uses `crypto.randomBytes(32)`.
- [ ] Token refresh failures persist `last_refresh_error` (so we can monitor) but do **not** leak the refresh token itself in error messages or logs.
- [ ] Callback `redirect_uri` is validated against the registered `redirect_uri` server-side (Yoco enforces this) and the `return_to` is validated against the deploy's own origin.

---

## 11. Open follow-ups (not in this PR)

- Admin UI to manage `tenant_yoco_oauth_apps` per tenant brand (currently SQL only).
- Background cron to pre-emptively refresh tokens expiring in <24h (currently lazy refresh on first use).
- Rotation endpoint for webhook signing secret via `/v1/webhooks/subscriptions/{id}/secret`.
- Dashboard view of "Providers with OAuth refresh errors in the last 7 days" for proactive outreach.

---

## 12. Change log

| Date | Author | Change |
|---|---|---|
| 2026-05-17 | Engineering | Initial document. Yoco OAuth 2.0 introduction, env vars, per-tenant overrides, provider connect UX (web + mobile), rollout / rollback, token lifecycle, webhooks, troubleshooting. |
