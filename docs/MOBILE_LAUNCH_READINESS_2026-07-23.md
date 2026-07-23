# Mobile iOS/Android Launch Readiness Report

**Date:** 2026-07-23  
**Scope:** Customer app (`com.beautonomi`) + Provider app (`com.beautonomi.partner`)  
**Version audited:** 1.0.78 (build 270 iOS / versionCode 271 Android)  
**Evidence:** Static code audit, automated test execution (2026-07-23), route verification, AUDIT-2026-07-22 artefacts  
**Interactive summary:** Open `mobile-launch-readiness.canvas.tsx` in Cursor Canvas

---

## Executive verdict

| App | This pass | Prior audit (APP-003/004) | iOS | Android |
|-----|----------:|----------------------------:|-----|---------|
| **Customer** | **76%** | 78% | **Conditional Go** | **Conditional Go** |
| **Provider** | **70%** | 72% | **Conditional Go** | **Conditional Go** |

**Recommendation:** Both apps are **launch-capable** for a controlled **ZA Paystack + PayCloud Cloud Mode** cohort. They are **not** ready for unconditional App Store / Play production traffic until blockers below are cleared and device QA is signed.

**Do not use** the April 2026 reports claiming 94% (customer) / 92% (provider) — superseded by [AUDIT-2026-07-22](audit/go-live-2026-07-22/) and this re-audit of large uncommitted mobile diffs.

**Platform posture (AUDIT-2026-07-22):** Overall **75%**, recommendation **Conditional Go** pending CI artifact capture for P0 money-path + tenant-isolation E2E (user-attested passing on staging 2026-07-23).

---

## Evidence basis

| Signal | Status |
|--------|--------|
| Customer Jest | **227** pass (33 suites) — verified 2026-07-23 |
| Provider Jest | **367** pass (74 suites) — verified 2026-07-23 |
| `pnpm run release:check:mobile` | **Pass** — typecheck, lint, parity (32/32 contract screens) |
| Payment/deep-link route audit | **Pass** — no dead Expo Router screens for audited targets |
| Force-update / MarketGate / RoleGate / WrongApp | Present in both apps |
| Open P0 money/tenant | **0** (staging attested; CI artifact still missing) |
| Live device / push / store submit | **Not verified** — manual matrix below still required |
| Working tree | Large uncommitted payment/onboarding/POS/join churn — ship risk until device QA |

---

## Verified QA run (2026-07-23)

Automated and static verification executed locally. This is **not** a substitute for on-device E2E.

### Automated — pass

| Check | Customer | Provider |
|-------|----------|----------|
| Jest (all suites) | 33/33 suites, **227** tests | 74/74 suites, **367** tests |
| TypeScript (`tsc --noEmit`) | Pass | Pass (after `resolveBarcodeForPosSale` null fix) |
| Lint | Pass (warnings only) | Pass (warnings only) |
| Mobile parity contract | 32/32 screens implemented | 7 core files OK |

Commands run:

```bash
pnpm --filter customer test
pnpm --filter provider test
pnpm run release:check:mobile
```

### Static route verification — pass

All critical payment-return, notification, and deep-link pathnames resolve to existing Expo Router screens:

- Customer: `resolvePaystackVerifyRoute`, Paystack return screens, `notifications.ts` (28 targets)
- Provider: `+native-intent.tsx` remaps, `join.tsx`, `resolveProviderNotificationRoute.ts`

No missing screen files found.

### Code fixes applied during QA

| Fix | File | Verified by |
|-----|------|-------------|
| Product-order Paystack fallback → `/(app)/product-orders` | `apps/customer/src/lib/payments/resolvePaystackVerifyRoute.ts` | Jest (10 tests) |
| Product checkout helper coverage | `apps/customer/__tests__/features/shop/productOrderCheckoutHelpers.test.ts` | Jest (10 tests) |
| POS barcode `image_urls` null → undefined | `apps/provider/src/features/products/resolveBarcodeForPosSale.ts` | Provider `tsc` |

