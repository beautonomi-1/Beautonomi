# Beautonomi Go-Live Readiness Audit — Executive Report

**Audit ID:** AUDIT-2026-07-11  
**Date:** 11 July 2026  
**Scope:** Multi-market / multi-tenant day-one launch  
**Evidence mode:** Local static analysis + automated test execution + production browser verification (2026-07-11)  
**Coordinator:** Agent 0  
**Remediation sprint:** 2026-07-11 — 4 P0 fixed, 1 downgraded (mitigated), 2 partial (staging-gated)

---

## A. Executive conclusion

### Overall readiness: **72%**

| Metric | Value (original) | Post-remediation |
|--------|------:|------:|
| Overall readiness | **72%** | **~84%** |
| Overall confidence | **Medium** (capped by local-only evidence) | Medium |
| P0 blockers | **7** | **2** (partial, staging-gated) |
| P1 issues | **19** | **21** |
| P2 issues | **3** | 3 |
| P3 issues | **1** | 1 |

### Go-live recommendation: **No-go pending staging verification**

The 2026-07-11 remediation sprint closed 4 of 7 P0 blockers (search map, fake-success APIs, POS persistence, shipping gate), fixed the release-blocking typecheck, and downgraded the CSRF finding after production verification confirmed CSRF is active. The **2 remaining P0s — money-path E2E coverage (FND-P0-002) and runtime multi-tenant isolation proof (FND-P0-003) — are now partial** and require staging credentials to fully close. Multi-market day-one launch remains **No-go** until these are verified on staging, plus the Paystack live-key swap (FND-P1-020) is applied in production.

### Pilot recommendation: **Controlled pilot** (single tenant, ZA, web-first, limited provider cohort)

After Wave 0–1 remediation and staging runtime verification, a limited pilot is feasible. This is **not confirmed** without staging access.

### Largest risks

1. **CSRF protection** can be silently disabled without `CSRF_SECRET`
2. **Multi-tenant isolation** unproven at runtime (`resolveTenantIdWithZaFallback` in 100+ routes)
3. **Money paths** lack E2E coverage (only 2 Playwright specs for entire platform)
4. **False completeness** — search map fake coordinates, shipping stubs, POS unpersisted clients, time-clock fake success
5. **Internal docs overstate readiness** — `LAUNCH_READINESS_100.md` claims 100% while sign-off table is empty

### Evidence limitations

Cannot verify without staging/production: Paystack webhook confirmation, payout transfers, cross-tenant live isolation, notification delivery, backup restore, production cron behaviour, game-day drills.

---

## B. Platform readiness dashboard

| Domain | Score | Weighted | Confidence |
|--------|------:|---------:|------------|
| Core business functionality | 74 | 13.32 | Medium |
| Customer web | 75 | 5.25 | Medium |
| Customer mobile | 74 | 3.70 | Medium |
| Provider web | 72 | 5.04 | Medium |
| Provider mobile | 70 | 3.50 | Medium |
| Superadmin / operations | 80 | 8.00 | Medium |
| Security, identity, privacy | 65 | 7.80 | Low |
| Payments / financial integrity | 80 | 6.40 | Medium |
| Data, reporting, integrations | 72 | 5.76 | Medium |
| QA / testing | 52 | 3.12 | High |
| Infrastructure / DevOps | 76 | 3.80 | Low |
| Performance / reliability | 63 | 1.89 | Low |
| UX / accessibility | 66 | 1.98 | Low |
| Operational readiness | 68 | 1.36 | Low |
| Legal / regulatory | 70 | 0.70 | Low |

### Application scores

| Application | Score | Summary |
|-------------|------:|---------|
| APP-001 Web + API | 75 | Strong API surface; gaps in search map, shipping, POS |
| APP-002 Admin SPA | 80 | Broad admin coverage; section RBAC in place |
| APP-003 Customer mobile | 74 | 32/32 parity screens; 213 tests pass |
| APP-004 Provider mobile | 70 | 335 tests pass; PayCloud same-terminal stub |

---

## C. Agent completion dashboard

