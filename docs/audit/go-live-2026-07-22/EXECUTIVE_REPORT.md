# Beautonomi Go-Live Readiness Audit Rerun — Executive Report

**Audit ID:** AUDIT-2026-07-22  
**Prior audit:** AUDIT-2026-07-11  
**Date:** 22 July 2026  
**Scope:** Multi-market / multi-tenant day-one launch  
**Evidence mode:** Local static analysis + automated test execution (no staging/production runtime)  
**Coordinator:** Agent 0  
**Working tree:** Large uncommitted delta included in evidence

---

## A. Executive conclusion

### Overall readiness: **75%** (prior: **72%**, Δ **+3**)

| Metric | Prior (2026-07-11) | Post-remediation claim | **Current (2026-07-23)** |
|--------|-------------------:|----------------------:|-------------------------:|
| Overall readiness | 72% | ~84% | **75%** |
| Overall confidence | Medium | Medium | **Medium** (P0 staging evidence user-attested, no CI artifact) |
| P0 blockers (open) | 7 → 2 claimed | 2 | **0** (both closed 2026-07-23) |
| P1 issues (open/partial) | 19 → 21 | 21 | **14** |
| P2 issues | 3 | 3 | **8** |
| P3 issues | 1 | 1 | **0** |
| Regressions | — | — | **0** (FND-P1-002 resolved 2026-07-23) |

### Go-live recommendation: **Conditional Go** — pending CI evidence capture for the P0 staging runs

Both **P0** blockers are now **closed**. Local remediation landed on 2026-07-22, and on **2026-07-23 the product owner attested the staging E2E runs passed**:

1. **FND-P0-002** (`resolved`) — Local: `route.signature-idempotency.test.ts` (8 integration tests over the **real** `/api/payments/webhook` router: HMAC-SHA512 gate unsigned→400 / forged→401 / valid→200, per-tenant secret verification, idempotent replay, in-flight lease, charge/refund/payout routing). Staging: money-path E2E (live signed webhook + browser Paystack checkout + payout) **attested passing**.
2. **FND-P0-003** (`resolved`) — Local: behavioural GET `/api/me/orders` cross-tenant tests (filtering 2-tenant in-memory Supabase; foreign-tenant orders never leak, fails closed to `[]`) + `route-tenant-scope.guard.test.ts` (all **118** tenant-resolving routes consume the tenant, 0 offenders). Staging: `tenant-isolation.spec.ts` (distinct tenant per market host + cross-host provider non-resolution) **attested passing** against two live market hosts.

> **Evidence caveat:** The staging pass is **user-attested with no CI link or log artifact captured**. Confidence is held at **Medium**, and the go-live impact is recorded as `resolved_pending_ci_artifact`. Capture and attach the CI run output before the final production sign-off to lift this to a full Go.

**Remaining before an unconditional Go:** (1) attach the staging CI artifact for FND-P0-002/003 (money-path + tenant-isolation E2E); (2) triage the remaining open/partial P1 items for Wave 1 (payment-webhook CSRF gap FND-P1-024, service-role reliance FND-P1-012, in-memory rate-limit fallback FND-P1-005). The prior **FND-P1-002** advanced-search regression was **resolved on 2026-07-23** by deleting the dead `/api/search/advanced` route (no-op filters + no tenant scoping; no callers); the UI-wired `/api/public/search` already applies price/availability/location filters correctly and tenant-scoped.

### Pilot recommendation: **Controlled pilot ready** (single tenant, ZA, web-first, limited provider cohort)

With both P0s closed and the FND-P1-002 search regression resolved, a limited ZA web-first pilot is feasible once the P0 staging CI artifact is captured.

### Largest risks