### Still requires manual device QA

Cannot verify without physical devices / staging builds:

- Paystack AuthSession return on real iOS Safari + Android Chrome custom tabs
- Push notification tap → deep link
- Provider staff join universal link cold start
- Provider paid onboarding kill-app resume
- PayCloud Cloud Mode on terminal hardware
- App Store / Play submit credentials and binary review

Use the device QA matrix below and sign off before EAS production submit.

---

## Journey matrix (intention vs code)

### Customer — largely complete

| Journey | Status | Notes |
|---------|--------|-------|
| Auth / portal / WrongApp | Complete | Phone/email OTP, OAuth, RoleGate |
| Search → partner → book → checkout → Paystack | Complete | Search list-only (no map — APP-003) |
| Soft-pending cancel/closed → verify/poll | Complete | Recent hardening across book/shop/wallet |
| Wallet / gift card / membership / custom offer | Complete | Idempotency WIP in working tree |
| Shop product checkout + return | Complete | Callback fallback **fixed** this pass |
| Account settings / Didit KYC | Complete | Native build required (not Expo Go) |
| On-demand waiting | Incomplete | Safe if `on_demand_accept_customer_enabled` off |

### Provider — mature, high WIP risk

| Journey | Status | Notes |
|---------|--------|-------|
| Auth / staff vs owner boot | Complete | Staff profile-404 guard; join token handoff |
| Onboarding wizard + zones + paid finalize | Complete | Large uncommitted rewrite — device QA required |
| Bookings / group bookings / walk-in POS | Complete | POS matrix + bookings strip churn |
| PayCloud Cloud Mode + Paystack terminal | Complete | Core Wave 1 path |
| PayCloud same-terminal (Wiseasy) | Android-only | Keep flag off for Wave 1 |
| Staff join App Link + `/join` | New | Must device-QA cold-start universal links |
| Org switcher / team / verification / EOD | Present | Thin automated coverage |
| Terminal merchant onboarding (812–814) | Separate cohort | Not required for core book/pay |

---

## Blockers before store submit

1. **Dead cold-start route (customer) — FIXED this pass**  
   [`resolvePaystackVerifyRoute.ts`](../apps/customer/src/lib/payments/resolvePaystackVerifyRoute.ts) previously mapped `type: "product_order"` without id to non-existent `/(app)/account-settings/orders`. Now routes to `/(app)/product-orders` (matches [`shop/paystack.tsx`](../apps/customer/app/(app)/shop/paystack.tsx)).

2. **Uncommitted money/ops bundle**  
   Customer payment hardening + provider finalize-onboarding, join, walk-in/POS, PayCloud flags, bookings strip. Do not ship without matrix QA on real devices.

3. **EAS / App Store credentials**  
   Per [DEPLOYMENT_EAS.md](DEPLOYMENT_EAS.md): provider iOS credentials **Next**; customer Apple credentials **Pending**. Live bundle IDs: `com.beautonomi` (customer), `com.beautonomi.partner` (provider).

4. **Backend P1s that break soft-pending in prod**  
   - **FND-P1-024** — Paystack/Stripe webhooks may hit CSRF when secret set  
   - **FND-P1-020** — Production config-bundle may expose `pk_test_`  
   Attach staging CI artifact for FND-P0-002/003 before unconditional Go.

---

## Warnings (ship with eyes open)

- Android **targetSdk 36** bump (both apps) — Play/OEM QA required
- Production EAS `SENTRY_DISABLE_AUTO_UPLOAD: true` — weak crash symbolication
- Customer Android App Links only `/bookings` + `/account-settings` (commerce HTTPS → app narrower than iOS)
- Provider PayCloud QR/cashback now AND platform feature flags — may hide in prod if flags unset
- Migration **811** should be applied for correct new-staff POS defaults; **812–814** only for card-machine merchant cohort
- Thin UI/integration tests for join, org switcher, PayCloud sheet, `productOrderCheckoutHelpers`, walk-in