| Agent | Scope | Status | Findings | Confidence |
|------:|-------|--------|----------|------------|
| 0 | Coordinator | Complete | — | Medium |
| 1 | Discovery | Complete | 0 | High |
| 2 | Customer web | Complete | 6 | Medium |
| 3 | Customer mobile | Complete | 2 | Medium |
| 4 | Provider web | Complete | 5 | Medium |
| 5 | Provider mobile | Complete | 1 | Medium |
| 6 | Superadmin | Complete | 2 | Medium |
| 7 | Identity / permissions | Complete | 4 | Medium |
| 8 | Security / privacy | Complete | 3 | Medium |
| 9 | Payments / finance | Complete | 0 | Medium |
| 10 | Integrations | Complete | 3 | Medium |
| 11 | Data / reporting | Complete | 2 | Medium |
| 12 | UX / accessibility | Complete | 2 | Low |
| 13 | QA / testing | Complete | 1 | High |
| 14 | Performance | Complete | 1 | Low |
| 15 | DevOps | Complete | 2 | Low |
| 16 | Operations | Complete | 1 | Low |
| 17 | Legal / compliance | Complete | 1 | Low |
| 18 | False completeness | Complete | 3 | High |
| 19 | Adversarial challenger | Complete | 2 added | High |

---

## D. Application-by-application findings

### APP-001 — Web + API (Next.js)

**Works:** Booking holds, Paystack checkout, provider portal, admin API (422 routes), 41 crons with `verifyCronRequest`, notification queue, Didit KYC, PayCloud Cloud Mode, Yoco, finance ledger triggers, refund flows.

**Partial:** Search (fake map coords, no-op advanced filters), multi-tenant resolution (ZA fallbacks), provider POS (unpersisted clients), KYB (flags off), ecommerce shipping.

**Broken:** Search map UX (random London pins).

**Missing:** Stripe/Flutterwave processors, PayCloud same-terminal native module, courier shipment creation.

**Unsafe:** CSRF disabled without secret; fake-success time-clock API.

**Cannot verify:** Live webhooks, payout transfers, cross-tenant isolation.

### APP-002 — Admin SPA (Vite)

**Works:** Section RBAC via `requireAdminSection`, finance/payout/dispute workflows, control plane integrations, feature flags, audit logs.

**Partial:** Admin HTML served at edge without role gate (API gated); 16 admin routes flagged for tenant scope review.

**Cannot verify:** Impersonation flows under production MFA policy.

### APP-003 — Customer mobile (Expo)

**Works:** 32/32 parity contract screens, 213 Jest tests pass, offline bar, Paystack return screen.

**Partial:** Hardcoded category fallback on API failure; tax editing web-only.

**Cannot verify:** Push notification delivery, deep links in production.

### APP-004 — Provider mobile (Expo)

**Works:** 335 Jest tests pass, onboarding guards, booking management, group bookings.

**Partial:** PayCloud same-terminal stub; ads placements gated by market.

**Cannot verify:** Background location, app-store submission state.

---

## E. End-to-end journey results (56 journeys)

| Result | Count |
|--------|------:|
| Pass | 18 |
| Partial pass | 25 |
| Fail | 2 |
| Blocked | 0 |
| Cannot verify | 11 |

### Critical journeys

| ID | Journey | Result | Key finding |
|----|---------|--------|-------------|
| JRN-003 | Search to booking | Partial pass | FND-P0-004, FND-P1-002 |
| JRN-004 | Checkout to payment | Cannot verify | FND-P0-002 |
| JRN-026 | Settlement to payout | Cannot verify | FND-P0-002 |
| JRN-047 | Payment to payout reconciliation | Cannot verify | FND-P1-008 |
| JRN-052 | Cross-tenant access attempt | Cannot verify | FND-P0-003 |
| JRN-054 | Backup restore | Cannot verify | FND-P1-016 |

Full journey register: [journey-register.json](./journey-register.json)

---

## F. Go-live blockers

### P0 — Critical (7)

| ID | Title | Owner | Remediation |
|----|-------|-------|-------------|
| FND-P0-001 | CSRF protection disabled without CSRF_SECRET | platform-engineering | REM-001 |
| FND-P0-002 | E2E coverage critically thin for money paths | qa-engineering | REM-006 |
| FND-P0-003 | Multi-market tenant isolation unverified | platform-security | REM-007 |
| FND-P0-004 | Search map displays fake coordinates | customer-web | REM-003 |
| FND-P0-005 | Shipping integration fully stubbed | ecommerce | REM-005 |
| FND-P0-006 | POS creates unpersisted client IDs | provider-web | REM-004 |
| FND-P0-007 | Time-clock returns fake success | provider-web | REM-002 |

### P1 — High priority (19, selected)

| ID | Title | Owner |
|----|-------|-------|
| FND-P1-008 | 7-day staging drift gate unsigned | finance |
| FND-P1-009 | Game-day drills unverified | sre |
| FND-P1-012 | API relies on service-role bypass | platform-security |
| FND-P1-015 | LAUNCH_READINESS_100 contradicts evidence | release-captain |
| FND-P1-018 | Web typecheck failure blocks release:check | provider-web |
| FND-P1-019 | 53 provider routes missing tenant guard heuristic | platform-security |