1. **P0 staging evidence is user-attested** — money-path and tenant-isolation E2E reported passing without a captured CI artifact; attach the run before final sign-off.
2. **Payment webhook CSRF gap** — `/api/payments/webhook` and `/api/payments/stripe/webhook` not in CSRF exemption list (FND-P1-024).
3. **Service-role bypass reliance** — many routes use `getSupabaseAdmin` (FND-P1-012); tenant-scope guard mitigates but RLS depth-in-defence still recommended.
4. **Rate-limit in-memory fallback** — FND-P1-005; ensure the durable store is provisioned in production.
5. **Paystack live key** — FND-P1-020 still requires DB/admin fix; no code guard for `pk_test_`.
6. **Web unit test failures** — at least 4 failing vitest cases observed during audit run (env/mock related).

_(Resolved 2026-07-23: FND-P1-002 advanced-search regression — dead `/api/search/advanced` route deleted; canonical `/api/public/search` filters correctly and tenant-scoped.)_

### Evidence limitations

Cannot verify without staging/production: Paystack/Stripe webhook confirmation, payout transfers, cross-tenant live isolation, notification delivery, backup restore, production cron behaviour, game-day drills, legal counsel sign-off on CMS content.

---

## B. Platform readiness dashboard

| Domain | Prior | **Current** | Δ | Confidence |
|--------|------:|------------:|--:|------------|
| Core business functionality | 74 | **76** | +2 | Medium |
| Customer web | 75 | **79** | +4 | Medium |
| Customer mobile | 74 | **78** | +4 | Medium |
| Provider web | 72 | **72** | 0 | Medium |
| Provider mobile | 70 | **72** | +2 | Medium |
| Superadmin / operations | 80 | **79** | −1 | Medium |
| Security, identity, privacy | 65 | **64** | −1 | Low |
| Payments / financial integrity | 80 | **76** | −4 | Medium |
| Data, reporting, integrations | 72 | **74** | +2 | Medium |
| QA / testing | 52 | **56** | +4 | High |
| Infrastructure / DevOps | 76 | **80** | +4 | Medium |
| Performance / reliability | 63 | **63** | 0 | Low |
| UX / accessibility | 66 | **67** | +1 | Low |
| Operational readiness | 68 | **68** | 0 | Low |
| Legal / regulatory | 70 | **72** | +2 | Medium |

### Application scores

| Application | Prior | **Current** | Summary |
|-------------|------:|------------:|---------|
| APP-001 Web + API | 75 | **78** | 1282 API routes; Stripe partial; search map fixed on live path |
| APP-002 Admin SPA | 80 | **79** | Fraud cases + voice dialer; inventory docs stale |
| APP-003 Customer mobile | 74 | **78** | 216 tests pass; 32/32 parity contract |
| APP-004 Provider mobile | 70 | **72** | 357 tests pass; terminal shop, join, org switcher |

---

## C. Agent completion dashboard

| Agent | Scope | Status | Findings | Confidence |
|------:|-------|--------|----------|------------|
| 0 | Coordinator | Complete | — | Medium |
| 1 | Discovery | Complete | 0 | High |
| 2 | Customer web | Complete | 5 | Medium |
| 3 | Customer mobile | Complete | 3 | Medium |
| 4 | Provider web | Complete | 4 | Medium |
| 5 | Provider mobile | Complete | 2 | Medium |
| 6 | Superadmin | Complete | 4 | Medium |
| 7 | Identity / permissions | Complete | 3 | Medium |
| 8 | Security / privacy | Complete | 4 | Medium |
| 9 | Payments / finance | Complete | 6 | Medium |
| 10 | Integrations | Complete | 3 | Medium |
| 11 | Data / reporting | Complete | 2 | Medium |
| 12 | UX / accessibility | Complete | 2 | Low |
| 13 | QA / testing | Complete | 2 | High |
| 14 | Performance | Complete | 1 | Low |
| 15 | DevOps | Complete | 2 | Medium |
| 16 | Operations | Complete | 1 | Low |
| 17 | Legal / compliance | Complete | 1 | Medium |
| 18 | False completeness | Complete | 5 | High |
| 19 | Adversarial challenger | Complete | 3 | High |

---

## D. Application-by-application findings

### APP-001 — Web + API (Next.js)

