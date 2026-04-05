# Multi-tenant & international rollout — remaining implementation plan

**Canonical references:** `docs/GLOBAL_EXPANSION_GUIDE.md`, `docs/INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md`, `docs/REGION_ROLLOUT_CHECKLIST.md`.

**Purpose:** One backlog-oriented plan for what is **not** fully done yet, in **recommended order**, with **exit criteria**. It does not replace the normative rules in the international spec (NN-1–NN-8, §6.6, §10, etc.).

**Execution order for remaining work:** use **§ Roadmap — implement the rest** below (Waves 1–6). Phases A–H are the detailed spec; the roadmap turns them into a sequenced backlog.

---

## Recently implemented (baseline for “remaining”)

Use this as the line-in-the-sand so work is not duplicated.

| Area | What shipped | Status |
|------|----------------|--------|
| **Resolver** | `resolveTenantFromRequest`, `resolveTenantIdWithZaFallback`, `STRICT_TENANT_HOST_RESOLUTION`, `tenant_resolution_fallback` logging, `resolve-payment-webhook-tenant.ts` + tests | **Done (code)** — enable strict per env |
| **Payments / webhooks** | Host vs booking tenant checks on Paystack paths; legacy `/api/webhooks/paystack` idempotency + `payment_provider_data`; main `/api/payments/webhook` uses tenant-aware `payment_webhook_events`; duplicate handling for unique violations | **Done (code)** |
| **DB migrations 376–386** | **376** money-table `tenant_id` + NOT NULL; **377** region gateways/secrets; **378** `tenant_domains.environment`; **379** ZA gateway seed; **380** Paystack partial unique index on `booking_payments`; **381_00** only `ADD VALUE 'partially_paid'` on enum `payment_status` (separate file so PG commits before use — avoids **55P04**); **381_booking** `booking_payments.tenant_id` NOT NULL + `booking_payments_set_tenant_from_booking`; **382** SELECT RLS `booking_payments`; **383** SELECT RLS `payment_webhook_events`; **384** composite indexes `(tenant_id, created_at DESC)`; **385** SELECT RLS `finance_transactions` + `wallet_transactions`; **386** SELECT RLS `membership_orders`, `product_orders`, `gift_card_orders` for `user_tenant_roles` | **Shipped in repo** — **apply order:** 376→…→380→**381_00→381_booking**→382→383→384→385→386; **per-environment:** not applied until migrations run + `verify-tenant-money-invariants.sql` clean |
| **App writes** | Explicit `tenant_id` on `booking_payments` inserts where booking context exists; provider list/report queries scoped by `providers.tenant_id` where added | **Done (code)** — extend as new routes appear |
| **Audits** | `booking_payments` in `check-non-admin-api-tenant-hints.mjs`; **strict mode** (`TENANT_API_HINTS_STRICT`) + `pnpm audit:multi-tenant:strict`; CI uses strict | **Done (code)** — use `ALLOW_TENANT_AUDIT_WARNINGS=1` only for temporary bypass |
| **Web UI currency** | Broad `apps/web` sweep: tenant default currency from config bundle / `useReportCurrency` / `currencySelectLabel` for formatting and labels (admin, provider, checkout-adjacent) | **Strong progress** — residual: demo copy, some examples in forms, Yoco |
| **Mobile apps (customer + provider)** | **Considered ready** for multi-tenant production alongside web: business rules and tenant enforcement live on **shared APIs**; apps use **config-bundle** + API base URL per market; `apps/customer`, `apps/provider`. Per-screen copy / de-ZA polish is **Phase C**, not a backend gate. | **Accepted (rollout)** |
| **Mobile / web stragglers (Phase C)** | Customer `preferences` currency labels via `@beautonomi/utils` `currencySelectLabel` (Intl); partner-profile `fresha-services` demo prices use `formatCurrency` + bundle; `langauges-modal` ZAR row uses `Intl.DisplayNames` + `LAST_RESORT_CURRENCY` | **Done (this pass)** — phone/country literals still market-specific by design |
| **Paystack webhooks (quick win)** | `docs/PAYSTACK_WEBHOOK_ROUTING.md` — primary vs legacy URL | **Done** |
| **Tests (quick win)** | Extra `resolvePaymentWebhookTenantId` Vitest cases (trimmed booking id, error/null booking row) | **Done** |
| **mark-paid RPC note** | Comment that `booking_payments.tenant_id` is trigger-backed post-381 | **Done** |
| **Ops docs** | `REGION_ROLLOUT_CHECKLIST.md`: migration chain table, 381 enum note, implementation-distance refresh | **Done** — keep in sync when migrations change |
| **Data classification (§21)** | `docs/DATA_CLASSIFICATION_TENANTS.md` — tenant vs region vs global | **Done** |
| **NN-8 / ZA fallback guidance** | Expanded JSDoc on `resolveTenantIdWithZaFallback` (strict mode, money-path checks, `rg` to list call sites) | **Done** |
| **`create_booking_payment` RPC** | `docs/BOOKING_PAYMENTS_RPC.md` — not defined in repo; mark-paid fallback sets `tenant_id` from booking | **Done (doc)** |
| **Strict tenant + public APIs** | Vitest: home, search, providers slug; **503** + logging on tenant failure for marketplace, referrals, banks, purchase, express-link, provider-online-booking-settings; **warn** on soft-fail: config-bundle, subscription-plans, platform-settings error path, gift-cards validate | **Done (code)** |
| **tenant_id inventory (ops)** | `scripts/inventory-nullable-tenant-id.sql` — list columns + NULL counts (Wave 1.3) | **Done (script)** |
| **Payments / subscriptions / rollout (consolidation)** | `apps/web/src/lib/server/feature-flag-keys.ts`; `entitlements.ts`; `report-gating` + `feature-access` cross-linked; payment routes use entitlements; `docs/PAYMENTS_SUBSCRIPTIONS_ROLLOUT.md` | **Done (code + doc)** |
| **Region secrets KMS runbook** | `docs/REGION_SECRETS_KMS_RUNBOOK.md`; `paystack-server.ts` points to it; `isPostgresUniqueViolation` in `webhook-idempotency.ts`; `payment_transactions` without `tenant_id`: `docs/PAYMENT_TRANSACTIONS_ACCESS.md` | **Done (doc + small helpers)** — encrypt `value_encrypted` in DB when ops ready |
| **Subscriptions barrel** | `apps/web/src/lib/subscriptions/index.ts` re-exports entitlements, feature-access, report-gating | **Done (code)** |
| **Config-bundle tenant_region contract (Wave 3.2)** | `TenantRegionMeta` + `TENANT_REGION_META_KEYS` in `lib/config/types.ts`; Vitest `config-bundle-tenant-region-contract.test.ts` | **Done (test)** |
| **payment_transactions access doc (Wave 5.2)** | `docs/PAYMENT_TRANSACTIONS_ACCESS.md` | **Done (doc)** |