Full register: [findings-register.json](./findings-register.json)

---

## G. Capability traceability matrix (summary)

| ID | Capability | Status | Apps | Gap |
|----|------------|--------|------|-----|
| CAP-BOOK-001 | Public booking checkout | Full | APP-001, APP-003 | — |
| CAP-PAY-001 | Paystack online payments | Full | APP-001 | Runtime unverified |
| CAP-PAY-002 | PayCloud terminal | Partial | APP-001, APP-004 | Same-terminal incomplete |
| CAP-PAYOUT-001 | Provider payouts | Full | APP-001, APP-002 | Transfer E2E unverified |
| CAP-KYC-001 | Didit identity verification | Full | APP-001, APP-002 | — |
| CAP-KYB-001 | Provider KYB | Partial | APP-001 | Flags off by default |
| CAP-SEARCH-001 | Provider search | Partial | APP-001, APP-003 | Fake map, no-op filters |
| CAP-ECOM-001 | Product shipping | Stub | APP-001 | Couriers throw |
| CAP-ADMIN-001 | Superadmin portal | Full | APP-002 | Edge HTML exposure |
| CAP-TENANT-001 | Multi-tenant isolation | Partial | APP-001 | Runtime unverified |
| CAP-NOTIF-001 | Notification queue | Full | APP-001 | Delivery unverified |
| CAP-POS-001 | Provider POS | Partial | APP-001 | Unpersisted clients |

Full register: [capability-register.json](./capability-register.json)

---

## H. Security, privacy and permissions report

### Strengths

- Supabase Auth + `users.role` as source of truth
- ~200+ migrations with RLS policies; `is_superadmin()` helper
- Admin section RBAC (`requireAdminSection`) with tenant membership check
- Admin MFA via Supabase TOTP (AAL2) when policy enabled
- Security headers (HSTS, CSP, X-Frame-Options) in `next.config.mjs`
- Upstash rate limiting (with in-memory fallback)
- Webhook HMAC verification (Paystack, Didit, Yoco, PayCloud)
- POPIA-oriented data retention documented

### Attack paths and gaps

| Risk | Severity | Evidence |
|------|----------|----------|
| CSRF bypass when secret unset | P0 | EVD-001 |
| Cross-tenant data access (unverified) | P0 | EVD-004, EVD-005 |
| Service-role bypass — API guards sole boundary | P1 | EVD-021 |
| Rate limit per-instance fallback | P1 | EVD-014 |
| CSP unsafe-inline/unsafe-eval | P1 | EVD-015 |
| Admin SPA HTML without edge auth | P1 | EVD-020 |
| 53 provider routes tenant guard heuristic fail | P1 | EVD-037 |

### API authorization scan

| Namespace | Total | With auth guard | Notes |
|-----------|------:|----------------:|-------|
| /api/admin | 422 | 409 | Alternate guards (`requireSuperadmin`) not counted by heuristic |
| /api/provider | 457 | 363 | 53 missing `getProviderIdForUser` heuristic |
| /api/me | 129 | 125 | Strong coverage |
| /api/public | 94 | 1 | Intentionally public |
| /api/cron | 41 | 0 | All use `verifyCronRequest` |

Full report: [api-guard-report.json](./api-guard-report.json)

---

## I. Payments and financial integrity report

### Financial chain trace

```
Customer payment (Paystack) → webhook (HMAC + idempotency) → booking_payments
  → finance_transactions trigger → payout balance → payout request
  → admin approval → Paystack transfer → reconciliation-gate cron
```

### Results

| Area | Status | Evidence |
|------|--------|----------|
| Paystack checkout | Pass (unit) | 95 payment/ledger tests pass |
| Webhook idempotency | Pass (code) | EVD-034 |
| Refund proportional reversal | Pass (unit) | refund tests |
| PayCloud settle | Pass (unit) | settle-paycloud-payment tests |
| Ledger drift | Pass (unit) | EVD-035; warns `loyalty_discount` allowlist unused |
| Payout transfer | Cannot verify | No E2E |
| Shadow GL cutover | Partial | Payouts read `finance_transactions`, not journal_entries |
| Provider-collected tenders | Pass | No commission on cash/Yoco/PayCloud (migration 662) |

### Integration status

| Integration | Status |
|-------------|--------|
| Paystack | Full |
| PayCloud Cloud | Full |
| PayCloud same-terminal | Partial (native missing) |
| Yoco | Full |
| Wallet / gift card | Full |
| Stripe | Mock |
| Flutterwave | Mock |
| Shipping couriers | Stub |