**Works:** Booking holds, Paystack checkout, Stripe Connect booking path, provider portal, admin API (451 admin routes), crons with `verifyCronRequest`, notification queue, Didit KYC, PayCloud Cloud Mode, Yoco, finance ledger, refund flows, fraud cases API, agent workforce safety gates, custom offer lifecycle, membership billing cron, terminal shop.

**Partial:** Multi-tenant resolution (ZA fallbacks), Stripe non-booking flows, KYB (flags off), advanced search filters (regression), agent classifyTicket unbound.

**Broken:** At least 4 web vitest failures during audit (Yoco settle, mark-collected, custom-offer accept, group booking rollup).

**Missing:** Flutterwave processor, PayCloud same-terminal production sign-off, Stripe Connect account.updated webhook.

**Unsafe:** Payment webhooks may hit CSRF when secret set (FND-P1-024); service-role API boundary (FND-P1-012).

**Cannot verify:** Live webhooks, payout transfers, cross-tenant isolation.

### APP-002 — Admin SPA (Vite)

**Works:** Section RBAC, finance/payout/dispute workflows, fraud cases UI, provider-ops voice dialer, control-plane IA, feature flags, audit logs.

**Partial:** API inventory stale (fraud-cases missing); FraudCasesPage not in criticalFlows regression list.

**Cannot verify:** Impersonation under production MFA policy.

### APP-003 — Customer mobile (Expo)

**Works:** 32/32 parity contract, 216 Jest tests pass, offline bar, Paystack return, explore feed API.

**Partial:** Search list-only (no map); onboarding parity contract misrouted.

**Cannot verify:** Push delivery, deep links in production.

### APP-004 — Provider mobile (Expo)

**Works:** 357 Jest tests pass, onboarding zones validation, terminal shop, join flow, org switcher, custom offers (no images).

**Partial:** PayCloud same-terminal stub; custom-offer images web-only.

**Cannot verify:** Background location, app-store submission state.

---

## E. End-to-end journey results (56 journeys)

| Result | Prior | **Current** |
|--------|------:|------------:|
| Pass | 18 | **19** |
| Partial pass | 25 | **24** |
| Fail | 2 | **0** |
| Blocked | 0 | **0** |
| Cannot verify | 11 | **11** |
| Regression-linked | — | **2** (JRN-003, JRN-012 partial) |

### Critical journeys

| ID | Journey | Result | Key finding |
|----|---------|--------|-------------|
| JRN-003 | Search to booking | Pass | FND-P1-002 resolved (dead advanced route deleted) |
| JRN-004 | Checkout to payment | Pass (staging, attested) | FND-P0-002 closed |
| JRN-026 | Settlement to payout | Pass (staging, attested) | FND-P0-002 closed; FND-P1-023 Paystack-only |
| JRN-047 | Payment to payout reconciliation | Cannot verify | FND-P1-008 |
| JRN-052 | Cross-tenant access attempt | Pass (staging, attested) | FND-P0-003 closed |
| JRN-054 | Backup restore | Cannot verify | FND-P1-016 |

Full register: [journey-register.json](./journey-register.json)

---

## F. Go-live blockers

### P0 — Critical (0 open)

Both P0 blockers were **closed on 2026-07-23** (local suites + user-attested staging E2E pass; CI artifact still to be attached).

| ID | Title | Owner | Remediation | Status |
|----|-------|-------|-------------|--------|
| FND-P0-002 | E2E coverage critically thin for money paths | qa-engineering | REM-006 | resolved (pending CI artifact) |
| FND-P0-003 | Multi-market tenant isolation unverified | platform-security | REM-007 | resolved (pending CI artifact) |

### P1 — High priority (selected open)

| ID | Title | Owner |
|----|-------|-------|
| FND-P1-004 | KYB verification flags off by default | compliance |
| FND-P1-008 | 7-day staging drift gate unsigned | finance |
| FND-P1-012 | API relies on service-role bypass | platform-security |
| FND-P1-020 | Production config-bundle test Paystack key | platform-engineering |
| FND-P1-021 | Stripe webhook ignores non-booking PaymentIntents | payments |
| FND-P1-024 | Payment webhooks CSRF exemption gap | platform-engineering |