---

## Phase A — Close the schema & enforce invariants (P0)

**Goal:** No ambiguous money rows; migrations applied and verified in staging → prod.

1. **Apply and verify migrations** **376** through **386** in order (**377–379** as required for gateways/domains); **380** only after deduping Paystack duplicates if needed; **381_00** then **381_booking** (enum label must commit in a **prior** migration — same-file `ADD VALUE` + `UPDATE booking_payments` causes **55P04**); **382–383**/**385–386** RLS after `tenant_id` columns exist; **384** composite indexes after **376**/`381` columns exist. Then run `scripts/verify-tenant-money-invariants.sql`: per-table counts and **`total_null_tenant_rows`** must all be **0**.
2. **Residual `tenant_id` NULL / NOT NULL** on any edge tables still called out in spec (reviews, promos, commerce adjacencies) — inventory via `information_schema` + spec §6.6 table list; add follow-up migrations.
3. **`create_booking_payment` RPC** — see `docs/BOOKING_PAYMENTS_RPC.md` (optional DB function; repo uses direct insert with `tenant_id` when absent).
4. **Indexes** — **384** adds `(tenant_id, created_at DESC)` on core money tables + `bookings`; add more if profiling shows gaps.

**Exit criteria:** Staging DB passes verification + load smoke; no new nullable `tenant_id` on money-bearing tables without a documented exception.

