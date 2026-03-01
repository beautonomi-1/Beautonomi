# Beautonomi vs Fresha — Platform Completeness Audit

> **Date:** 2026-02-25  
> **Scope:** Full platform audit of Beautonomi compared to Fresha (beauty/wellness booking & salon software).  
> **Sources:** Existing [AUDIT_REPORT.md](./AUDIT_REPORT.md), [API_SURFACE.md](./audit/API_SURFACE.md), [DATA_MODEL.md](./audit/DATA_MODEL.md), provider README, Express Booking doc, and web research on Fresha.

---

## 1. Executive Summary

**Fresha** is the world’s largest beauty and wellness booking platform (140,000+ businesses, 120+ countries), offering an all-in-one product: **marketplace + salon software + payments + marketing**. Beautonomi is a comparable beauty & wellness platform with a **Next.js web app** (customer, provider, admin), **two Expo mobile apps** (customer, provider), and **~646 API routes** on **80+ tables**.

### High-level comparison

| Dimension | Fresha | Beautonomi |
|-----------|--------|------------|
| **Marketplace** | Yes — discovery, search, profiles, reviews | Yes — home, search, provider profiles, reviews, explore feed |
| **Online booking** | 24/7, Google/Instagram integration | Yes — express flow at `/book/[slug]`, hold → consume, availability API |
| **Payments** | Fresha Payments, Tap to Pay, card terminals, in-store | Paystack (online), Yoco (in-person/terminals), wallet, gift cards |
| **Staff & scheduling** | Shifts, team pay, commissions, time clock | Yes — staff CRUD, shifts, time clock, commissions, days off |
| **Waitlist** | Yes — manual/auto, priority options | Yes — waitlist entries, quick-book, notify, matches |
| **Group bookings** | Yes — multi-client, group management | Yes — group booking settings, participants, check-in/out |
| **Loyalty & memberships** | Memberships, perks, flexible billing | Yes — loyalty points, redeem, milestones; membership plans, subscribe/cancel |
| **Marketing** | Email blasts, reminders, smart pricing, AI descriptions | Campaigns, automations, custom offers, AI (Gemini) profile/content |
| **Reports** | Fresha Insights, performance reports | 30+ report types, provider analytics dashboard, staff/clients/revenue |
| **POS / in-person** | Card terminals, Tap to Pay, till, drafts, refunds | Yoco integration, mark-paid, additional charges, refunds |
| **Cancellation policy** | Late cancellation fees, deposit/card capture | Yes — cutoff hours, late_cancel/no_show, no/partial/full refund |
| **Recurring** | Recurring appointments | Yes — recurring appointments, cron process-recurring-bookings |
| **Calendar sync** | — | Google, Outlook, iCal (app→calendar; optional bidirectional) |
| **AI** | AI receptionist (bookings/FAQs), AI venue descriptions | Gemini: profile completion, content studio; no AI receptionist |
| **Mobile apps** | Consumer app; business app | Customer + Provider Expo apps (i18n, reports, parity) |
| **International** | 120+ countries | 4 languages (en, zu, af, st), multi-currency, ZAR-focused |

**Summary:** Beautonomi is **feature-complete** for core booking, payments, staff, waitlist, group bookings, loyalty, memberships, cancellation policies, POS-style flows (Yoco), and reporting. Main **gaps vs Fresha** are: no dedicated **AI receptionist**, no **Google/Instagram direct booking** integration, and no **Tap to Pay** (Yoco covers in-person, not Tap to Pay). **Strengths** include multi-app (web + 2 mobile), full provider mobile parity, 4-language i18n, and rich reporting/automations.

---

## 2. Fresha feature baseline (reference)

Used as comparison reference (from public help centre and product pages).

### 2.1 Booking & scheduling

- 24/7 online booking; integration with Google and Instagram for booking from those surfaces.
- Waitlist: manual (“you pick”) or automatic; priority (first in line, highest value, or offer to all); online waitlist within business hours.
- Group appointments: multiple clients and services in one booking; group existing appointments; manage individuals within group.
- Calendar views and flexible service time settings.
- Cancellation: clients can cancel online until business-set deadline; after that, contact business. Late cancellation fees with deposit/card capture policies.

### 2.2 Payments

- All-in-one payments: multiple methods, American Express, Tap to Pay on iPhone.
- In-store: save sales as drafts, upfront payments, refunds from till.

### 2.3 Staff & operations

- Staff management: shifts, workspace profiles, onboarding.
- Team Pay: commissions, wages, tips, attendance, clock-in/out.

### 2.4 Loyalty & memberships

- Memberships with perks, discounts, exclusive benefits.
- Flexible billing (e.g. first month free).

### 2.5 Marketing & growth