Full register: [findings-register.json](./findings-register.json)

---

## G. Capability traceability matrix (summary)

| ID | Capability | Status | Change since prior |
|----|------------|--------|-------------------|
| CAP-BOOK-001 | Public booking checkout | Full | — |
| CAP-PAY-001 | Paystack online payments | Full | Runtime unverified |
| CAP-PAY-004 | Stripe Connect booking payments | **Partial** | **New** |
| CAP-FRAUD-001 | Fraud case management | **Full** | **New** |
| CAP-AGENT-001 | Agent workforce copilot | **Partial** | **New** |
| CAP-TERMINAL-001 | Terminal shop B2B | **Full** | **New** |
| CAP-MEMBERSHIP-001 | Membership billing | **Full** | Enhanced |
| CAP-SEARCH-001 | Provider search | Partial | Advanced filters regressed |
| CAP-TENANT-001 | Multi-tenant isolation | Partial | Runtime unverified |

Full register: [capability-register.json](./capability-register.json)

---

## H. Security, privacy and permissions report

### Strengths

- Supabase Auth + role source of truth; 818 migrations with extensive RLS
- Admin section RBAC (`requireAdminSection`) + fraud cases tenant scoping
- Agent workforce: approval/lease gates, shadow mode, safety-gate env checks
- Webhook HMAC verification (Paystack, Stripe multi-tenant, Didit, Yoco, PayCloud)
- Provider tenant guard script passes with 0 failures
- CSRF active when secret set; sensitive rate limiters fail-closed without Upstash

### Attack paths and gaps

| Risk | Severity | Evidence |
|------|----------|----------|
| Cross-tenant data access (unverified) | P0 | EVD-004, EVD-041 |
| Payment webhook CSRF mismatch | P1 | EVD-053 |
| Service-role bypass — API guards sole boundary | P1 | EVD-046 |
| CSP unsafe-inline/unsafe-eval | P1 | EVD-015 |
| Rate limit per-instance fallback | P1 | EVD-014 |

---

## I. Payments and financial integrity report

### Financial chain trace

```
Customer payment (Paystack/Stripe) → webhook (HMAC + lease idempotency) → booking_payments
  → finance_transactions trigger → payout balance → payout request (Paystack regions)
  → admin approval → Paystack transfer OR Stripe Connect destination at charge
```

### Results

| Area | Status | Evidence |
|------|--------|----------|
| Paystack checkout | Pass (unit) | payment/ledger tests |
| Stripe booking checkout | Partial (unit gap) | stripe-provider.ts; no record-booking-stripe unit test |
| Webhook idempotency | Pass (code) | EVD-034 |
| Membership renewals | Pass (unit) | renewal-race tests added |
| Terminal shop payments | Pass (unit) | 16 terminal test files |
| Payout transfer | Cannot verify | No E2E |
| Multi-currency drift | Partial | gl-currency-drift cron; gate unsigned |

---

## J. False completeness report

| Surface | Appears complete | Actually |
|---------|------------------|----------|
| Advanced search filters | Filter UI wired | Handled by /api/public/search (working, tenant-scoped); dead /api/search/advanced deleted — FND-P1-002 resolved |
| Stripe integration register | Listed as mock | Booking processor shipped; Connect lifecycle incomplete |
| Agent support.classifyTicket | In tool registry | Not bound in production copilot |
| Shipping | Gate exists | Couriers throw if ECOMMERCE_SHIPPING_ENABLED=true |
| slider.tsx search map | Map component exists | Orphan with fake London pins |
| Stripe regions day-one | Stripe Connect onboard exists | Non-booking PI ignored in webhook |

---

## K. Operational readiness report

| Capability | Status | Gap |
|------------|--------|-----|
| Runbooks (game day, DR, launch) | Documented | Not executed (FND-P1-009) |
| CI/CD (9 workflows) | Present | readiness-check fails on lint |
| Observability (Sentry, Slack) | Configured | Gates need secrets |
| Finance drift gate | Coded | 7-day observation unsigned (FND-P1-008) |
| Compliance (POPIA) | Documented + CMS seed | Legal sign-off pending (FND-P1-017 partial) |
| Provider-ops voice | Implemented | Salestrail reconciliation unverified |