---

## Phase B — Tenant resolution hardening (P0)

**Goal:** NN-8: no silent ZA in production unless explicitly allowed.

1. **Rollout** `STRICT_TENANT_HOST_RESOLUTION=true` per environment after all customer hosts exist in `tenant_domains`.
2. **Audit** every `resolveTenantIdWithZaFallback` callsite — classify: read-only OK vs write paths that must fail closed.
3. **Mobile** (`apps/customer`, `apps/provider`) — **accepted as rollout-ready** (see § Recently implemented): mutations are enforced by **server** APIs; apps bootstrap from **config-bundle** and correct **API base URL** per `tenant_domains` / environment. Ongoing UI copy is Phase C, not a gate.
4. **Integration tests:** unknown host + strict flag → 4xx; known host → correct tenant; legacy domain rows still resolve.

**Exit criteria:** Production can run with strict mode on; mobile apps not a blocker for multi-tenant backend cutover.

---

## Phase C — De-ZA and tenant-driven config (P1)

**Goal:** No product-critical ZA literals; `getTenantRegionConfig` / config-bundle are the source of truth.

1. **Grep-driven cleanup:** `ZAR`, `South Africa`, `+27`, `R` in remaining UI strings — **`apps/web`** large pass done; prioritize **emails/templates**, **`apps/customer` / `apps/provider`**, and residual web files called out in `REGION_ROLLOUT_CHECKLIST.md` § Implementation distance (2.x).
2. **Config-bundle** generator: ensure `meta.tenant_region`, `region_settings_public`, currency, phone for **every** tenant; mobile consumes same shape.
3. **Emails / templates** (if any in web or backend): parameterize currency and region name from tenant.
4. **Regression tests:** ZA tenant snapshot — currency, phone, labels unchanged.

**Exit criteria:** High-traffic flows show tenant-derived strings; ZA golden tests pass.

---

## Phase D — Payments, secrets, idempotency (P1)

**Goal:** Tenant-driven rails; secrets not only from env in app code.

1. **`region_secrets` / KMS** — move from plaintext `value_encrypted` to documented KMS path when ready; keep Paystack ZA behavior identical.
2. **Idempotency** across **all** money tables (`finance_transactions`, `payment_transactions`, webhooks) — unique keys + handler tests (spec §3.3–3.4).
3. **Webhook signature** — optional: second-pass verify using `booking.tenant_id` secret when Host is ambiguous (document threat model).
4. **Tax / invoices** — tenant tax config + invoice footer from tenant/region; ZA regression tests.

**Exit criteria:** Runbook for “new PSP region” without code forks; webhook test suite covers duplicate + out-of-order events.

---

## Phase E — Subscriptions, entitlements, limits (P1–P2)

**Goal:** Single place for “can use feature X” and plan limits.

1. **Consolidate** `lib/subscriptions/feature-access.ts` + `report-gating.ts` + feature flags (spec §20.1 precedence).
2. **`provider_subscriptions` / `subscription_plans`:** tenant-scoped plans where product requires; document in spec.
3. **Quotas** (staff, SMS, bookings/month) — optional limits table + enforcement hooks.

**Exit criteria:** New feature gates go through one module; cross-tenant tests for admin vs provider.

---

## Phase F — Observability, SLOs, cron (P2)

**Goal:** Per-tenant operability.

1. **Structured logging** — `tenant_id`, `tenant_slug`, `region_code` on critical routes and cron (spec §14).
2. **SLOs** — define P95/error budget for home/search, checkout, provider calendar; dashboards segmented by tenant.
3. **Cron** `/api/cron/*` — idempotent, tenant-scoped loops where applicable; machine-readable health.

**Exit criteria:** On-call can filter by tenant; cron failures visible.

---

## Phase G — RLS, security, compliance (P1)

**Goal:** NN-1 / §8 — RLS matches app intent; audits fail CI when appropriate.

