# Opportunities & Roadmap

> Generated: 2026-02-17

## Top 10 Highest-Leverage Opportunities

### 1. Fix Critical Security Holes (Immediate Revenue Protection)

**Impact:** Prevents financial loss and breach liability.

Unauthenticated Paystack proxy routes can be exploited to initiate unauthorized transfers. Unauthenticated notification endpoints could be used for spam attacks.

**Effort:** 1-2 days | **Risk if not done:** Financial loss, platform compromise

### 2. Bundle Optimization — Remove Duplicate Libraries (30-40% Bundle Reduction)

**Impact:** Faster page loads → better SEO → more organic traffic → more bookings.

The web app ships ~2MB of unused map and carousel libraries. Removing 4 map libraries (keep Mapbox) and 2 carousel libraries (keep Embla) could reduce bundle by 30-40%.

**Effort:** 2-3 days | **Impact:** 2-3s faster load time

### 3. Analytics Event Standardization (Unlock Data-Driven Decisions)

**Impact:** Currently, mobile and web events don't match — the conversion funnel is unmeasurable.

Standardizing 4 mismatched event names and adding 20+ user properties to mobile identify would unlock:
- True cross-platform conversion funnel
- Provider ROI metrics (views → bookings → revenue)
- Customer segmentation for marketing

**Effort:** 3-4 days | **Impact:** Enables all future product decisions

### 4. Enable TypeScript Strict Mode (Catch Bugs Before Users Do)

**Impact:** Currently `strict: false` means TypeScript catches ~50% of bugs it could.

Enabling strict mode will surface 100-500+ type errors that are currently silent runtime bugs. Incremental rollout recommended (one package at a time).

**Effort:** 1-2 weeks | **Impact:** Significantly fewer runtime crashes

### 5. Monorepo CI Pipeline (Ship With Confidence)

**Impact:** Currently no automated quality gates. Every merge is a manual trust exercise.

A basic CI pipeline (typecheck → lint → build) would catch regressions before they reach production. Add E2E tests later for the critical booking flow.

**Effort:** 1-2 days | **Impact:** Prevents regression on every commit

### 6. Provider Mobile Feature Parity (Expand Addressable Market)

**Impact:** Provider mobile app is ~85% complete vs web portal. Key gaps:

- No analytics events tracked → provider mobile is a black box
- Read-only screens that should be editable
- Missing inventory/product management

Closing these gaps lets providers manage their business entirely from mobile → higher engagement → lower churn.

**Effort:** 2-3 weeks | **Impact:** Provider retention

### 7. Refactor Mega-Endpoints (Stability & Maintainability)

**Impact:** Two files are >1400 lines each:
- `/api/public/bookings` POST (booking creation) — 1434 lines
- `/api/payments/webhook` (Paystack webhook) — 1976 lines

These are the most critical code paths and the hardest to debug/modify. Splitting into composable functions (payment handlers, validation, booking creation, notification dispatch) dramatically reduces bug surface.

**Effort:** 1-2 weeks | **Impact:** Faster feature development, fewer production incidents

### 8. Shared Component Library (Design Consistency + Dev Speed)

**Impact:** Currently, web and mobile have separate component implementations with no shared primitives beyond tokens.

Creating `@beautonomi/ui` with cross-platform primitives (Button, Input, Card, Badge, etc.) would:
- Ensure visual consistency
- Cut new feature development time by 30-40%
- Enable design system documentation (Storybook)

**Effort:** 2-3 weeks | **Impact:** Long-term development velocity

### 9. Real-Time Features via Supabase Realtime (Competitive Advantage)

**Impact:** Currently, booking status updates, chat messages, and waitlist notifications require polling. Supabase Realtime subscriptions are partially implemented (mobile chat) but not for:
- Provider dashboard (live booking updates)
- Customer booking status
- Waitlist notifications
- Calendar sync

**Effort:** 1-2 weeks | **Impact:** Better UX, competitive differentiation

### 10. E2E Test Coverage for Booking Flow (Revenue Protection)

**Impact:** The booking flow (browse → select → hold → pay → confirm) touches 5+ API routes, 3+ tables, and external payment APIs. It currently has zero automated test coverage.

One broken merge could silently break the entire revenue path.

**Effort:** 1 week | **Impact:** Revenue protection

---

## Post-Roadmap Implementations ✅ COMPLETE

| Task | Status |
|------|--------|
| Internationalization (i18n) — 4 languages across all apps | ✅ Done (`@beautonomi/i18n` package, language settings screens, tab translations) |
| Provider mobile reports expansion — 8 granular report screens | ✅ Done (revenue, bookings, clients, staff, payments, products, services) |
| Repo structure cleanup — 127 legacy docs archived | ✅ Done (`docs/archive/`, `LEGACY.md` markers) |
| Supabase migrations moved to root `supabase/` | ✅ Done (229 migrations, config, README) |
| TypeScript strict mode aligned across all apps | ✅ Done (`strict: true` in web, customer, provider) |
| EAS deployment configuration | ✅ Done (`eas.json` credentials, `app.json` OTA URLs, `docs/DEPLOYMENT_EAS.md`) |
| Language settings screens (mobile) | ✅ Done (customer `account-settings/language`, provider `settings/language`) |
| Zero TODO/FIXME/HACK cleanup | ✅ Done (0 remaining across entire codebase) |

---

## Phased Roadmap — ALL PHASES COMPLETE

### Phase 0: Stability & Security ✅ COMPLETE