---

## Platform differences

| Capability | iOS | Android |
|------------|-----|---------|
| Core Paystack (customer + provider subs) | Ready | Ready |
| PayCloud Cloud Mode | Ready | Ready |
| PayCloud same-terminal (Wiseasy) | N/A (module android-only) | Hardware spike; keep gated |
| Didit KYC | Native build | Native build |
| Universal / App Links | Broader associated domains | Narrower intentFilters (customer) |

---

## Store submit recommendation

| App | iOS | Android | Notes |
|-----|-----|---------|-------|
| **Customer** | Conditional Go | Conditional Go | Core Paystack ready; clear FND-P1-020/024 before prod traffic |
| **Provider** | Conditional Go | Conditional Go | Cloud Mode + Paystack subs OK; do not market same-terminal in Wave 1 |
| **Terminal merchant / same-terminal** | No-go | No-go | Until hardware spike + migrations 812/814 + dedicated QA |

---

## Device QA matrix (execute before EAS submit)

Run on **one iOS device + one Android device** per app using a **production-like staging build** (EAS preview or production profile). Sign each row Pass / Fail / N/A.

### Shared (both apps)

| # | Test | iOS | Android | Expected |
|---|------|-----|---------|----------|
| S1 | Cold start after install | | | App loads; no crash on first launch |
| S2 | Force-update gate | | | Blocking screen when min version > app version |
| S3 | WrongApp / RoleGate | | | Customer cannot enter provider app and vice versa |
| S4 | Push notification tap → deep link | | | Opens correct screen (booking, chat, or orders) |
| S5 | Market gate (if multi-market) | | | ZA market loads; blocked market shows gate |

### Customer app

| # | Test | iOS | Android | Expected |
|---|------|-----|---------|----------|
| C1 | Login (phone OTP) | | | Authenticates; lands on home/tabs |
| C2 | Search → partner profile → book service | | | Hold created; checkout reachable |
| C3 | Booking Paystack — success | | | Returns to booking detail; status paid/confirmed |
| C4 | Booking Paystack — cancel browser | | | Soft-pending; booking visible with pending_payment |
| C5 | Booking Paystack — kill app during checkout, reopen | | | Return route verifies; no duplicate charge |
| C6 | Wallet top-up Paystack return | | | Balance updates or pending state with retry |
| C7 | Gift card purchase return | | | Lands on payments; order reflected |
| C8 | Membership subscribe return | | | Lands on membership screen |
| C9 | Shop product checkout — success | | | Order detail or orders list |
| C10 | Shop Paystack cold-start (`paystack-callback`) | | | Routes to product-orders or order detail (not dead route) |
| C11 | Custom offer Paystack return | | | Lands on custom-requests or booking detail |
| C12 | Booking detail — pay remaining / additional charge | | | Verify + poll; soft-pending on slow webhook |
| C13 | Didit identity verification (if enabled) | | | Native flow completes; server status updates |
| C14 | Account settings navigation | | | Wallet, payments, profile, delete account reachable |

### Provider app