1. **RLS** for all high-risk tables in spec §6.6 — `booking_payments` (**382**), `payment_webhook_events` (**383**), `finance_transactions` + `wallet_transactions` (**385**), `membership_orders` / `product_orders` / `gift_card_orders` (**386**); extend pattern to others missing tenant predicates (e.g. `payment_transactions` when `tenant_id` exists).
2. **`audit:tenant-api-hints`:** **Implemented:** `TENANT_API_HINTS_STRICT`, `pnpm audit:tenant-api-hints:strict` / `audit:multi-tenant:strict`, CI runs strict; **`ALLOW_TENANT_AUDIT_WARNINGS=1`** for emergency bypass only.
3. **Admin routes** — `audit:tenant-admin` + Appendix C inventory kept current.
4. **Data classification / retention** — see `docs/DATA_CLASSIFICATION_TENANTS.md` (spec §21).

**Exit criteria:** CI blocks new tenant-scope regressions; RLS review documented.

---

## Phase H — UX parity & rollout (P2)

**Goal:** Same journeys on web vs mobile; repeatable market launch.

1. **Parity matrix** — booking, checkout, wallet, loyalty, membership, provider payouts per platform (**continuous QA**; mobile apps are **accepted ready** — see § Recently implemented).
2. **`REGION_ROLLOUT_CHECKLIST.md`** — execute end-to-end for a **non-ZA** staging tenant (smoke).
3. **Feature flags** — `TENANT_DRIVEN_PAYMENTS`, `TENANT_RLS_ENFORCED`, etc. per spec for staged rollout.

**Exit criteria:** Second tenant can be demoed without ZA hacks.

**Note:** Mobile **readiness** for multi-tenant rollout is **not** held to 100% feature parity across three surfaces; parity is **product quality**, not a schema gate.

---

## Suggested sequencing (summary)

| Order | Focus | Rationale |
|-------|--------|-----------|
| **1** | Phase A (migrations + verification) | Unblocks correctness of all later work |
| **2** | Phase B (strict resolution + mobile validation) | Stops cross-tenant leakage at the edge |
| **3** | Phase C + D (config + payments hardening) | User-visible and money correctness |
| **4** | Phase G (RLS + CI audits) | Enforce invariants |
| **5** | Phase E + F + H (entitlements, observability, parity) | Scale and polish |

---

## Roadmap — implement the rest (prioritized backlog)

Use this as the **execution checklist** for everything not covered by § “Recently implemented”. Order is **recommended**; parallelize where dependencies allow.

### Wave 1 — Close DB + ops (P0, days–1 week)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 1.1 | **Migrations 376–386 in every env** | Staging → prod in chain order; **385–386** after **376** NOT NULLs. | All envs applied; no failed migration |
| 1.2 | **Invariant verification** | `scripts/verify-tenant-money-invariants.sql`: every table **0** NULL `tenant_id`, **`total_null_tenant_rows` = 0** (script returns both). | Clean run recorded per env |
| 1.3 | **Residual `tenant_id` inventory** | `scripts/inventory-nullable-tenant-id.sql` + spec §6.6; file follow-up migrations (reviews, promos, commerce adjacencies as needed). | Inventory doc or tickets; critical tables scheduled |
| 1.4 | **Optional RPC** | If prod uses `create_booking_payment`, align with **381** or rely on trigger; see `docs/BOOKING_PAYMENTS_RPC.md`. | No orphan inserts without `tenant_id` path |

### Wave 2 — Tenant resolution + mobile (P0, 1–2 weeks)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 2.1 | **Strict host resolution** | Every prod customer host in `tenant_domains`; then `STRICT_TENANT_HOST_RESOLUTION=true`. | No unexpected `tenant_resolution_fallback` for real hosts |
| 2.2 | **Money writes vs ZA fallback** | Review high-risk `resolveTenantIdWithZaFallback` routes (grep); ensure booking/provider `tenant_id` checks (`bookingTenantMismatchResponse`, etc.) on mutations. | Checklist signed off or issues filed |
| 2.3 | **Mobile** | **Accepted ready** — see § Recently implemented; optional smoke on two tenants for new markets. | N/A (not blocking) |
| 2.4 | **Integration tests** | Route-level: `public-home-tenant-strict.test.ts` (503 when resolver throws); unit: `resolve-tenant-from-db.test.ts` (strict). Add more routes as needed. | CI green |