- Email blast campaigns.
- Automated reminders and notifications.
- Smart (dynamic) pricing by booking time.
- Marketplace profile to attract new clients.
- AI-powered venue descriptions.

### 2.6 Reporting & product

- Fresha Insights: reporting and operations insights.
- Daily/weekly/monthly performance reports (e.g. by email).
- Booth rental charge management; client loyalty; shared cancellation fees across team.

### 2.7 Communication

- Two-way messaging (SMS, email, WhatsApp in one place).
- AI receptionist for bookings and FAQs outside hours.

---

## 3. Beautonomi feature inventory

### 3.1 Customer-facing (marketplace & booking)

| Feature | Implementation |
|---------|----------------|
| Home & discovery | `GET /api/public/home`, search, categories, explore feed |
| Provider profile | `GET /api/public/providers/[slug]`, locations, services, staff, reviews |
| Availability | `GET /api/public/providers/[slug]/availability` (slots by date, service, staff, location) |
| Booking hold | `POST /api/public/booking-holds` (e.g. 7-min hold), rate-limited |
| Checkout | `POST /api/public/booking-holds/[id]/consume` (create booking + payment) |
| Online booking settings | Min notice, max advance days, staff selection mode, pay in person, tip suggestions |
| Cancellation policy | `GET /api/public/cancellation-policy` — hours cutoff, late_cancellation_type (no/partial/full refund) |
| My bookings | `GET /api/me/bookings`, cancel, reschedule, pay-additional |
| Group bookings (customer) | Group participants, reschedule group booking |
| Waitlist (customer) | `GET/DELETE /api/me/waitlist` |
| Reviews | Submit review, view own reviews |
| Loyalty | `GET /api/me/loyalty`, `POST /api/me/loyalty/redeem`, points, milestones |
| Membership | `GET /api/me/membership`, subscribe, cancel; purchase memberships |
| Gift cards | Purchase, validate, redeem; marketplace |
| Referrals | Track, attach; loyalty rewards |
| Wallet | Balance, top-up, use for bookings |
| Messaging | Conversations, messages (Supabase Realtime) |
| Custom offers | Accept custom offers from providers |
| Wishlists | Wishlists, wishlist items |

### 3.2 Provider-facing (business management)

| Area | Features |
|------|----------|
| **Dashboard** | Stats, today’s bookings, revenue, reviews, occupancy, no-show rate, real-time updates |
| **Calendar** | Calendar view, booking management, status updates |
| **Bookings** | Full lifecycle: create, view, cancel, refund, mark-paid, receipt, additional charges, QR verify, journey tracking, bulk actions |
| **Group bookings** | Group booking settings, participants, check-in/check-out |
| **Clients** | Client list, profile, history, create client |
| **Catalogue** | Services (CRUD, variants, addons), products (inventory), categories, brands, suppliers |
| **Staff** | CRUD, permissions, roles, commission, days-off, time clock (clock-in/out), pay-runs, shifts |
| **Locations** | CRUD, primary, travel/at-home, service zones |
| **Finance** | Transactions, VAT reports, invoices (generate, send, pay, download), payouts, subscriptions, tax rate, tips |
| **Payments** | Paystack (online), Yoco (terminals, devices, in-person payments), payment methods, mark-paid |
| **Waitlist** | Entries, notify, quick-book, matches; settings |
| **Waiting room** | Day-of check-in, waiting room entries, count |
| **Messaging** | Conversations, messages, mark-read |
| **Reviews** | View, respond, moderate |
| **Marketing** | Campaigns (create, send), automations (triggers, execute), custom offers, ads (campaigns, performance), explore posts |
| **Reports** | 30+ types: revenue, bookings (status, cancellations, summary), clients (LTV), staff, schedule, products (sales, top), gift cards, business comparison, etc. |
| **Settings** | Appointments (incl. group appointments, online booking), billing, business, hours, payments (Yoco), sales (taxes, upselling), team (commissions, roles), travel, waitlist |
| **Forms** | Provider forms (CRUD, fields) for intake |
| **Custom fields** | Booking/custom field definitions |
| **Recurring** | Recurring appointments, cron to process recurring bookings |
| **AI** | Gemini: profile completion, content studio (subscription-gated, budget) |
| **Verification** | Sumsub (KYC), onboarding |
| **Calendar sync** | Google, Outlook, iCal (push to calendar; optional bidirectional) |

### 3.3 Admin (superadmin)