---

## L. Remediation roadmap

### Wave 0 — Immediate containment
- REM-001: Dedicated CSRF_SECRET; exempt `/api/payments/*/webhook` from CSRF (FND-P1-024)
- REM-033: Replace Paystack test key with live key in production (FND-P1-020)

### Wave 1 — Critical go-live blockers (P0)
- REM-006: E2E suite with signed Paystack/Stripe webhook fixtures + payout probe
- REM-007: Multi-tenant isolation pen test on staging with real Host headers
- REM-034: Fix FND-P1-002 advanced search filter regression — **DONE 2026-07-23** (dead `/api/search/advanced` route deleted)

### Wave 2 — Go-live completion (P1)
- REM-008 through REM-012: Postal areas, rate limits, drift gate, drills, KYB
- REM-035: Stripe non-booking PaymentIntent handlers or explicit disable
- REM-036: Fix failing web vitest cases in money-adjacent routes

### Wave 3 — Controlled pilot hardening
- REM-013 through REM-015: PayCloud same-terminal, CSP enforcement, mobile custom-offer images

### Wave 4 — Multi-market scale
- REM-016 through REM-018: Per-tenant payments, legal sign-off, remove ZA fallback telemetry

Full backlog: [remediation-backlog.json](./remediation-backlog.json)

---

## M. Final recommendation

### Selected: **Conditional Go** — pending CI-artifact capture for the P0 staging runs

**Rationale:**

1. **0 unresolved P0 blockers** — FND-P0-002 and FND-P0-003 closed 2026-07-23 (local suites + user-attested staging E2E pass)
2. **Evidence caveat** — the staging pass is user-attested with no CI link/log artifact; impact recorded as `resolved_pending_ci_artifact`, confidence held at Medium
3. **0 P1 regressions open** — FND-P1-002 resolved 2026-07-23 (dead `/api/search/advanced` route deleted; canonical `/api/public/search` filters correctly and tenant-scoped)
4. **Net-new surface** (Stripe, fraud, agents) increases blast radius — Wave 1 P1 triage recommended
5. Prior **~84%** post-remediation claim remains unsupported; current measured readiness is **75%**

### What can be piloted safely (after Wave 0–1 + staging)

- Single tenant (ZA), web-first
- Core booking + Paystack online payments
- Limited provider cohort with manual ops oversight
- Exclude: multi-market Stripe regions, ecommerce shipping, PayCloud same-terminal

### What must be fixed first

1. Attach the staging money-path + tenant-isolation E2E CI artifact (closes REM-006/REM-007 evidence gap)
2. CSRF exemption for payment webhooks (REM-001 extension)
3. Paystack live key in production region settings (REM-033)

_(REM-034 advanced search filter regression — DONE 2026-07-23.)_

### Rerun comparison

See [rerun-comparison.json](./rerun-comparison.json): overall **72% → 75%** (+3), platform grew (+139 API routes, +156 migrations, +8 packages), E2E specs 2 → 3, both P0 blockers closed (staging user-attested), regressions resolved (**FND-P1-002**).

---

## Machine-readable outputs

All registers in [docs/audit/go-live-2026-07-22/](./) with stable IDs for rerun comparison.

| Register | File |
|----------|------|
| Rerun comparison | rerun-comparison.json |
| Platform inventory | platform-inventory.json |
| Findings | findings-register.json |
| Journeys | journey-register.json |
| Evidence | evidence-register.json |
| Integrations | integration-register.json |
| Capabilities | capability-register.json |
| Tests | test-register.json |
| Readiness scores | readiness-scores.json |
| Remediation | remediation-backlog.json |
| Challenger | challenger-report.json |
| Audit runs | audit-run-results.json |

---

*This report is an engineering audit, not legal advice. Compliance findings require specialist legal review for each launch market.*
