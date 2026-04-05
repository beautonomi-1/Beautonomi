# Region / tenant rollout checklist

Use this when onboarding a **new market** (tenant + domain + payments + config). It aligns with `docs/GLOBAL_EXPANSION_GUIDE.md`, `docs/INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md`, and the phased plan in the platform runbooks. For **everything still to build**, prioritized waves and acceptance criteria, see **`docs/IMPLEMENTATION_PLAN_MULTI_TENANT_REMAINING.md`** (section **Roadmap — implement the rest**).

**Canonical naming:** The DB uses `tenant_domains.hostname` (not `host`). Resolver code: `apps/web/src/lib/tenant/resolve-tenant-from-db.ts`.

---

## 1. Database: tenant & region

- [ ] **Create or confirm `tenants` row** for the market (`slug`, `region_code`, `default_currency`, `default_language`, `default_timezone`, `is_active`, and any columns your migrations require).
- [ ] **Link domains:** insert into `tenant_domains` (`tenant_id`, `hostname`, `is_primary`, `is_active`, `environment` per **378** — unique `(lower(hostname), environment)`).
- [ ] **Mark legacy domains** with `is_legacy = true` if you keep old hosts for redirects.
- [ ] **Regions:** ensure `public.regions` has the region row; **region_settings** (and public allowlist for config-bundle) as per expansion guide.
- [ ] **region_payment_gateways / region_secrets:** seed primary gateway (e.g. Paystack) and secrets for the region (**377** pattern); verify `getPaystackSecretKey` resolves via `region_id` tied to tenant’s region.
- [ ] **Paystack idempotency (380):** Before applying **380**, ensure no duplicate `(payment_provider = paystack, payment_provider_id)` rows in `booking_payments`; migration adds a partial unique index. If the migration raises, dedupe data then re-run.
- [ ] **`payment_status` + `booking_payments.tenant_id` (381):** Run **two** files in order: **`381_00_payment_status_enum_partially_paid.sql`** (only `ALTER TYPE … ADD VALUE 'partially_paid'`) **then** **`381_booking_payments_tenant_id.sql`**. Split is required: PostgreSQL **55P04** — new enum labels must be **committed** before any use in a later statement; putting `ADD VALUE` in the same migration as `UPDATE booking_payments` (fires `update_booking_payment_status`) fails. Legacy DBs still use enum `payment_status` from **001**; without `partially_paid` you get **22P02** once the label exists.
- [ ] **`booking_payments` RLS (382):** `user_tenant_roles` can SELECT rows in their tenant; requires **`381_booking_payments…`** (`tenant_id` NOT NULL).
- [ ] **`payment_webhook_events` RLS (383):** same pattern as 382 for the idempotency ledger (`334` table).
- [ ] **Composite indexes (384):** `(tenant_id, created_at DESC)` on money tables + `bookings` — after **376** / **381** columns exist.
- [ ] **Finance + wallet RLS (385):** `user_tenant_roles` can SELECT `finance_transactions` / `wallet_transactions` in their tenant (requires **376** NOT NULL `tenant_id`).
- [ ] **Commerce orders RLS (386):** same pattern for `membership_orders`, `product_orders`, `gift_card_orders`.
- [ ] **Money path complete:** migrations **376–386** applied in order (see table below). Then run `scripts/verify-tenant-money-invariants.sql`: **(A)** each table’s `null_tenant_rows` must be **0**, **(B)** `total_null_tenant_rows` must be **0**. Non-zero means backfill or migration gap — do not treat money/RLS as verified for that DB.

### Migration chain 376–386 (status at a glance)

| # | File (repo) | Status | Depends on | Notes |
|---|-------------|--------|------------|--------|
| **376** | `376_tenant_id_money_wave2.sql` | **Shipped** | Prior tenant/333 | Money tables `tenant_id` + NOT NULL wave |
| **377** | `377_region_payment_gateways_and_secrets.sql` | **Shipped** | Regions | Gateways + `region_secrets` pattern |
| **378** | `378_tenant_domains_environment.sql` | **Shipped** | Domains | `(hostname, environment)` uniqueness |
| **379** | `379_seed_za_region_payment_gateway.sql` | **Shipped** | 377 | ZA gateway seed (env-specific) |
| **380** | `380_booking_payments_paystack_idempotency_uidx.sql` | **Shipped** | `booking_payments` | Dedupe Paystack tx ids before apply |
| **381a** | `381_00_payment_status_enum_partially_paid.sql` | **Shipped** | — | **Only** `ADD VALUE 'partially_paid'` (own migration → commit) |
| **381b** | `381_booking_payments_tenant_id.sql` | **Shipped** | 381a, 376, 333 | `tenant_id` backfill + NOT NULL + triggers |
| **382** | `382_booking_payments_rls_tenant_members.sql` | **Shipped** | 381b | SELECT RLS `booking_payments` via `user_tenant_roles` |
| **383** | `383_payment_webhook_events_rls_tenant_members.sql` | **Shipped** | 334 | SELECT RLS `payment_webhook_events` (same pattern) |
| **384** | `384_money_tables_tenant_created_at_indexes.sql` | **Shipped** | 376, 333 | Composite `(tenant_id, created_at DESC)` indexes |
| **385** | `385_finance_wallet_rls_tenant_members.sql` | **Shipped** | 376 | SELECT RLS `finance_transactions`, `wallet_transactions` |
| **386** | `386_commerce_orders_rls_tenant_members.sql` | **Shipped** | 376 | SELECT RLS `membership_orders`, `product_orders`, `gift_card_orders` |