| Area | Capabilities |
|------|--------------|
| Dashboard & monitoring | Dashboard, system health, errors, gods-eye |
| Users & providers | CRUD, impersonation, verify provider, bulk, overrides |
| Bookings | List, cancel, refund, dispute (create, resolve) |
| Finance | Transactions, payouts (approve, reject, initiate transfer, mark paid/failed), refunds, fees, platform fees |
| Content | Pages, FAQs, footer, profile questions, preference options, resources |
| Templates | Email, SMS, push notification templates |
| Feature flags | CRUD, behaviour |
| Loyalty & gamification | Rules, milestones, badges, point rules, backfill, recalculate per provider |
| Memberships & gift cards | Memberships CRUD, gift cards, metrics |
| Promotions | Promotions CRUD, redemptions |
| Control plane | Modules (AI templates, entitlements, usage), ranking, on-demand, ads packs |
| Integrations | Amplitude, Mapbox, webhooks (endpoints, failures, retry) |
| Support | Support tickets, messages, notes |
| Catalog | Global categories, services, categories |
| Referrals | Referrals, FAQs |
| Export | Transactions, providers |

### 3.4 Platform & technical

- **Auth:** Supabase Auth; roles (customer, provider_owner, provider_staff, superadmin); RLS on core tables; financial routes and Paystack/notification routes secured (per AUDIT_REPORT).
- **Payments:** Paystack (online, subscriptions, transfers), Yoco (in-person), wallet, gift cards, refunds (wallet credit model per REFUNDS_AND_DISPUTES.md).
- **Cron:** Reminders, process-recurring-bookings, low-stock, expire booking holds, execute automations.
- **i18n:** 4 languages (en, zu, af, st) across web and mobile.
- **Mobile:** Customer and Provider Expo apps with parity targets (see mobile-parity docs).

---

## 4. Comparison matrix: Fresha vs Beautonomi

| Feature | Fresha | Beautonomi | Notes |
|---------|--------|------------|-------|
| **Discovery & search** | ✅ | ✅ | Home, search, categories, filters |
| **Provider profiles** | ✅ | ✅ | Slug, services, staff, reviews, locations |
| **24/7 online booking** | ✅ | ✅ | Express flow, hold, consume |
| **Book from Google/Instagram** | ✅ | ❌ | No direct “book on Google” / Instagram integration |
| **Availability / slots** | ✅ | ✅ | Date, service, staff, location, min notice, max advance |
| **Booking hold** | — | ✅ | 7-min hold, rate limit |
| **Waitlist** | ✅ | ✅ | Entries, notify, quick-book, matches, settings |
| **Group appointments** | ✅ | ✅ | Group settings, participants, check-in/out |
| **Cancellation policy** | ✅ | ✅ | Cutoff hours, late cancel, no/partial/full refund |
| **Cancellation / no-show fees** | ✅ | ✅ | no_show_fee, cancellation_fee, late_cancel handling |
| **Online payments** | ✅ | ✅ | Paystack |
| **In-person / POS** | ✅ (Tap to Pay, terminals) | ✅ (Yoco) | No Tap to Pay on iPhone in Beautonomi |
| **Refunds** | ✅ | ✅ | Wallet credit model; admin refunds |
| **Deposit / card capture** | ✅ | — | Not explicitly modelled as “deposit only” flow |
| **Staff management** | ✅ | ✅ | Staff, roles, permissions |
| **Shifts & scheduling** | ✅ | ✅ | Shifts, days off, time blocks |
| **Time clock** | ✅ | ✅ | Clock-in/out, time cards |
| **Commissions / team pay** | ✅ | ✅ | Commissions, pay-runs |
| **Recurring appointments** | — | ✅ | Recurring appointments + cron |
| **Calendar sync** | — | ✅ | Google, Outlook, iCal |
| **Loyalty program** | ✅ | ✅ | Points, redeem, milestones |
| **Memberships** | ✅ | ✅ | Plans, subscribe, cancel, purchase |
| **Gift cards** | — | ✅ | Purchase, validate, redeem, marketplace |
| **Referrals** | — | ✅ | Track, attach, loyalty rewards |
| **Email/SMS marketing** | ✅ | ✅ | Campaigns, automations, reminders |
| **Smart / dynamic pricing** | ✅ | ⚠️ | Advanced pricing (time/client/seasonal) in provider catalogue; not “smart pricing” product |
| **AI venue descriptions** | ✅ | ⚠️ | AI profile completion (Gemini); not dedicated “venue description” |
| **AI receptionist** | ✅ | ❌ | No after-hours AI booking/FAQ bot |
| **Two-way messaging** | ✅ | ✅ | Conversations, messages (in-app; WhatsApp link possible) |
| **Reports & analytics** | ✅ | ✅ | 30+ reports, provider analytics dashboard |
| **Performance reports (email)** | ✅ | ⚠️ | Reports exist; scheduled email delivery not confirmed |
| **Marketplace visibility** | ✅ | ✅ | Explore, ranking, profile |
| **Mobile apps (consumer)** | ✅ | ✅ | Customer Expo app |
| **Mobile apps (business)** | ✅ | ✅ | Provider Expo app (full management) |
| **Multi-language** | ✅ | ✅ | 4 languages (en, zu, af, st) |
| **VAT / tax** | — | ✅ | VAT reports, remit, tax settings |
| **Forms / intake** | — | ✅ | Provider forms, custom fields |
| **Custom offers** | — | ✅ | Create, accept custom offers |
| **Route optimization** | — | ✅ | Routes optimize (e.g. for at-home) |