---

## J. False completeness report

| Surface | Appears complete | Actually |
|---------|------------------|----------|
| Search map | Map with pins | Random London coordinates |
| Shipping | Package exists | `createShipment` throws |
| POS New Client | Button works | Local-only ID, not persisted |
| Time clock | Success response | Fake temp ID if table missing |
| LAUNCH_READINESS_100 | 100% engineering | Unsigned gates; gaps in code |
| Stripe feature flag | Listed in admin | Not enforced in code |
| QR scanner | Scanner UI | Manual input only |
| Custom offer images | Upload button | Toast says not implemented |
| Advanced search | Filter UI | date/time/price filters no-op |

---

## K. Operational readiness report

| Capability | Status | Gap |
|------------|--------|-----|
| Runbooks (game day, DR, launch) | Documented | Not executed |
| CI/CD (10 workflows) | Present | `release:check` fails on typecheck |
| Observability (Sentry, Slack) | Configured | Gates need secrets |
| On-call roster | Cannot verify | Not in repo |
| Support KB | Cannot verify | Not in repo |
| Finance drift gate | Coded | 7-day observation unsigned |
| Compliance (POPIA) | Documented | Legal docs not in repo |

---

## L. Remediation roadmap

### Wave 0 — Immediate containment
- REM-001: Enforce CSRF_SECRET; fail deploy if missing
- REM-002: Remove fake-success time-clock/days-off paths
- REM-003: Fix or disable search map fake coordinates

### Wave 1 — Critical go-live blockers (P0)
- REM-004: Fix NewSaleDialog client persistence
- REM-005: Implement or disable shipping
- REM-006: E2E suite for booking + payment + refund + payout
- REM-007: Multi-tenant isolation test suite
- REM-031: Fix terminal-shop typecheck error
- REM-032: Review 53 provider routes for tenant guards

### Wave 2 — Go-live completion (P1)
- REM-008 through REM-012: Postal areas, rate limits, drift gate, drills, KYB

### Wave 3 — Controlled pilot hardening
- REM-013 through REM-015: PayCloud same-terminal, search filters, CSP

### Wave 4 — Multi-market scale
- REM-016 through REM-018: Per-tenant payments, remove ZA fallback, legal docs

Full backlog: [remediation-backlog.json](./remediation-backlog.json)

---

## M. Final recommendation

### Selected: **No-go pending critical remediation**

**Rationale:**

1. **7 unresolved P0 blockers** — platform cannot be declared production-ready per scoring model
2. **Multi-market day-one** requires proven tenant isolation; only static traces exist
3. **565 unit tests** and **2 E2E specs** do not cover money-path runtime behaviour
4. **`release:check` fails** on web typecheck — blocks standard release pipeline
5. **LAUNCH_READINESS_100.md** claims are not evidence-backed; challenger (Agent 19) confirmed contradictions

### What can be piloted safely (after Wave 0–1 + staging)

- Single tenant (ZA), web-first
- Core booking + Paystack online payments
- Limited provider cohort with manual ops oversight
- Exclude: ecommerce shipping, multi-market domains, PayCloud same-terminal

### What must be fixed first

1. Paystack live key in production region settings (REM-033 / FND-P1-020)
2. Dedicated CSRF_SECRET in Vercel (REM-001 — CSRF active via CRON_SECRET fallback)
3. E2E money-path staging credentials for full checkout coverage (REM-006)
4. Multi-tenant isolation formal penetration test on staging (REM-007)

**Resolved in remediation sprint (2026-07-11):** search map coords (REM-003), fake-success APIs (REM-002), POS client persistence (REM-004), shipping gate (REM-005), typecheck (REM-031).

### Staging access required before any launch decision

Schedule Phase 3b with staging credentials to close 11 "Cannot verify" journeys.

---

## Machine-readable outputs

All registers in [docs/audit/go-live-2026-07/](./) with stable IDs for rerun comparison.

| Register | File |
|----------|------|
| Platform inventory | platform-inventory.json |
| Findings | findings-register.json |
| Journeys | journey-register.json |
| Evidence | evidence-register.json |
| Integrations | integration-register.json |
| Capabilities | capability-register.json |
| Roles | roles-permissions.json |
| Tests | test-register.json |
| Readiness scores | readiness-scores.json |
| Remediation | remediation-backlog.json |
| Challenger | challenger-report.json |
| Audit runs | audit-run-results.json |

---

*This report is an engineering audit, not legal advice. Compliance findings require specialist legal review for each launch market.*