**Apply order:** `376 → 377 → 378 → 379 → 380 → 381_00 → 381_booking → 382 → 383 → 384 → 385 → 386` (skip seeds if not needed for env). **Operational:** until these are applied in staging/prod, treat money/RLS invariants as **not** guaranteed for that database.

---

## 2. Application config & env

- [ ] **Web:** `STRICT_TENANT_HOST_RESOLUTION` — start `false` in staging until domains resolve; enable in prod when every customer-facing host maps.
- [ ] **Web:** `LOG_TENANT_RESOLUTION_FALLBACK` — leave on during rollout; watch `metric: tenant_resolution_fallback` in logs.
- [ ] **Optional:** `TENANT_DOMAIN_FALLBACK_TO_PRODUCTION` for preview hosts (see `tenant-domain-environment.ts`).
- [ ] **Mobile (`apps/customer`, `apps/provider`):** API base URL / deep links point at hosts that exist in `tenant_domains` for the right `environment`. **Program stance:** both apps are **considered rollout-ready** for multi-tenant — enforcement is on the **server**; this checklist item is **config verification** per market, not a “mobile not ready” gate.

---

## 3. Money paths (smoke)

**DB gate:** §1 “Money path complete” — `verify-tenant-money-invariants.sql` with **`total_null_tenant_rows = 0`** — should be satisfied before you rely on production money/RLS invariants.

Run these against the **new** host (or tenant-scoped test account):

- [ ] Public browse / `GET /api/public/home` (or equivalent) returns data for resolved tenant.
- [ ] **Customer:** create booking → Paystack init (`/api/payments/initialize` or mobile) — `TENANT_MISMATCH` must not fire when host matches booking tenant.
- [ ] **Provider:** subscription init/renew/upgrade, ads budget, payout accounts — provider `tenant_id` matches host (**403** if wrong market).
- [ ] **Webhooks:** Paystack events still verify with tenant-derived secret; booking/order rows tagged with `tenant_id`.

---

## 4. Observability

- [ ] Confirm logs include `tenant_id` / slug where added (resolution fallback, payment flows).
- [ ] Segment dashboards or alerts by tenant when enabling a new market.

---

## 5. CI & audits

Repo scripts (root `package.json`):

- `pnpm audit:tenant-admin` — admin API tenant scope.
- `pnpm audit:tenant-api-hints` — heuristic for non-admin routes (warnings only; **exit 0** unless strict).
- `pnpm audit:tenant-api-hints:strict` / `pnpm audit:multi-tenant:strict` — set **`TENANT_API_HINTS_STRICT=1`**; exits **1** if any route lacks tenant hints. Override with **`ALLOW_TENANT_AUDIT_WARNINGS=1`** only temporarily.
- `pnpm audit:multi-tenant` — runs admin + tenant-api-hints (non-strict).

**CI:** `.github/workflows/ci.yml` **Test** job runs **`pnpm audit:multi-tenant:strict`** so new routes without tenant scoping fail the build.

---

## 6. ZA regression (every rollout)

- [ ] Smoke test **ZA** tenant on production-like data: same currency (ZAR), phone defaults, Paystack path, and no new `TENANT_MISMATCH` on legitimate flows.
- [ ] Compare config-bundle for `za` before/after deploy (`meta.tenant_region`, `region_settings_public`).

---

## Implementation distance (snapshot)

Rough coverage vs the eight-phase program in the international spec:

| Area | Status (high level) |
|------|---------------------|
| **1.x Tenant model & `tenant_id` backfills** | **Strong progress:** wave migrations (e.g. **376**), `tenant_domains` + environment (**378**), resolver + `STRICT_TENANT_HOST_RESOLUTION`, ZA fallback logging. **DB chain 376–386** is defined in repo; **apply status is per-environment** — use § “Migration chain” above + `verify-tenant-money-invariants.sql`. Residual: nullable `tenant_id` on some edge tables, finish NOT NULL where safe. |
| **2.x De-ZA literals & config-bundle** | **Strong progress (web + customer):** `apps/web` sweep; **customer** account preferences use shared `currencySelectLabel` from `@beautonomi/utils`; **fresha-services** / **langauges-modal** stragglers updated. **Residual:** grep `ZAR` in `apps/web` still hits **examples** (`e.g. ZAR, USD`), **API comments**, **Yoco** strings; **emails/templates**; **provider** app country/VAT copy; phone dial defaults (`+27`) remain region-appropriate, not tenant-bundle-driven everywhere. |
| **3.x Payments & gateways** | **Strong progress:** `region_payment_gateways`, Paystack helpers tenant-driven, booking/host alignment on init & verify, provider payout routes, **380** Paystack tx idempotency on `booking_payments`, webhook tenant resolution helper. Residual: full secret manager story, idempotency across all money tables, webhook battery tests (§3.4). |
| **4.x Subscriptions & entitlements** | **Partial:** lifecycle routes hardened for market; central `feature-access` / limits / quotas as in spec not fully consolidated. |
| **5.x SLOs & observability** | **Partial:** structured logs in places; baseline SLO dashboards and cron health as specified are not fully done. |
| **6.x RLS & audits** | **Strong progress:** `booking_payments` (**382**), `payment_webhook_events` (**383**), `finance_transactions` + `wallet_transactions` (**385**), commerce orders (**386**); **`pnpm audit:multi-tenant:strict`** in CI blocks new non-admin routes without tenant hints. Residual: RLS on other §6.6 tables (e.g. `payment_transactions`); admin audit patterns only. |
| **7.x UX parity web/mobile** | **Mobile accepted ready** for multi-tenant rollout (`apps/customer`, `apps/provider` — shared API + config-bundle); **web** is primary for admin/complex flows. **Ongoing:** per-journey parity and copy polish (Phase C), not a backend blocker. |
| **8.x Flags & sequencing** | **In use:** strict resolution, feature flags pattern; keep flags per env for risky changes. |

---

## Related files (non-exhaustive)

| Concern | Location |
|--------|----------|
| Host → tenant | `apps/web/src/lib/tenant/resolve-tenant-from-db.ts` |
| Tenant domain environment | `apps/web/src/lib/tenant/tenant-domain-environment.ts` |
| Region / Paystack secrets | `apps/web/src/lib/regions/config.ts`, `apps/web/src/lib/payments/paystack-server.ts` |
| Booking payment tenant | `apps/web/src/lib/bookings/resolve-payment-tenant.ts`, `provider-matches-host.ts` |
| Paystack webhook tenant for idempotency ledger | `apps/web/src/lib/payment/resolve-payment-webhook-tenant.ts` |
| Paystack URL preference (primary vs legacy) | `docs/PAYSTACK_WEBHOOK_ROUTING.md` |
| Config bundle | `apps/web/src/lib/config/index.ts` |
| Customer app | `apps/customer` (Expo) — API + bundle bootstrap |
| Provider app | `apps/provider` (Expo) — API + bundle bootstrap |
| Intl spec (invariants) | `docs/INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md` |
| Data classification (tenants / regions) | `docs/DATA_CLASSIFICATION_TENANTS.md` |
| Optional `create_booking_payment` RPC | `docs/BOOKING_PAYMENTS_RPC.md` |
| Prioritized backlog (waves 1–6) | `docs/IMPLEMENTATION_PLAN_MULTI_TENANT_REMAINING.md` § Roadmap — implement the rest |
| Payments + subscriptions + rollout (single overview) | `docs/PAYMENTS_SUBSCRIPTIONS_ROLLOUT.md` |
| Region secrets → Paystack key, KMS path | `docs/REGION_SECRETS_KMS_RUNBOOK.md` |
| `payment_transactions` (no tenant_id) | `docs/PAYMENT_TRANSACTIONS_ACCESS.md` |
| `tenant_id` column discovery + NULL counts | `scripts/inventory-nullable-tenant-id.sql` (also `verify-tenant-money-invariants.sql`) |

Update this checklist when migrations or env names change. When **381_00 / 381_booking** or enum `payment_status` changes, update the **Migration chain** table and `docs/IMPLEMENTATION_PLAN_MULTI_TENANT_REMAINING.md` § Recently implemented.
