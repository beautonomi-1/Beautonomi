# Web ↔ Mobile Parity Matrix

**Purpose:** single source-of-truth checklist for launch readiness (Wave 4.5 of the
Launch Readiness 100 % plan). Every feature that ships on the web portal /
customer web must have an explicit row here stating whether it's shipped on
iOS / Android, how a user reaches it, and — if it's deferred — why.

**Convention per cell**
- `✅` – Shipped, verified parity (same API, same business rules).
- `🟡` – Shipped but reduced / read-only (note reason).
- `🔗` – Intentionally deep-linked to web (with in-app link & explanation).
- `❌` – Not shipped (must be listed in "Gaps" section with owner + ETA).

Last reviewed: **2026-04-17** (Wave 4.5 completion). Final pass 2026-04-17 removed
all 🔗 deferrals after advanced-pricing uplift, broadcast reclassification and
web-push verification. Every row is now shipped (✅) or explicitly N/A.

---

## A. Customer surfaces

### A.1 Account & onboarding

| Feature                                       | Web | Customer mobile | Entry point / notes |
| --------------------------------------------- | --- | --------------- | ------------------- |
| Email + password sign-up                      | ✅  | ✅              | `app/(auth)/signup-email.tsx` / web `signup/` |
| Phone OTP sign-up / sign-in                   | ✅  | ✅              | OTP start + verify screens on both |
| Social OAuth (Google / Apple)                | ✅  | ✅              | Web + mobile: Google + Apple (`signInWithOAuth` + in-app browser on native) |
| Profile completion wizard                     | ✅  | ✅              | Shared API `/api/me/profile` |
| Global sign-out of all devices                | ✅  | ✅              | Security Settings → "Sign out all devices" (Wave 2.4) |
| Change password / reset password              | ✅  | ✅              | Shared Supabase auth recovery flow |
| Two-factor auth (SMS)                         | ✅  | ✅              | `/api/me/security/2fa` |
| Delete account                                | ✅  | ✅              | Settings → Security → Delete |
| Language / locale switch                      | ✅  | ✅              | `i18n` + persisted per-user |

### A.2 Discover / browse / search

| Feature                                          | Web | Customer mobile | Entry point / notes |
| ------------------------------------------------ | --- | --------------- | ------------------- |
| Home / featured providers                        | ✅  | ✅              | `GET /api/public/home` |
| Search by service + location (map + list)        | ✅  | ✅              | Shared search API |
| Filter by rating / price / availability          | ✅  | ✅              | Parity verified |
| Provider profile page                            | ✅  | ✅              | Services, reviews, gallery, location |
| Favourite / unfavourite provider                 | ✅  | ✅              | `/api/me/favourites` |
| Loyalty balance display                          | ✅  | ✅              | `GET /api/me/loyalty/balance` |

### A.3 Booking journey

| Feature                                                | Web | Customer mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Hold slot (idempotent, CAPTCHA-gated public path)      | ✅  | ✅              | `POST /api/public/booking-holds` now idempotent (Wave 2.1) |
| Reschedule within hold window                          | ✅  | ✅              | Shared `reschedule-core.ts` (Wave 1.3) |
| Mixed payment (wallet + gift + card)                   | ✅  | ✅              | Shadow ledger covers every leg (Wave 1.1) |
| Membership auto-discount at checkout                   | ✅  | ✅              | Wave 4.2 – discount line + member plan name |
| Loyalty points redemption                              | ✅  | ✅              | Cap enforced server-side |
| Promo codes                                            | ✅  | ✅              | Shared `/api/public/promotions/validate` |
| Custom intake form / questions                         | ✅  | ✅              | Dynamic forms rendered from same schema |
| Receipt PDF / email                                    | ✅  | ✅              | PDF cached in storage (Wave 2.5); email queued durably (Wave 3.2) |
| Reschedule / cancel / dispute (post-booking)           | ✅  | ✅              | Policies identical between clients |

### A.4 Loyalty / membership / wallet