### Wave 3 — Config + de-ZA (P1, ongoing)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 3.1 | **Straggler strings** | Grep `ZAR`, `+27`, `South Africa` in emails, Resend/SendGrid templates, `apps/provider` copy; replace with bundle / `getTenantRegionConfig`. | High-traffic paths clean |
| 3.2 | **Config-bundle completeness** | `meta.tenant_region`, `region_settings_public`, currency, phone for all active tenants; mobile reads same JSON. | Contract test or snapshot |
| 3.3 | **ZA regression** | Automated or manual snapshot: `za` tenant currency, phone, labels unchanged after changes. | Test or checklist row |

### Wave 4 — Payments hardening (P1)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 4.1 | **`region_secrets` / KMS** | Document envelope encryption or cloud KMS; migration path from `value_encrypted`; no secret in app logs. | Runbook + optional migration |
| 4.2 | **Idempotency** | Unique constraints + handlers for `payment_transactions`, `finance_transactions` webhooks as needed; Vitest duplicate/out-of-order cases. | Spec §3.3–3.4 covered by tests |
| 4.3 | **Tax / invoices** | Invoice footer + tax from tenant/region; ZA regression. | Spot-check UK/ZA PDFs or HTML |

### Wave 5 — RLS + admin (P1)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 5.1 | **More §6.6 RLS** | **386** adds tenant-member SELECT on `membership_orders`, `product_orders`, `gift_card_orders`. Residual: other tables (e.g. `payment_transactions` after `tenant_id`); same pattern as **382**/**385**. | Policies merged; no broad `anon` leaks |
| 5.2 | **`payment_transactions`** | If/when `tenant_id` exists: backfill from booking + RLS; else document server-only access. | Aligned with spec |
| 5.3 | **Admin audit** | Keep `pnpm audit:tenant-admin` + Appendix C inventory current when adding `/api/admin/*`. | CI / periodic review |

### Wave 6 — Entitlements + observability + parity (P2)

| # | Work item | Concrete actions | Done when |
|---|-----------|------------------|-----------|
| 6.1 | **Feature gates** | Consolidate `feature-access.ts`, `report-gating.ts`, flags per §20.1. | One precedence doc + imports |
| 6.2 | **Logging** | `tenant_id` / `tenant_slug` / `region_code` on payment, checkout, critical cron. | Log drain query works |
| 6.3 | **SLOs / cron** | Dashboards or alerts by tenant; `/api/cron/*` idempotent and scoped. | On-call runbook |
| 6.4 | **UX parity matrix** | Optional living doc — web vs customer vs provider; **not** a gate now that mobile is **accepted ready**. | As needed |
| 6.5 | **Second market smoke** | Execute `REGION_ROLLOUT_CHECKLIST.md` for a **non-ZA** staging tenant end-to-end. | Checklist checked |

### Dependencies (read this before parallelizing)

- **Wave 1** before turning **strict** in prod (Wave 2.1).
- **Wave 4.2** benefits from **Wave 1.3** (clear `tenant_id` on all money touchpoints).
- **Wave 5.1** requires `tenant_id` NOT NULL and correct backfills on target tables (usually post-**376** wave or follow-ups).

---

## Quick wins (can parallelize)

- ~~Expand Vitest coverage for `extractBookingIdFromPaystackPayloadData` (nested `custom_fields` + subscription-only path)~~ — see `apps/web/src/__tests__/lib/resolve-payment-webhook-tenant.test.ts`.
- ~~Admin **yoco-reconciliation**~~ — provider route already scopes `booking_payments` by `tenant_id` when present (`/api/provider/reports/payments/yoco-reconciliation`).
- ~~Document **Paystack webhook URL** preference~~ — see `docs/PAYSTACK_WEBHOOK_ROUTING.md`.

---

## Maintenance

When a phase completes, update **§ “Implementation distance”** in `REGION_ROLLOUT_CHECKLIST.md` and this file’s **Recently implemented** section so the “remaining” list stays honest.

When **migrations** are added or renamed after **386**, update: (1) **Migration chain** table in `REGION_ROLLOUT_CHECKLIST.md`, (2) **Recently implemented** table here, (3) Phase A bullet 1 ordering text if the chain changes.