**Legend:** ✅ Present; ⚠️ Partial or different shape; ❌ Not present.

---

## 5. Gaps (Beautonomi vs Fresha)

1. **AI receptionist** — Fresha offers an AI receptionist for bookings and FAQs outside hours. Beautonomi has no equivalent (Gemini is used for profile/content, not conversational booking).
2. **Google / Instagram booking** — Fresha integrates booking from Google and Instagram. Beautonomi has no direct “book on Google” or Instagram booking integration.
3. **Tap to Pay** — Fresha supports Tap to Pay on iPhone; Beautonomi uses Yoco for in-person payments but does not list Tap to Pay.
4. **Deposit / card capture as product** — Fresha’s cancellation fees tie to “deposit or card capture” policies. Beautonomi has cancellation/no-show fees and payment methods but no explicit “deposit only” or “card capture only” product flow.
5. **Scheduled performance reports** — Fresha sends daily/weekly/monthly reports by email; Beautonomi has rich reports but scheduled email delivery is not confirmed in this audit.
6. **Booth rental charges** — Fresha has booth rental charge management; not present as a dedicated feature in Beautonomi.

---

## 6. Strengths (Beautonomi vs Fresha)

1. **Full triple surface** — Web (customer + provider + admin) plus two native mobile apps with documented parity and i18n.
2. **Provider mobile parity** — Provider can run the business from mobile (dashboard, calendar, bookings, staff, inventory, reports, settings, automations).
3. **Reporting depth** — 30+ report types and provider analytics dashboard (revenue, bookings, clients, staff, products, etc.).
4. **Express booking flow** — Well-defined flow (venue → category → services → addons → staff → schedule → intake → review) with API-driven content (EXPRESS_BOOKING.md).
5. **Recurring appointments** — Recurring templates and cron to create bookings.
6. **Calendar sync** — Google, Outlook, iCal with configurable direction.
7. **Gift cards & referrals** — Gift card marketplace and referral tracking with loyalty.
8. **Provider AI (Gemini)** — Profile completion and content studio with entitlements and budget controls.
9. **Refund model** — Consistent wallet-credit refund model and dispute resolution.
10. **Localisation** — Four languages and ZAR/multi-currency support for target markets.

---

## 7. Recommendations

1. **Product**
   - Consider an **AI receptionist** (after-hours booking/FAQ) if competing on “always-on” booking.
   - Evaluate **Google/Instagram** booking integrations for acquisition.
   - If targeting in-person-only salons, consider **Tap to Pay** (e.g. via Yoco or another provider).
   - Document or implement **scheduled report emails** if providers expect daily/weekly/monthly digests.

2. **Documentation & ops**
   - Keep this comparison updated when Fresha launches new features or when Beautonomi adds AI receptionist, deposit-only flows, or booth rental.
   - Reuse [AUDIT_REPORT.md](./AUDIT_REPORT.md) and [audit/API_SURFACE.md](./audit/API_SURFACE.md) for technical depth and security.

3. **Existing audits**
   - Security and stability items (Paystack/auth, RLS, refactors, CI, tests) are already covered in AUDIT_REPORT and roadmap; no change to prior priorities.

---

## 8. References

- [AUDIT_REPORT.md](./AUDIT_REPORT.md) — Full platform audit (architecture, routes, API, data, auth, analytics, risks, roadmap).
- [audit/API_SURFACE.md](./audit/API_SURFACE.md) — API route inventory and auth.
- [audit/DATA_MODEL.md](./audit/DATA_MODEL.md) — Database tables and relationships.
- [EXPRESS_BOOKING.md](./EXPRESS_BOOKING.md) — Public booking flow and data sources.
- [REFUNDS_AND_DISPUTES.md](./REFUNDS_AND_DISPUTES.md) — Refund and dispute behaviour.
- [CALENDAR_INTEGRATION.md](./CALENDAR_INTEGRATION.md) — Provider and customer calendar.
- [AI_GEMINI_PROVIDER.md](./AI_GEMINI_PROVIDER.md) — Provider AI (Gemini) architecture.
- Fresha: [fresha.com](https://www.fresha.com), [Help Centre](https://www.fresha.com/help-center), product/blog pages (2024–2025).