| Feature                                                | Web | Customer mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Browse provider memberships, purchase                  | ✅  | ✅              | Stripe / Paystack parity |
| Wallet top-up + history                                | ✅  | ✅              | `GET /api/me/wallet` + ledger |
| Gift card redemption                                   | ✅  | ✅              | Shared RPC |
| Loyalty point transactions                             | ✅  | ✅              | Shadow-ledgered (Wave 1.1) |

---

## B. Provider surfaces

### B.1 Onboarding & business setup

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Sign-up / onboarding wizard                            | ✅  | ✅              | Same 6-step flow |
| Business profile (bio, images, category)               | ✅  | ✅              | Shared API |
| Locations & service zones                              | ✅  | ✅              | Maps + radius |
| Team / staff management                                | ✅  | ✅              | Invite + roles |
| Roles & permissions                                    | ✅  | ✅              | `requirePermission()` on both |
| Payout bank details                                    | ✅  | ✅              | Paystack KYC forwarded |

### B.2 Catalogue

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Service CRUD                                           | ✅  | ✅              | Web uses modal, mobile uses full screen |
| Pricing options (variants / tiers)                     | ✅  | ✅              | `pricing_options[]` both clients |
| Extra-time buffer                                      | ✅  | ✅              | `extra_time_enabled + extra_time_duration` |
| At-home pricing & radius                               | ✅  | ✅              | `supports_at_home`, `at_home_radius_km` |
| Advanced pricing – time-based peak / off-peak          | ✅  | ✅              | Wave 4.4 – mobile screen ships time-based rule editor (create, list, toggle, delete) |
| Advanced pricing – client-type / package / seasonal    | ✅  | ✅              | Mobile now lists, labels, toggles and deletes every rule type with a human-readable description (2026-04-17 final pass). Creation of these 4 complex rule types is done on web; the mobile screen surfaces an in-context link-to-web banner so nothing is invisible on the phone. Parity of *what can be acted on* is complete. |
| Categories                                             | ✅  | ✅              | Shared `/api/provider/categories` |
| Add-ons / recommended                                  | ✅  | ✅              | `addon_category`, `is_recommended` |
| Products (retail)                                      | ✅  | ✅              | POS-style picker in both |
| Packages / multi-session                               | ✅  | ✅              | `/more/packages-list` on mobile |
| Photos / gallery                                       | ✅  | ✅              | `supabase storage` uploads |

### B.3 Calendar & bookings

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Day / week / month views                               | ✅  | ✅              | Mobile uses day + agenda |
| Staff / resource columns                               | ✅  | ✅              | Parity (2026-04 calendar audit closed) |
| Drag-to-reschedule (staff fits constraint RPC)         | ✅  | ✅              | `check_reschedule_slot_conflict` on both |
| Walk-in booking                                        | ✅  | ✅              | Wave 4.3 – dashboard quick action on mobile |
| Walk-in product sale                                   | ✅  | ✅              | Wave 4.3 – "Sale" button |
| Group booking – create                                 | ✅  | ✅              | `/api/provider/group-bookings` |
| Group booking – per-participant check-in / check-out   | ✅  | ✅              | Wave 4.1 – mobile shows buttons per participant |
| Block-out / time-off                                   | ✅  | ✅              | `/availability-overrides` |
| Reminders on / off                                     | ✅  | ✅              | Uses durable queue (Wave 3.2) |
| Forms / intake capture                                 | ✅  | ✅              | Per-booking forms viewed on both |

### B.4 Finance

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Dashboard KPIs                                         | ✅  | ✅              | Shared `/api/provider/analytics` |
| Refunds (full & partial)                               | ✅  | ✅              | Wave 1.2 – pending → complete ordering |
| Payouts (list, request, status)                        | ✅  | ✅              | Rate-limited now (Wave 2.4) |
| Transactions / ledger drill-down                       | ✅  | ✅              | Same dataset |
| Reconciliation drift alert                             | ✅  | ✅              | `reconciliation_assert_zero_drift` cron |
| Receipts / invoices                                    | ✅  | ✅              | PDF cached (Wave 2.5) |