| # | Test | iOS | Android | Expected |
|---|------|-----|---------|----------|
| P1 | Owner login → dashboard | | | Tabs load; More hub accessible |
| P2 | Onboarding wizard — free plan | | | Completes; reaches verify-identity or tabs |
| P3 | Onboarding — paid plan Paystack success | | | Subscription active; no owner wizard trap |
| P4 | Onboarding — paid plan cancel/kill-app resume | | | AsyncStorage recovery; verify/retry works |
| P5 | Onboarding — mobile/both without zones | | | Blocked at step 9 with validation message |
| P6 | Staff join App Link (unsigned) | | | `/join?token=…` → login → accept |
| P7 | Staff join App Link (signed in) | | | Auto-accept; lands in staff context (not owner onboarding) |
| P8 | Org switcher (multi-salon user) | | | Switch org; API calls use correct provider |
| P9 | Bookings list — date strip / to-review | | | Strip aligns with list; badges match nav-counts |
| P10 | Booking detail — mark paid / Yoco | | | Idempotent; structured errors on retry |
| P11 | Group booking — PayCloud Cloud payment | | | Payment completes; receipt available |
| P12 | Walk-in sale — cash | | | Sale recorded |
| P13 | Walk-in sale — PayCloud Cloud | | | Cloud Mode sheet completes |
| P14 | Walk-in sale — Paystack terminal (if configured) | | | Terminal allocation + collection |
| P15 | PayCloud same-terminal (Android P5 only) | N/A | | Only if flag on + hardware; otherwise N/A |
| P16 | Custom offer — salon/at-home location rules | | | Validation blocks invalid location/address |
| P17 | Payouts request (owner) | | | Permission gate; request submits |
| P18 | EOD report | | | Report loads; PayCloud/cashback labels correct |
| P19 | Didit verification panel | | | Native build; server-authoritative status |
| P20 | Team invite — email fail shows join URL | | | Copyable link for manual share |

### QA sign-off

| Role | Name | Date | Build (EAS ID) | Result |
|------|------|------|----------------|--------|
| QA lead | | | | Pass / Fail |
| Product | | | | Pass / Fail |
| Engineering | | | | Pass / Fail |

---

## Wave 1 ship criteria

**Go when all of:**

- [x] Product-order Paystack callback fallback fixed + unit test green
- [x] Automated QA green (`release:check:mobile`, 227 + 367 Jest tests, route audit)
- [ ] Device QA matrix signed (customer + provider, iOS + Android)
- [ ] EAS production credentials valid for both apps
- [ ] FND-P1-020/024 cleared or accepted with monitoring
- [ ] Same-terminal + terminal-merchant features remain flag-off
- [ ] Staging CI artifact attached for P0 money-path + tenant-isolation E2E

**Defer out of Wave 1:**

- On-demand matching UI
- Search map
- PayCloud same-terminal marketing
- Multi-market Stripe
- Terminal merchant cohort (migrations 812–814)

---

## Related documents

| Document | Purpose |
|----------|---------|
| [audit/go-live-2026-07-22/EXECUTIVE_REPORT.md](audit/go-live-2026-07-22/EXECUTIVE_REPORT.md) | Signed platform audit |
| [GO_LIVE_NOW.md](GO_LIVE_NOW.md) | Ordered release runbook |
| [DEPLOYMENT_EAS.md](DEPLOYMENT_EAS.md) | EAS build/submit setup |
| [IOS_RELEASE_SUBMIT.md](IOS_RELEASE_SUBMIT.md) | TestFlight / Play submit steps |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Pre-release checklist |
| [PAYMENTS_MOBILE_COMPLIANCE.md](PAYMENTS_MOBILE_COMPLIANCE.md) | PCI / hosted checkout policy |
| [mobile-apps-readiness.md](mobile-apps-readiness.md) | API parity vs device QA |

---

## Changes made in this audit pass

1. Fixed [`resolvePaystackVerifyRoute.ts`](../apps/customer/src/lib/payments/resolvePaystackVerifyRoute.ts) — `product_order` without id now routes to `/(app)/product-orders`
2. Added unit tests for product-order list fallback and [`productOrderCheckoutHelpers.ts`](../apps/customer/src/features/shop/productOrderCheckoutHelpers.ts)
3. Fixed provider TypeScript error in [`resolveBarcodeForPosSale.ts`](../apps/provider/src/features/products/resolveBarcodeForPosSale.ts) (`image_urls` null handling)
4. Verified `pnpm run release:check:mobile` passes (typecheck, lint, 32/32 parity)
5. Verified no dead payment/notification/deep-link routes in either app
6. Created interactive canvas report
7. Published this document with embedded device QA matrix