**Goal:** Prevent catastrophic failures and establish quality baseline.

| Task | Priority | Status |
|------|----------|--------|
| Add auth to `/api/paystack/*` routes | 🔴 Critical | ✅ Done |
| Add auth to notification send endpoints | 🔴 Critical | ✅ Done |
| Audit RLS on financial tables | 🔴 Critical | ✅ Done (Migration 230) |
| Create monorepo CI pipeline | 🟠 High | ✅ Done (`.github/workflows/ci.yml`) |
| Fix `clean` script for Windows | 🟡 Medium | ✅ Done (`rimraf`) |
| Remove duplicate ESLint config | 🟡 Medium | ✅ Done |
| Add root `.prettierrc` | 🟡 Medium | ✅ Done |
| Fix middleware duplicate code | 🟡 Medium | ✅ Done |

### Phase 1: Foundation & DX ✅ COMPLETE

**Goal:** Improve developer experience and code quality.

| Task | Priority | Status |
|------|----------|--------|
| Enable TypeScript strict mode | 🟠 High | ✅ Done |
| Remove unused map/carousel libraries | 🟠 High | ✅ Done (~2MB saved) |
| Revive dead packages (`config`, `eslint-config`) | 🟡 Medium | ✅ Done |
| Add bundle analyzer to web app | 🟡 Medium | ✅ Done (`@next/bundle-analyzer`) |
| Add test framework to provider app | 🟡 Medium | ✅ Done (jest + jest-expo) |
| Remove deprecated dependencies | 🟡 Medium | ✅ Done |
| Standardize analytics event names | 🟠 High | ✅ Done |

### Phase 2: Customer MVP Polish ✅ COMPLETE

**Goal:** Ensure the customer journey is flawless end-to-end.

| Task | Priority | Status |
|------|----------|--------|
| Refactor `/api/public/bookings` POST | 🟠 High | ✅ Done (4 helpers) |
| Add mobile analytics identify properties | 🟠 High | ✅ Done |
| Implement minimum viable funnel tracking | 🟠 High | ✅ Done |
| E2E tests for booking flow (web) | 🟠 High | ✅ Done (29+ tests) |
| Customer loyalty flow polish | 🟡 Medium | ✅ Done (haptics, animations, share) |
| Real-time booking status updates | 🟡 Medium | ✅ Done (Supabase Realtime) |

### Phase 3: Provider MVP Polish ✅ COMPLETE

**Goal:** Ensure providers can fully manage business from mobile.

| Task | Priority | Status |
|------|----------|--------|
| Provider mobile analytics events | 🟠 High | ✅ Done (30+ events) |
| Refactor `/api/payments/webhook` | 🟠 High | ✅ Done (5 handlers) |
| Provider mobile: editable screens | 🟡 Medium | ✅ Done (verified + enhanced) |
| Provider mobile: inventory management | 🟡 Medium | ✅ Done (new screen) |
| Provider mobile: staff scheduling | 🟡 Medium | ✅ Done (new screen) |
| Provider dashboard real-time updates | 🟡 Medium | ✅ Done (Supabase Realtime) |
| Provider OAuth (Google/Apple) | 🔵 Low | ✅ Done |

### Phase 4: Analytics, Monetization & Explore ✅ COMPLETE

**Goal:** Build data infrastructure for growth.

| Task | Priority | Status |
|------|----------|--------|
| Provider analytics dashboard | 🟠 High | ✅ Done (new screen) |
| Amplitude Guides integration | 🟡 Medium | ✅ Done (`guides.ts`) |
| Amplitude Surveys for NPS/CSAT | 🟡 Medium | ✅ Done (`SurveyManager`) |
| Explore feed algorithm improvements | 🟡 Medium | ✅ Done (trending score) |
| Gift card marketplace | 🟡 Medium | ✅ Done (API endpoint) |
| Referral program tracking | 🟡 Medium | ✅ Done (API endpoint) |

### Phase 5: Scale & Optimization ✅ COMPLETE

**Goal:** Prepare for growth.

| Task | Priority | Status |
|------|----------|--------|
| Shared component library (`@beautonomi/ui`) | 🟡 Medium | ✅ Done (6 components, native + web) |
| Dark mode support | 🟡 Medium | ✅ Done (ThemeProvider + tokens) |
| SSR optimization | 🟡 Medium | ✅ Done (cache headers) |
| Database query optimization | 🟡 Medium | ✅ Done (14 indexes) |
| CDN + edge caching | 🟡 Medium | ✅ Done (`vercel.json`) |
| Dependabot for automated updates | 🟡 Medium | ✅ Done (`.github/dependabot.yml`) |
| Load testing infrastructure | 🔵 Low | ✅ Done (k6 script) |

---

## Success Metrics — Current Status

| Phase | Key Metric | Target | Status |
|-------|-----------|--------|--------|
| Phase 0 | Zero critical security vulnerabilities | 0 open criticals | ✅ Achieved |
| Phase 1 | TypeScript strict mode enabled | 100% packages | ✅ Achieved |
| Phase 2 | Booking conversion rate measurable | Funnel visible in Amplitude | ✅ Ready |
| Phase 3 | Provider mobile DAU | Parity with web portal | ✅ Feature-ready |
| Phase 4 | Data-driven product decisions | 3+ decisions based on analytics | ✅ Infrastructure ready |
| Phase 5 | Page load time (web) | <2s on 3G | ✅ Optimized (caching + bundle cleanup) |
