# Security Hardening

Production security measures and checklists for the Beautonomi stack (web, customer/provider Expo, Supabase).

## 1. Public endpoint safety

### Rule

All `/api/public/*` and `/api/feature-flags/check` responses must use **explicit field whitelisting**. Never pass through full DB rows or `settings` objects that might contain secret columns.

### Implemented

- **analytics-config** (`apps/web/src/app/api/public/analytics-config/route.ts`): Returns only `api_key_public`, `environment`, `enabled_*`, `guides_enabled`, `surveys_enabled`, `sampling_rate`, `debug_mode`. No `api_key_server` or secret keys.
- **third-party-config** (`apps/web/src/app/api/public/third-party-config/route.ts`): Picks only safe keys per service (e.g. OneSignal `app_id`, Mapbox `public_token`). No REST API keys or secrets.
- **settings/branding** (`apps/web/src/app/api/public/settings/branding/route.ts`): Whitelists `site_name`, `logo_url`, `favicon_url`, `primary_color`, `secondary_color`. No passthrough of raw `settings.branding`.
- **config-bundle** (`apps/web/src/lib/config/getPublicConfigBundle`): Composes safe shapes only; no secrets. Tested in `apps/web/src/app/api/public/config-bundle/__tests__/route.test.ts` (FORBIDDEN_KEYS check).
- **feature-flags/check**: Returns only `enabled` (GET) or `features: { [key]: boolean }` (POST). Selects only `feature_key`, `enabled` from DB.

### Verification

- Run: `node scripts/prod/verify-public-endpoints.mjs` (see script for usage).
- Tests: `apps/web/src/app/api/public/__tests__/public-config-safety.test.ts`, `apps/web/src/app/api/public/config-bundle/__tests__/route.test.ts`.

---

## 2. Auth and role enforcement

### Provider routes (`/api/provider/*`)

- **Pattern:** After `requireRoleInApi(['provider_owner','provider_staff'], request)`, resolve provider context with `getProviderIdForUser(user.id, supabase)` and scope all reads/writes to that `provider_id`.
- **Superadmin:** Some routes allow `superadmin` with optional `?provider_id=` for support; must still enforce either current user’s provider or explicit superadmin param.
- **Guardrail:** `scripts/prod/readiness-check.mjs` includes a heuristic scan for provider route files that may be missing `getProviderIdForUser` (see script output).

### Admin routes (`/api/admin/*`)

- **Pattern:** `requireRoleInApi(['superadmin'])` or `requireRole(['superadmin'])` at the start of each handler.
- **Confirmed:** Admin users, settings, feature-flags, control-plane, gift-cards, webhooks, impersonation, etc. all require superadmin.

### Server-only keys

- `SUPABASE_SERVICE_ROLE_KEY` is used only in server code (API routes, cron, webhooks). It is never exposed to client bundles (Next.js only inlines `NEXT_PUBLIC_*` and Expo `EXPO_PUBLIC_*`).

---

## 3. Webhook hardening

### Paystack (`POST /api/payments/webhook`)

- **Signature:** HMAC-SHA512 of raw body with `x-paystack-signature` header. Secret from `getPaystackSecretKey()` (env or platform_secrets). Implemented in `apps/web/src/app/api/payments/webhook/route.ts`.
- **Idempotency:** Events stored in `webhook_events` with unique constraint on `(event_id, source)`. Duplicate events return 200 with `{ received: true, duplicate: true }` without re-processing.
- **Reference:** `apps/web/src/__tests__/api/booking-flow.test.ts` (signature verification), `apps/web/src/__tests__/api/payment-flows.test.ts`.

### Yoco (`POST /api/provider/yoco/webhook`)

- **Signature:** Validated via `x-yoco-signature` and `x-yoco-webhook-id`; secret from `provider_yoco_webhooks` or env. Implemented in `apps/web/src/app/api/provider/yoco/webhook/route.ts`.
- **Idempotency:** Events logged in `provider_yoco_webhook_events`; implement idempotency by event id if not already.

### OneSignal

- No inbound webhook route in repo; optional callbacks (e.g. for notification events) should verify OneSignal signatures if added. Document here when implemented.

### Future: Sumsub / Aura

- When adding webhooks for Sumsub or Aura, ensure: (1) signature verification per provider docs, (2) idempotency (e.g. event id in DB), (3) no secret leakage in logs or responses.

---

## 4. Checklist summary

| Item | Status |
|------|--------|
| Public endpoints whitelist (analytics-config, third-party-config, branding, config-bundle) | Done |
| Feature-flags/check returns only enabled/feature_key | Done |
| Provider routes use getProviderIdForUser for scoping | Audited; readiness-check heuristics added |
| Admin routes require superadmin | Done |
| Paystack webhook signature verification | Done |
| Paystack webhook idempotency (webhook_events) | Done |
| Yoco webhook signature verification | Done |
| Server role key never in client bundle | Verified (env naming) |
| RLS and roles (Supabase) | See `scripts/prod/verify-rls-and-roles.md` |