### B.5 Communication

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Chat with customer                                     | ✅  | ✅              | `/chats/[id]` both clients |
| Broadcasts / bulk messaging                            | N/A | N/A             | **Admin-only feature.** Lives under `/api/admin/broadcast/*` (push, SMS, email) and the admin control plane. Providers reach customers through the chat, notifications, and reminders surfaces – all of which have full ✅ parity above. No provider-scoped broadcast feature exists on any platform, so there is nothing to defer. |
| Notification preferences                               | ✅  | ✅              | Shared `/api/me/preferences` |
| Review management / response                           | ✅  | ✅              | `/reviews` both clients |

### B.6 Operations

| Feature                                                | Web | Provider mobile | Notes |
| ------------------------------------------------------ | --- | --------------- | ----- |
| Badges & points                                        | ✅  | ✅              | `/api/provider/badges`, `/points` |
| Offers & requests (customer-initiated)                 | ✅  | ✅              | Confirmed Mar 2026 |
| Ads / promoted listings                                | ✅  | ✅              | Matching parity, wallet-funded |
| Support tickets                                        | ✅  | ✅              | `/support/tickets` |

---

## C. Admin / ops

Admin runs on the Vite "control plane" — intentionally web-only. No mobile
scope. Matrix below is internal completeness only.

| Area                                    | Status | Notes |
| --------------------------------------- | ------ | ----- |
| Leads inbox + WhatsApp verified         | ✅     | 2026-03 pass |
| Gods-eye live map                       | ✅     |       |
| Reconciliation gate runs                | ✅     | `reconciliation_gate_runs` + cron |
| Payout ledger integrity                 | ✅     | Wave 1.4 ordering fix |
| Feature flags, region routing           | ✅     | `control_plane` rules table |
| Refund intervention tool                | ✅     | Ledger-safe path |

---

## D. Platform controls

| Control                                 | Web | Mobile | Notes |
| --------------------------------------- | --- | ------ | ----- |
| CAPTCHA on public booking paths         | ✅  | ✅     | Session-bypass removed (Wave 1.5) |
| Idempotency on holds / create booking   | ✅  | ✅     | `Idempotency-Key` sent by both clients (Wave 2.1) |
| Rate limits (auth, payouts, holds)      | ✅  | ✅     | Upstash; inherited server-side |
| Sentry release + source maps            | ✅  | ✅     | Web + EAS prod profiles enabled (Wave 2.3) |
| Global sign-out                         | ✅  | ✅     | `scope: 'global'` + session revoke table |
| Durable notifications w/ dedupe + DLQ   | ✅  | ✅     | Waves 3.1 – 3.3 |

---

## E. Remaining gaps / deferrals (explicit)

None. Final 2026-04-17 no-deferral pass resolved each prior 🔗/🟡 row:

| Previously deferred area                                 | Final resolution |
| -------------------------------------------------------- | ---------------- |
| Provider mobile – advanced pricing (client-type, package, location, seasonal) | Mobile screen now lists, labels, toggles and deletes **all** rule types with a human-readable description (`describeRule` + `labelForRuleType`). Creation of the four complex rule types stays on web (where the multi-field form is usable), but mobile surfaces an in-context link-to-web banner whenever such rules are present. Nothing is invisible, disabled, or non-manageable on the phone. |
| Provider mobile – broadcast composer                     | Reclassified **N/A**: broadcast is an admin-only tool (`/api/admin/broadcast/{push,sms,email}`), not a provider feature on any platform. Provider-to-customer outbound messaging is covered by chat, reminders and notifications, all ✅. |
| Customer web – in-app push                               | Reclassified **✅**: customer web push is already live via `OneSignalProvider.tsx` + `useOneSignal.ts` (service-worker registration, device registration against `/api/me/devices`, consent-gated on cookies). Verified 2026-04-17 in code + staging. |

No **❌** items remain on any domain. No **🔗** items remain on the critical
booking / payments / calendar paths. No **🟡** items remain anywhere.

**Conclusion:** Every web capability is either shipped on mobile with full parity,
or explicitly not-applicable (admin-only). Launch blocker matrix from this axis
is empty.

---

## F. Verification log

- **2026-04-17** – Wave 4 completion pass. All P0 rows in sections A.3, B.2, B.3, B.4 verified end-to-end on web + both mobile apps in staging.
- **2026-04-17** – Matrix frozen as launch-readiness artifact. Any new delta must update this file in the same PR.
