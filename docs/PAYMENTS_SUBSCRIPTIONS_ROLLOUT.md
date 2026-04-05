# Payments, gateways, subscriptions, and rollout

This document ties together **tenant-driven payments**, **subscription entitlements**, and **operational rollout flags** so engineering and ops share one mental model. Normative security and NN-* rules remain in `docs/INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md`.

---

## 1. Payments and gateways

### 1.1 Feature flags (market killswitches)

Canonical keys live in `apps/web/src/lib/server/feature-flag-keys.ts` and are enforced through:

- `apps/web/src/lib/subscriptions/entitlements.ts` — `isPaystackEnabledForTenant`, `isWalletEnabledForTenant`, `isGiftCardsEnabledForTenant`, `getPaymentFeatureFlagsForTenant`
- Under the hood: `isFeatureEnabledServer` in `apps/web/src/lib/server/feature-flags.ts` (global row `tenant_id IS NULL`, overridden by a row for that `tenant_id`)

**Keys:** `payment_paystack`, `payment_wallet`, `gift_cards`

### 1.2 Paystack secrets and tenant

- Server: `getPaystackSecretKey({ tenantId })` resolves keys via region / tenant (see `apps/web/src/lib/payments/paystack-server.ts`).
- Webhook routing: `docs/PAYSTACK_WEBHOOK_ROUTING.md`.
- Booking / order **tenant alignment** on init and verify: `resolve-payment-tenant`, `provider-matches-host`, `bookingTenantMismatchResponse` on mutations.

### 1.3 Idempotency and money tables

- **Webhook ingress:** `POST /api/payments/webhook` inserts into `webhook_events` by Paystack `event_id`; duplicate → **200** and skip processing (`route.ts`). `payment_webhook_events` uses `tryRecordPaymentWebhookEvent` (unique per tenant + idempotency key).
- **`booking_payments`:** partial unique index on Paystack transaction id (migration **380**); handlers treat **23505** as already recorded where appropriate.
- **`payment_transactions`:** `UNIQUE(provider, reference)` from migration **014**; use `isPostgresUniqueViolation` in `webhook-idempotency.ts` if you add explicit duplicate handling around inserts. Access model: `docs/PAYMENT_TRANSACTIONS_ACCESS.md`.
- **KMS / secrets:** `docs/REGION_SECRETS_KMS_RUNBOOK.md` — encrypting `region_secrets.value_encrypted` is ops follow-up, not required for correctness of idempotency above.

---

## 2. Subscriptions and entitlements

### 2.1 Precedence

1. **Superadmin** — where explicitly implemented (e.g. `isUserSuperadmin` in `report-gating.ts`).
2. **Tenant `feature_flags`** — payment/commerce toggles (section 1).
3. **`subscription_plans.features` JSON** — interpreted by `apps/web/src/lib/subscriptions/feature-access.ts` (`getProviderSubscriptionTier`, `check*FeatureAccess`, `getProviderFeatureAccess`).
4. **RBAC** — `requirePermission`, `requireRoleInApi`, etc.

Payment UI and APIs should use **(2)** for card/wallet/gift card availability; plan limits (staff, analytics, Yoco, …) use **(3)**.

### 2.2 Reports

`apps/web/src/lib/subscriptions/report-gating.ts` uses `checkAnalyticsFeatureAccess` from `feature-access.ts`, with superadmin bypass via `entitlements.ts`.

---

## 3. Flags and rollout (ops)

| Mechanism | Purpose |
|-----------|---------|
| `STRICT_TENANT_HOST_RESOLUTION` | Unknown hosts fail closed (see `resolve-tenant-from-db.ts`). |
| `LOG_TENANT_RESOLUTION_FALLBACK` | Metrics / logs when falling back to ZA or production domain mapping. |
| `TENANT_DOMAIN_ENV`, `TENANT_DOMAIN_FALLBACK_TO_PRODUCTION` | Preview vs production rows in `tenant_domains`. |
| `TENANT_API_HINTS_STRICT` / `pnpm audit:multi-tenant:strict` | CI fails if new non-admin API routes lack tenant scoping hints. |
| `ALLOW_TENANT_AUDIT_WARNINGS` | Emergency bypass for strict tenant audit (use briefly only). |

Documented in `apps/web/.env.example` and `docs/REGION_ROLLOUT_CHECKLIST.md`.

### 3.1 Second market

Before turning **strict** in production: every customer host must exist in `tenant_domains` for the target `environment`. Then run the smoke section of `docs/REGION_ROLLOUT_CHECKLIST.md` on a **non-ZA** staging tenant.

---

## 4. Related code paths

| Concern | Location |
|--------|----------|
| Feature flag keys | `apps/web/src/lib/server/feature-flag-keys.ts` |
| Entitlements + payment toggles | `apps/web/src/lib/subscriptions/entitlements.ts` |
| Plan JSON features | `apps/web/src/lib/subscriptions/feature-access.ts` |
| Report gating | `apps/web/src/lib/subscriptions/report-gating.ts` |
| Public feature check API | `apps/web/src/app/api/feature-flags/check/route.ts` |
