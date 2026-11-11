# Phase 3 — Feature matrix (provider app → API → DB → third parties) and Phase 4 test plan

Date: 2026-11-09. Read-only. Only this file was written. HEAD unchanged; working tree has pre-existing uncommitted edits (24 files, see `01-inventory.md` §0) — line numbers for `apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx`, `apps/web/src/app/api/provider/bookings/route.ts`, `apps/web/src/app/api/provider/finance/route.ts`, `apps/web/src/app/api/provider/group-bookings/**` refer to the working tree.

## 0. Scope, method, legend

| Item | Detail |
|---|---|
| Screens enumerated | 228 `.tsx` route files under `apps/provider/app/**` (excluding `_layout`/`+` files); 160 make direct API calls (`useApi<T>`, `useApiMutation`, `apiClient.*`, payment hooks); the rest are hubs/navigation or static |
| API surface | 1 636 `route.ts` files under `apps/web/src/app/api/**` |
| Method | 4 parallel static tracers (G1 core/bookings, G2 money, G3 catalogue/growth, G4 settings/team) each: read screen → extract every endpoint → read handler → record auth helper, tables, RPCs, third parties, tests. Auditor spot-verified [SV] items and cross-referenced Phase 2 findings (F2-xx) and live staging catalog facts [DB]. |
| Status legend | **Static-verified** = screen call and handler both read; endpoint exists; auth/tables cited. **Route missing** = screen calls a path with no `route.ts`. **UNVERIFIED** = not read, or behaviour depends on runtime/data. No feature is marked "working" — static verification only; runtime verification is Phase 4. |
| Evidence tags | `[SV]` auditor read source · `[DB]` live staging catalog · `[T:Gn]` tracer n report (on disk, outside repo) |
| Not covered | customer app (`apps/customer`) and admin web UI (`apps/web/src/app/admin/**`) — out of brief scope except where a provider flow depends on them (noted inline) |

## 1. Coverage summary

| Group | Screens | Of which no API call (redirect/hub/static) | Distinct endpoints | Route files | Routes missing | Handlers fully read | Grep-level only | Report |
|---|---|---|---|---|---|---|---|---|
| G1 core tabs, bookings, calendar, messaging, onboarding, auth | 50 | 12 | ~190 | 185 | **0** | 185 | 0 | `p3-G1.md` |
| G2 money (finance, payouts, POS, terminals, billing, subscriptions, payroll, reports) | 65 | 7 | ~150 | ~135 | **0** | ~25 | ~110 | `p3-G2.md` |
| G3 catalogue, products, marketing, growth, locations | 49 | 6 | ~110 | 78 | **0** | 78 (auth + price sections) | 0 | `p3-G3.md` |
| G4 settings, team, account, compliance, support | 67 | 8 | ~150 | 96 | **0** | 30 | 66 | `p3-G4.md` |
| **Total** (screens overlap: `sales.tsx` in G1+G2; `[slug].tsx` dispatcher counted once) | **228** | 33 | ~600 calls → **~490 distinct route files** | | **0** | | | |

Key coverage facts:

- Every endpoint string reachable from the provider app resolves to an existing `route.ts` with the HTTP method the screen uses. No dead endpoints.
- Tests co-located with handlers exist for roughly 1 in 8 of the routes touched (G3: 8/78; G2 money mutations mostly untested — `provider/sales` POST, PayCloud `payments/*`, Paystack-terminal `payments` POST, `pay-runs/[id]/{approve,mark-paid}`, `paystack/verify`, `ads/campaigns`).
- Money entering from the device is server-recomputed for: online booking checkout, provider-created bookings (`provider/bookings/route.ts:1385-1677`), walk-in product sales, Yoco/PayCloud captures (±0.02 match), Paystack-terminal allocation, payouts, refunds, payroll deductions. It is **not** recomputed for POS `POST /api/provider/sales` (F3-06) and ads CPC `budget` (F3-09).
- Legacy/duplicate screens: 13 redirect stubs or 1-line re-exports; two global-search screens; `time-off-types` UI whose server always returns 409 (F3-16).

### 1.1 Third-party touchpoints reached from the provider app

| Third party | Via | Routes (examples) |
|---|---|---|
| Paystack | server SDK/REST | `provider/payouts`, `payout-accounts/*`, `subscription/{initialize-payment,renew,upgrade}`, `invoices/[id]/initialize-payment`, `terminal-orders/[id]/initialize-payment`, `marketing/credits/topup`, `ads/campaigns/[id]/checkout`, `paystack/verify`, Paystack Terminal via overloaded `settings/payments` + `payments` (`paystackTerminalAction`) |
| Stripe | Connect onboarding, transfers | `stripe-connect/onboard`, payout rail resolver |
| Flutterwave | payout accounts/verify | `payout-accounts/*` |
| Yoco | OAuth, devices, payments, webhooks | `yoco/**` |
| PayCloud | terminals, cloud payments, RSA webhooks | `paycloud/**`, `card-machines` |
| Apple | StoreKit 2 / ASN v2 | `iap/{verify,resync,offer-signature}`, ads Apple path |
| Mapbox | geocoding (unauthenticated routes) | `location/validate`, `mapbox/reverse-geocode` |
| Didit | KYC sessions | `verification/status`, `me/verification` |
| LLM (OpenAI / Anthropic / Gemini via Vercel AI SDK) | AI studio | `provider/ai/[feature_key]` |
| Supabase Storage | uploads | `upload`, `gallery`, `explore/upload*`, consent documents |
| Twilio / email vendor (UNVERIFIED which) | integrations + marketing sends | `twilio-integration/*`, `email-integration/*`, `campaigns/[id]/send` |
| Bob Go | shipping | `product-orders/[id]/{book-shipment,shipping-label}` |
| Slack | ops notifications | `referrals`, `terminal-merchant-application/submit` |
| Supabase Auth | login/MFA/password | screens only (no API route) |

## 2. Feature matrix

Full per-screen and per-route tables (every endpoint with screen `path:line`, handler, auth helper, tables, RPCs, third parties, test file, status) are in `audit/appendix/03-matrix-G1-core-bookings.md`, `…G2-money.md`, `…G3-catalogue-growth.md`, `…G4-settings-team.md`. The table below is the condensed feature view; "Static" = screen → route → handler chain read; "Static (grep)" = handler facts extracted mechanically, body not fully read; nothing here is runtime-verified.

| # | Feature | Screens | Key endpoints | Backend (tables / RPC / 3P) | Auth on mutations | Status | Findings |
|---|---|---|---|---|---|---|---|
| 1 | Auth, MFA, password, device trust | `(auth)/*`, `auth/callback`, `security-verify`, `settings-login-and-security`, `settings-two-step` | Supabase Auth client; `POST me/password/changed`, `PATCH me/profile`, `POST auth/consent`, `GET public/third-party-config` | Supabase Auth; `users` | n/a / session | Static | F3-18 (phone change keeps `phone_verified`), F3-19 (`me/password` no current pw when policy off) |
| 2 | Boot/role gate, portal | `index.tsx`, `portal` | `GET me/role`, `GET me/portal`, `GET provider/profile`, `GET provider/setup-status` | `users`, `providers`, `provider_staff` | n/a | Static | — |
| 3 | Onboarding wizard, KYC | `onboarding/*`, `settings/verification` | `GET/POST provider/onboarding/draft`, `POST provider/onboarding`, `POST me/verification`, `GET provider/verification/status`, `POST provider/onboarding/suggest-zones`, invite redeem | `providers`, `provider_locations`, `provider_zone_selections`, `identity_verification_sessions`; Didit; Mapbox | role (`provider_onboarding`) | Static (wizard sub-components not recursively scanned) | — |
| 4 | Staff invite / join | `join.tsx`, `team*`, `team-member/[id]` | `GET staff/join/validate`, `POST staff/join/{accept,set-password}` (token), `GET/POST provider/staff`, `PATCH/DELETE staff/[id]`, `POST staff/[id]/invite`, `reset-password` | `provider_staff`, `users`, Supabase Auth admin | `manage_team`; invite/reset have step-up | Static | **F3-12 High** (POST staff can create `owner`), F3-14 (self-assign `manager` preset), F3-20 (invitee email logged) |
| 5 | Staff permissions & roles | `settings/staff-permissions/*`, `settings/team-roles` | `PATCH staff/[id]/permissions`, `PATCH staff/[id]/settings`, `GET/POST provider/roles`, `PATCH/DELETE roles/[id]` | `provider_staff`, `provider_roles` | permissions route: step-up + unheld-perm check + self-block (PASS); settings/roles: `manage_team` only | Static | **F3-13 High** (`is_admin` via settings), **F3-15 High-if-`role_id`-set** (roles accept arbitrary perms, no unheld check) |
| 6 | Dashboard, activity, search, notifications, announcements | `dashboard`, `activity`, `search`, `notifications*`, `announcements/*` | `GET provider/dashboard`, `activity`, `search`, `reports/{weekly-revenue,top-services}`, `GET/PATCH/DELETE provider/notifications*`, `me/notifications*` | `bookings`, `finance_transactions` (via libs), `notifications` | role | Static (delegated libs not enumerated) | — |
| 7 | Bookings list / calendar / close-out | `more/bookings/index`, `waiting-room`, `time-blocks`, `days-off`, `staff-schedule`, `time-clock`, `routes` | `GET provider/bookings*`, `bookings/stats`, `close-out`, `running-behind`, `time-blocks*`, `availability-blocks`, `shifts*`, `staff/[id]/{shifts,days-off,time-off}`, `time-clock*`, `routes/optimize` | `bookings`, `time_blocks`, `staff_shifts`, `staff_time_cards`, `provider_staff` | mixed: weekly shifts `manage_team`; **dated `shifts*` and `time-clock` clock-in/out role-only** | Static | **F3-10** (payroll input tampering by any staff) |
| 8 | Booking create (provider) | `more/bookings/new`, `express-booking`, `recurring-appointments` | `POST provider/bookings`, `GET bookings/pricing-preview`, `coupons/validate`, `check-availability`, `available-slots`, `POST recurring-appointments`, `express-booking*`, `POST location/validate` | `bookings`, `booking_services`, `promotions`, `membership_plans`; Mapbox | `edit_appointments`; express/booking-link role-only | Static | F2-34 (client membership discount honoured), F3-11 (`location/validate` unauthenticated), F3-04 |
| 9 | Booking detail lifecycle (status, journey, arrival OTP/QR, resources, consent) | `more/bookings/[id]` (6 400 lines) | `PATCH bookings/[id]` (status), `start-service`, `complete-service`, `start-journey`, `eta`, `arrive`, `verify-arrival`, `override-arrival-verification`, `verify-qr`, `resources*`, `consent-document`, `audit-log`, `acknowledge-late`, `contact-attempt` | `bookings`, `booking_status_transition_violations` (shadow guard F2-12), `booking_resources`, storage | `edit_appointments`/`process_payments`; resources/consent role-only | Static; transition validator UNVERIFIED | F2-12, F3-04 |
| 10 | Booking payments & refunds (provider) | `more/bookings/[id]`, `CardMachineCollectSheet`, `BookingPaymentTimeline` | `POST bookings/[id]/mark-paid`, `refund`, `refund-options`, `request-payment`, `send-payment-link`, `additional-charges/[cid]/{mark-paid,notify}`, `GET bookings/[id]/payments`, receipts | `booking_payments`, `booking_refunds`, `additional_charges`, `payment_transactions`, `finance_transactions` (trigger); RPCs `create_booking_payment`, `record_walk_in_additional_charge_payment`, `reserve/void_gift_card_redemption`, `wallet_credit_admin` | `process_payments` / `issue_refunds` (PASS); DB RLS bypass exists (F2-01) | Static; ledger math per Phase 2 | F2-01, F2-06, F2-22, F2-25, F2-57 |
| 11 | Group bookings | `group-bookings` | `GET/POST provider/group-bookings`, `PATCH/POST/DELETE group-bookings/[id]` (`?action=`), `participants*`, check-in/out, receipts, Yoco/PayCloud abandon/close | `group_bookings`, `bookings`, `booking_payments` | `edit_appointments`/`process_payments` (test exists) | Static (auth/tables); **pricing recomputation of client `travel_fee`/`total_price` UNVERIFIED** | → T3 |
| 12 | POS sale (services + products) | `(tabs)/sales`, `more/bookings/[id]` (booking collection) | **`POST provider/sales`**, `PATCH sales/[id]`, `GET sales`, receipts, `POST provider/payments` (Paystack-terminal collection intent) | `sales`, `sale_items`, `sale_payments` or `product_orders` (walk-in path); gift card capture | `create_sales` | Static (read) | **F3-06** (client `subtotal`/`unit_price`/`discount`/`tip`/`payment_status` trusted), F3-17 (collection intent echoes client `expected_amount`) |
| 13 | Walk-in product sale | `walk-in-sale` | `POST provider/product-sales` (server re-prices from `products.retail_price`), `PATCH product-orders/[id]` (refund), terminal sheets | `product_orders`, `product_order_items`, `products` | `create_sales`/`process_payments` | Static (read) | PASS (server-priced); F3-08 (owner-only tax GET → staff sees 0% display) |
| 14 | Card machines (Yoco / PayCloud) | `card-machines`, `settings/yoco-devices`, `CardMachineCollectSheet`, `PayCloudPaymentSheet` | `yoco/{integration,oauth/*,devices*,payments*}`, `paycloud/{terminals*,settings,payments*,reconcile,reconciliation}`, `card-machines` | `provider_yoco_*`, `paycloud_terminals`, `provider_paycloud_payments`; Yoco, PayCloud | payments `process_payments`; **device/terminal/settings writes role-only** | Static (read for payments) | F2-35, F2-36, F2-37, F3-07 |
| 15 | Paystack Terminal | `settings/paystack-terminal`, `paystack-terminal` | overloaded `GET/POST settings/payments?paystackTerminalAction=…`, `GET/POST provider/payments?paystackTerminalAction=…`, deprecated `paystack/terminal-payments/*` | lib `paystack-terminal-provider-mobile-api.ts` (tables UNVERIFIED); Paystack | role-only in lib (`:98`, `:964`) | Static (grep) | F2-60, F3-07, F3-17; overloading a settings route for money actions obscures audit |
| 16 | Finance overview, ledger, transactions, sales history | `finance`, `money`, `transactions*`, `sales-history` | `GET provider/finance`, `transactions`, `transactions/export`, `sales-history*` | `finance_transactions`, `booking_payments`, `payouts`; RPC `provider_finance_summary` | `view_sales|view_reports|process_payments` | Static (grep) | consistent with payout balance (Phase 2 §4) |
| 17 | Payouts & payout accounts | `payouts`, `settings/payout-accounts`, `payment-setup` | `GET/POST provider/payouts`, `payouts/next-date`, `payout-accounts*`, `verify`, `banks`, `stripe-connect/onboard` | `payouts`, `provider_payout_accounts`; RPC `insert_payout_request_guarded`; Paystack/Flutterwave/Stripe | POST payouts `requireOwnerOrEditSettings`; accounts role + inner owner/`edit_settings` (GET/PATCH/DELETE read; POST inner check UNVERIFIED) | Static (read) | F2-09, F2-10, F2-19, F2-20 |
| 18 | VAT reports, tax config | `vat-reports`, `settings/tax-configuration`, `settings/sales-settings` | `GET finance/vat-reports`, `PATCH …/[id]/mark-remitted`, `GET/PATCH settings/sales/taxes` | `finance_transactions`, `vat_remittance_reminders`, `providers` | PATCH `edit_settings`; **GET taxes owner-only** | Static (read) | **F2-24 High** (report always 0), F3-08 |
| 19 | Invoices (platform → provider), billing | `invoices`, `billing*`, `settings/billing*` | `GET provider/invoices*`, `download`, `signed-url`, `initialize-payment`, `export`, `billing-history`, `settings/billing`, `payment-methods/[id]` | `provider_invoices`, `provider_invoice_line_items`, `provider_billing_activity`; Paystack | `manage_finance` / `edit_settings` | Static (grep) | F2-42, F2-43, F2-44 |
| 20 | Subscription & IAP | `subscription`, `settings/subscription*`, `upgrade-info` | `GET subscription`, `plans`, `POST cancel/renew/upgrade/initialize-payment`, `manage-link`, `iap/{verify,resync,offer-signature}`, `public/pricing/plans/[planId]`, `paystack/verify` | `provider_subscriptions`, `subscription_plans`, `provider_subscription_orders`, `apple_iap_transactions`; Paystack/Stripe/Apple | owner-only (PASS) | Static (grep); tests exist | F2-46, F2-47, F2-52 |
| 21 | Payroll | `payroll`, `pay-runs/[id]`, `team-pay`, `team-totals`, `my-earnings`, `settings/team-commissions` | `GET/POST pay-runs`, `pay-runs/[id]` GET/PATCH/DELETE, `approve`, `mark-paid`, `compliance-warnings`, `my-earnings`, `staff/totals`, `staff/[id]/{pay-plans,commission}`, `settings/team/commissions` | `provider_pay_runs`, `provider_pay_run_items`, `staff_earnings_lines`, `staff_pay_plans`, `provider_staff_commission_tiers` | `requireManagePayroll`; `GET pay-runs/[id]` role-only (row scoping in lib UNVERIFIED) | Static (read) | F3-21 (`service_/product_commission_rate` unvalidated; no DB CHECK on `provider_staff` [DB]), F3-10 |
| 22 | Settings: payments, tips, gift cards, receipts, travel fees, online booking, cancellation policies | `settings/payments`, `tip-distribution`, `gift-cards-settings`, `receipt-*`, `travel-fees`, `online-booking`, `cancellation-policies`, `booking-settings`, `settings-appointment-defaults` | `GET/PATCH settings/payments`, `tips/distribution`, `settings/sales/*`, `travel-fees`, `settings/online-booking`, `cancellation-policies*`, `settings/appointments` | `providers`, `provider_online_booking_settings`, `cancellation_policies`, `platform_settings` | mostly `edit_settings`; **`PATCH settings/payments` role-only incl. `provider_onboarding`** | Static | F3-07, F3-22 (cancellation `fee_amount` % unbounded; no DB CHECK [DB]), F3-23 (appointment timing settings unvalidated) |
| 23 | Catalogue: services, categories, add-ons, packages, resources, forms | `catalogue/*`, `service-form`, `services-catalogue`, `packages`, `resources`, `forms`, `settings/service-*` | `provider/services*`, `categories*`, `addons*`, `packages*`, `resources*`, `resource-groups*`, `forms*` | `offerings`, `provider_categories`, `service_packages`, `resources`, `provider_forms` | `edit_services`/`edit_settings`; **packages POST/DELETE role-only (service-role client); add-ons owner-only** | Static | F3-01b (tier prices/`at_home_price_adjustment` stored raw; only `offerings.price >= 0` CHECK [DB]), F3-03 |
| 24 | Products, inventory, suppliers | `products/*`, `product-form`, `inventory`, `suppliers`, `products-*hub`, `settings/product-categories` | `provider/products*`, `metrics`, `stock-movements`, `brands`, `suppliers*`, `product-categories*`, `reports/products/inventory` | `products`, `product_variants`, `stock_movements`, `product_suppliers` | `edit_products` | Static | **F3-01** (`retail_price`/`supply_price` unvalidated; no DB CHECK [DB]) |
| 25 | Product orders, returns, shipping | `product-orders`, `product-returns`, `orders-hub`, `settings/shipping-config` | `product-orders*` (status/refund/mark-collected/book-shipment/label/items), `returns*`, `shipping-config` | `product_orders`, `product_return_requests`, `provider_shipping_config`; Bob Go | refund `process_payments` (server re-clamps); shipping-config role-only | Static (read for refund) | F3-04 |
| 26 | Promotions, memberships, loyalty | `promotions`, `membership-plans`, `membership-subscribers` | `promotions*`, `redemptions`, `membership-plans*`, `membership-subscribers`, `membership-subscriptions/[id]*` | `promotions`, `membership_plans`, `user_memberships` | `manage_marketing` / `edit_settings`; membership-subscription actions role-only | Static | F3-05 (PATCH `value` unbounded), F3-04 |
| 27 | Marketing campaigns & credits, ads | `marketing*`, `settings/ads*` | `campaigns*`, `test-send`, `[id]/send`, `marketing/credits/{estimate,ledger,topup}`, `marketing/status`, `ads/{campaigns*,checkout,packs,performance,budget-orders,orders}` | `marketing_campaigns`, `provider_marketing_credits`, `marketing_credit_ledger` (RPCs `debit_/credit_marketing_credit` service-role [DB]), `ads_*`; Paystack/Apple | list/create `manage_marketing`; **send/test-send/PATCH/DELETE role-only (spend credits)**; ads create/checkout role-only | Static | **F3-02**, F3-09, F3-07 |
| 28 | Reviews, gallery, explore posts, AI studio, gamification, referrals, analytics | `reviews`, `gallery`, `explore-posts`, `ai-studio`, `rewards*`, `gamification`, `refer-a-business`, `analytics`, `engagement-hub` | `reviews*`, `gallery`, `explore/*`, `provider/ai/[feature_key]`, `gamification`, `referrals`, `analytics` | `reviews`, `providers.gallery`, `explore_posts`, `provider_points`, `provider_leads`; Storage; LLM; Slack | `view_/edit_reviews`, `edit_settings`, role | Static | — |
| 29 | Locations, zones, hours, closed periods, blocked time | `locations/*`, `settings/service-zones*`, `settings/hours`, `settings-operating-hours`, `closed-periods`, `blocked-time` | `locations*`, `zone-selections*`, `service-zones/analytics`, hours/closed-periods routes | `provider_locations`, `provider_zone_selections`, `platform_zones` | `edit_settings`; zone-selections role-only | Static | F3-04 |
| 30 | Messaging, custom requests/offers, on-demand | `messaging/*`, `custom-requests/*`, `on-demand/incoming/[id]`, `CustomOfferSheet` | `conversations*`, `messages`, `me/messages/upload`, `custom-requests/[id]/{offers,decline}`, `custom-offers/[id]*`, `on-demand/requests/[id]/{accept,decline}`, `reports/content`, `me/blocks*` | `conversations`, `messages`, `custom_requests`, `custom_offers`, `user_blocks` | `send_messages` on offers; decline/accept/upload role-only | Static | F3-04 |
| 31 | Integrations (Twilio, email, marketing), automations | `settings/twilio-integration`, `email-integration`, `marketing-integrations`, `automations*` | `twilio-integration*`, `email-integration*`, `*/test`, `automations*` | `provider_twilio_integrations`, `provider_email_integrations` (`auth_token`, `api_key` TEXT [DB]), `provider_automations`; Twilio/email vendor | **role-only** | Static | F3-24 (credentials stored as plain TEXT unless app-encrypted — handler writes raw), F3-04 |
| 32 | Account: profile, deactivate, delete, language, notification prefs, safety | `profile`, `settings-*`, `safety/*`, `delete-account-info`, `notification-preferences` | `me/profile`, `me/deactivate`, `me/delete-account`, `me/safety-settings`, `me/safety/panic`, `notification-preferences*` | `users`, `user_profiles`, `user_safety_settings` | session (+ password/nonce re-verify for delete/deactivate — PASS) | Static | F3-18, F3-25 (self-declared DOB lifts age locks) |
| 33 | Support tickets, contact | `support-tickets/*`, `contact-support` | `me/support-tickets*`, attachments | `support_tickets`; AI assistant (UNVERIFIED vendor) | session | Static (grep) | — |
| 34 | Reports | `reports/*` | `reports/{bookings,business/overview,packages,products,revenue,staff,sales/services,gift-cards,payments/*}` | `bookings`, `finance_transactions`, `booking_payments`, `product_orders` | `requireProviderReportsAccess(type)` | Static (grep); catalog-driven `detail/[reportId]` apiPaths not enumerated | — |
| 35 | Terminal shop / merchant application | `terminal-shop`, `terminal-merchant-application`, `terminal-payment-return` | `terminal-products`, `terminal-orders*`, `allocate-from-subscription`, `initialize-payment` (server amount), `terminal-merchant-application*`, `paystack/verify` | `terminal_orders`, `terminal_products`, `terminal_merchant_applications`; Paystack | owner-only writes (PASS) | Static (read for payment) | — |
| 36 | Gift cards | `gift-cards`, `settings/gift-cards-settings`, `reports/gift-cards`, `walk-in-sale` tender | `settings/sales/gift-cards`, `gift-cards/validate`, sale RPCs `*_gift_card_redemption_for_sale` | `gift_cards`, `gift_card_redemptions` | `view_sales`/`edit_settings`; **RPCs anon-executable [DB]** | Static | F2-23, F2-64 |
| 37 | Wallet-related (provider view) | (customer-side; provider sees via refunds/payments) | — | `user_wallets`, `wallet_transactions` | — | n/a | F2-55 |

## 3. Phase 3 findings (F3-xx) and Phase 2 cross-references

Severity scale as Phase 2 (§10 of `02-money-flows.md`). `[SV]` = auditor read the cited source; `[DB]` = staging catalog; `[T:Gn]` = tracer report in `audit/appendix/`.

| ID | Sev | Area | Finding | Evidence |
|---|---|---|---|---|
| F3-12 | **High** | Privilege escalation | `POST /api/provider/staff` (gated by `manage_team` only) maps client `role: "provider_owner"` → `provider_staff.role = "owner"` with no owner-only guard; `role === "owner"` ⇒ `getAllPermissions()`. PATCH has the guard, POST does not; no step-up. A manager can create a full-owner account (payouts, bank accounts, refunds). | `provider/staff/route.ts:365,445-448` [SV]; `lib/auth/permissions.ts:135-137` [SV]; contrast `staff/[id]/route.ts:393-402` [T:G4] |
| F3-13 | **High** | Privilege escalation | `PATCH /api/provider/staff/[id]/settings` schema includes `is_admin`; `manage_team` editors of another staff row pass through with `is_admin` unfiltered (only pay fields filtered) ⇒ `is_admin=true` ⇒ all permissions. | `staff/[id]/settings/route.ts:127,215-250` [SV]; `permissions.ts:135` [SV] |
| F3-15 | High (conditional) | Privilege escalation | `POST/PATCH /api/provider/roles*` accept arbitrary permission maps from `manage_team` holders with no "cannot grant unheld permissions" check and no step-up (unlike `staff/[id]/permissions`). Self-escalation requires `provider_staff.role_id` to be set; no API setter found (UNVERIFIED). | `provider/roles/route.ts:72-84,104-107` [SV partial]; `roles/[id]/route.ts:33-44,87-90` [T:G4] |
| F3-14 | Medium | Privilege escalation | `manage_team` staff can self-assign the `manager` preset via `PATCH /api/provider/staff/[id]` (self-edit restriction only applied to non-managers) ⇒ gains `manage_finance`, `issue_refunds`, `process_payments`. | `staff/[id]/route.ts:320-346,459-462`; `staff-invite-default-permissions.ts:50-55` [T:G4] |
| F3-06 | Medium | Money input | POS `POST /api/provider/sales` trusts client `subtotal` (`subtotal || Σ unit_price×qty`), `unit_price`, `discount_amount`, `tip_amount`, and `payment_status` (`|| "completed"`); only VAT is recomputed. Provider-collected money, so platform cash is not at risk, but sales/VAT/commission-to-staff reporting can be falsified by any `create_sales` user. | `provider/sales/route.ts:563,615-623,683-694` [SV] |
| F3-10 | Medium | Payroll input | Dated shifts `POST/PATCH/DELETE /api/provider/shifts*` and `POST staff/[id]/time-clock/clock-{in,out}`, `POST provider/time-clock` are role-only ⇒ any staff can edit colleagues' shifts or clock them in/out (feeds hourly pay). Weekly schedule sibling correctly requires `manage_team`. | `provider/shifts/route.ts:310`, `shifts/[id]/route.ts:96,200`, `time-clock/clock-in/route.ts:16` [T:G1] |
| F3-02 | Medium | Authz / spend | Campaign `PATCH/DELETE`, `[id]/send`, `test-send` are role-only (staff) while list/create require `manage_marketing`; send and test-send debit paid marketing credits. | `campaigns/[id]/route.ts:53,150`, `[id]/send/route.ts:22-25`, `test-send/route.ts:33-36,77-114` [T:G3] |
| F3-07 | Medium | Authz / money settings | Role-only writes (incl. `provider_staff`, and `provider_onboarding` for settings/payments): `PATCH settings/payments` (accept cash/card/online, VAT, tips, no-show fee), `POST ads/campaigns` + `[id]/checkout` (commits funds), PayCloud terminals/settings, Yoco devices. `GET paycloud/terminals` is stricter than its POST. | `settings/payments/route.ts:38-41,197`; `ads/campaigns/route.ts:270`; `paycloud/terminals/route.ts:25,121` [T:G2] |
| F3-01 | Medium | Price validation | Product `retail_price`/`supply_price`/`markup` accepted via `parseFloat` with no sign/upper bound on POST/PATCH; **no CHECK on `products`/`product_variants`** ⇒ negative/NaN prices persist into orders and inventory valuation. Service tier prices (`pricing_options` JSON), `at_home_price_adjustment`, `tax_rate`, `service_cost_percentage` stored raw; only `offerings.price >= 0` enforced. | `provider/products/route.ts:147,194-195,234-235`, `products/[id]/route.ts:93-94,166-167`, `services/route.ts:270,323-349` [T:G3]; constraints [DB] |
| F3-21 | Medium | Payroll config | `PATCH settings/team/commissions`: `service_commission_rate`/`product_commission_rate` = `Number(x)` with no range/NaN check; **no CHECK on `provider_staff` rates** (tiers are bounded 0–100 in DB). | `settings/team/commissions/route.ts:232-247,273-281` [T:G4]; [DB] |
| F3-24 | Medium | Secrets at rest | Twilio `auth_token` and email `api_key`/`api_secret` written directly to TEXT columns by the handler (masked on read); no encryption call in route; column-level encryption not found. | `twilio-integration/route.ts:162-166`, `email-integration/route.ts:163-167` [T:G4]; column types [DB] |
| F3-03 | Low | Authz consistency | Packages POST/DELETE role-only using a service-role client; PATCH requires `edit_services`. Add-ons and resource-groups owner-only (stricter than permission model; UI exposes to all). | `packages/route.ts:202-214`, `packages/[id]/route.ts:134,266-267`, `addons/route.ts:117` [T:G3] |
| F3-04 | Low | Authz consistency | Role-only mutations where siblings use permissions: zone `travel_fee`, shipping fees, booking-link, express-booking, membership-subscription cancel/extend/win-back, booking resources/consent-document, waitlist notify, custom-request decline, custom-offers upload, on-demand accept/decline, automations, customer-visibility, Twilio/email test sends, routes/optimize. | lines in `appendix/03-matrix-G1/G3/G4` findings 5–8 |
| F3-05 | Low | Price validation | Promotion PATCH only NaN-checks `value` (POST bounds 0–100 / >0); DB CHECK `value > 0` only ⇒ 500 % discount settable by direct API while `usage_count = 0`. | `promotions/[id]/route.ts:172-181` [T:G3]; `010_platform.sql:21`; [DB] |
| F3-08 | Low (functional) | Authz inconsistency | `GET settings/sales/{taxes,tips,receipt}` are owner-only while PATCH is `edit_settings` ⇒ staff with edit rights 403 on screen load; `walk-in-sale` silently falls back to 0 % tax display (server recomputes). | `settings/sales/taxes/route.ts:24,72`; `walk-in-sale.tsx:382-385` [T:G2] |
| F3-09 | Low | Money input | Ads CPC `budget` device-supplied → `ads_budget_orders.amount` → Paystack charge, with only `budget <= 0` skip (no floor/ceiling). Pack models are server-priced. | `ads/campaigns/route.ts:311,358,397,416` [T:G2] |
| F3-11 | Low (cost/abuse) | Unauthenticated routes | `POST /api/location/validate` (admin client, Mapbox geocode, travel-fee compute) and `POST /api/mapbox/reverse-geocode` (rate-limit only) have no auth; `GET provider/reference-data` auth-less but RLS "Anyone can read" [DB]. | `location/validate/route.ts:40`, `mapbox/reverse-geocode/route.ts:24` [T:G1] |
| F3-16 | Low (dead UI) | Product | `settings/time-off-types` create/edit/delete always receive `409 NOT_SUPPORTED`. | `time-off-types/route.ts:97-101`, `[id]/route.ts:50-52,78-80` [T:G4] |
| F3-17 | Low | Money display | Paystack-terminal `collection_intent` echoes client `expected_amount` without deriving from the entity; later `allocate` caps to paid/owed. | `paystack-terminal-provider-mobile-api.ts:482,485,547-552,640` [T:G2] |
| F3-18 | Low | Identity | `PATCH /api/me/profile` writes `phone` without resetting `phone_verified` (mobile verifies via OTP first, API does not enforce). | `me/profile/route.ts:387,449-454` [T:G4] |
| F3-19 | Low | Auth | `/api/me/password` allows password change without current password when `policy.require_current_password` is false (customers; providers get step-up). | `me/password/route.ts:46-52,102-123` [T:G4] |
| F3-20 | Low | POPIA | Invitee email and user ids logged in `POST /api/provider/staff`; invite `join_url` (token) returned in error body on delivery failure. | `staff/route.ts:481,512,594,672`; `staff/[id]/invite/route.ts:165-175` [T:G4] |
| F3-22 | Low | Validation | Cancellation policy `fee_amount` with `fee_type: "percentage"` has no `max(100)`; `hours_before` unbounded; no DB CHECK on `fee_amount` [DB]. | `cancellation-policies/route.ts:13-16` [T:G4] |
| F3-23 | Low | Validation | `PATCH settings/appointments` writes `confirmationSlaHours`, expiry/grace minutes unvalidated (drives auto-expiry/no-show). | `settings/appointments/route.ts:89-126` [T:G4] |
| F3-25 | Low (compliance) | Age assurance | Self-declared DOB (≥13 only) lifts age locks when `legal_date_of_birth` absent. | `me/profile/route.ts:396-400`; `age-band.ts:71-78` [T:G4] |
| F3-26 | Low | Ops | `verifyCronRequest` compares the bearer secret with `!==` (not timing-safe); all 84 cron routes use it. | `lib/cron-auth.ts:23` [SV] |
| F3-27 | Low | Test coverage | ~1 in 8 provider routes has a co-located test; none for `provider/sales` POST, PayCloud `payments/*`, Paystack-terminal allocate, `pay-runs/[id]/{approve,mark-paid}`, `paystack/verify`, `ads/campaigns`, `shifts*`, `time-clock*`, staff creation role mapping. | appendix "Test file?" columns |

Phase 2 findings re-encountered from the UI side and carried: F2-01, F2-06, F2-09/10, F2-12, F2-19/20, F2-22/23/24/25, F2-34/35/36/37, F2-42–44, F2-46/47, F2-52, F2-55, F2-57, F2-60, F2-64.

Positive controls verified in this phase (for balance): `getProviderIdForUser` hint fails closed; `staff/[id]/permissions` has step-up + unheld-perm check + self-block + owner protection; last-owner demotion/removal guarded; delete/deactivate re-verify password; online-booking deposit bounded 0–100; `product-sales`, `product-orders` refund, payouts, pay-run deductions all re-derive amounts server-side; terminal-order and invoice payments take amounts from DB rows.

## 4. UNVERIFIED (Phase 3)

| Item | Why | Resolve in |
|---|---|---|
| Runtime behaviour of every feature | static only; no UI, API or DB execution in Phases 1–3 | Phase 4 |
| ~176 route handlers in G2/G4 read at grep level only (auth/tables/zod lines extracted, body not read) | time; money-critical handlers were prioritised for full reads | Phase 4 for those under test; otherwise remains static |
| `POST provider/group-bookings` / `participants` recomputation of client `travel_fee`, `subtotal`, `total_price` | handler pricing section not read | T3 |
| Booking status transition validator (server side) for client-sent `status` | not read; DB guard is shadow-mode (F2-12) | T1.12 |
| Whether anything sets `provider_staff.role_id` (makes F3-15 directly exploitable) | no API setter found; server actions/other paths not exhaustively searched | Phase 4 grep + T2 probe |
| `POST provider/payout-accounts` inner owner/`edit_settings` check | only GET/PATCH/DELETE blocks read | Phase 4 |
| `lib/payroll/payroll-access` row scoping for `GET pay-runs/[id]`, `my-earnings` | lib not read | Phase 4 |
| `GET /api/paystack/verify` (`optionalAuthInApi`, writes 9 order tables) — gateway re-verification before writes | body not read | T3 |
| Tables written by `paystack-terminal-provider-mobile-api.ts`, `record-product-order-payment.ts`, `pay-run-engine.ts`, `create-terminal-order.ts`, `ads-budget-order-payment.ts` | libs grepped for `.rpc(` only | Phase 4 |
| Marketing send vendor (`dispatch-campaign`, `unified-service`), win-back notification channel, support-ticket AI vendor | not traced | Phase 3 scope limit |
| Onboarding wizard sub-component endpoints; `reportCatalog` apiPath list for `reports/detail/[reportId]` | not recursively scanned | Phase 4 if needed |
| Column-level encryption for Twilio/email credentials (F3-24) | migrations not read; columns are TEXT [DB] | Phase 4 read |
| DB triggers resetting `phone_verified` (F3-18) | not searched | Phase 4 |
| Receipt download token TTL/secret handling | `lib/receipts/receipt-download-token` not read | Phase 4 |
| `requireStepUp` enforcement semantics | assumed recent 2FA/password challenge; not read | Phase 4 |
| Tests in `provider/__tests__/*` and `reports/__tests__/*signoff*` that may cover routes marked "no test" | not opened | Phase 4 |
| Customer app and admin web UI | out of brief scope | — |

## 5. Proposed Phase 4 test plan

### 5.1 Environment (requires approval before Phase 4 starts)

| Option | What | Why / constraints |
|---|---|---|
| **A (recommended)** | Local Supabase: `supabase start` (CLI 2.121.0 and Docker 29.5.2 are installed; Docker daemon state UNVERIFIED) applies all 1 077 migrations to a disposable Postgres (`supabase/config.toml` db port 54322) | Full triggers/RPCs/RLS/grants; synthetic data only; destructive tests allowed; no shared state. Zero production or staging risk. |
| B (fallback, needs explicit approval) | Staging project `byfz****` via service-role PostgREST | Shared environment; currently 0 money rows; writes would leave synthetic rows. Only if local Supabase cannot start. |
| Gateways | **None live.** Webhook tests sign payloads with a test secret injected via env (`PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET` set to throw-away values in the test process); no outbound gateway calls (SDK clients mocked or `fetch` stubbed). | Rule 2 |
| Mobile | `apps/provider` Jest suites only; **never** launch the app with `apps/provider/.env.local` (points at production — F2-17). Device E2E is out of scope unless a simulator and a staging env file are provided. | |
| Guardrail | Every Phase 4 script starts with an env assertion: Supabase URL must match `127.0.0.1:5432x` or the staging ref; aborts otherwise. No `.env*` value is printed. | Rules 2–3 |

### 5.2 Test tiers and cases

Each case records: ID → finding, setup, steps, expected (from contract docs `docs/PAYMENT_ACCOUNTING_CONTRACT.md`, `docs/FINANCE_PRODUCT_DECISIONS.md` or arithmetic), observed, verdict, evidence (command + output file). Fail-first: a case that reproduces a finding is written to **fail** on current code; it is the acceptance test for any later fix (Phase 5).

**T1 — DB triggers / RPCs (SQL against local DB)**

| Case | Finding | Scenario | Expected |
|---|---|---|---|
| T1.1 | F2-06 | booking 333.33 (15% commission, R15 fee, 15% VAT), refund 100.00 then 233.33 | Σ reversals per component = original rows; provider_earnings reversal = 235.29 (observed in Phase 2 emulation: 251.11 → FAIL) |
| T1.2 | F2-06 | same with 3 refunds (111.11 ×3) | same |
| T1.3 | F2-22 | refund 400.00 on 333.33 fully paid | expected: rejected; observed (static): WARNING only, inserted |
| T1.4 | F2-14 | `booking_source='provider'` cash payment with platform fee > 0 | expected: `platform_fee` row absent / earnings not reduced (1027 intent); observed: depends on live body |
| T1.5 | F2-07 | tip 100.00 split across 3 staff with equal prices | Σ allocations = 100.00 |
| T1.6 | F2-07 | second tip on same booking | allocated |
| T1.7 | F2-53 | first tip → `staff_earnings_lines(kind='tip')` created in same transaction | rows present |
| T1.8 | F2-05 | 169 known divergent partial amounts | TS `commission_base` = trigger `commission_base` |
| T1.9 | F2-51 / F2-54 | DELETE completed refund; UPDATE completed→cancelled | ledger reversals removed; booking totals consistent |
| T1.10 | §5 UNVERIFIED | cancellation with fee F on paid booking: provider total = ? | provider keeps exactly one of {fee, residual earnings} per policy doc |
| T1.11 | F2-13 | insert booking whose total matches formula B but not A | expected: rejected or flagged |
| T1.12 | F2-12 | `completed → pending` status update | expected: blocked; observed: shadow-logged |
| T1.13 | F2-31 | force a ledger-trigger error (e.g. unmapped type) on `booking_payments` insert | expected: payment rejected or exception row + alert; observed: payment commits, ledger missing |
| T1.14 | GL | after T1.1–T1.13 run `ledger_reconciliation_summary` + `reconciliation_assert_zero_drift` | zero drift (diagnostic of which cases leave the GL unbalanced) |

**T2 — RLS / grant probes (PostgREST with synthetic `anon` and `authenticated` JWTs from the local instance)**

| Case | Finding | Probe | Expected |
|---|---|---|---|
| T2.1 | F2-01 | staff JWT: `INSERT booking_refunds` for own provider's booking; `UPDATE amount`; `DELETE` | 403/0 rows |
| T2.2 | F2-02 | customer JWT: `PATCH additional_charges SET amount=0.01, status='paid'` | denied |
| T2.3 | F2-23 | customer B JWT: `rpc reserve_gift_card_redemption(code_of_A, 1, booking_of_C)` | denied |
| T2.4 | F2-61 | anon JWT: `rpc post_gateway_fee_delta(ft_id, 999, 'probe')` | denied |
| T2.5 | F2-63 | anon: `rpc recognize_period_revenue(tenant, …)` | denied |
| T2.6 | F2-64 | anon: `rpc void_gift_card_redemption_for_sale(sale_id)` after reserve | denied; balance unchanged |
| T2.7 | F2-65 | anon: `rpc brand_reset_tenant_data(tenant)` on a synthetic tenant | denied |
| T2.8 | F2-66 | anon: `rpc revoke_all_user_sessions(uid)` | denied |
| T2.9 | F2-11 | anon: `rpc log_finance_ledger_trigger_failure(...)` | denied |
| T2.10 | baseline | customer JWT reads another customer's `booking_payments`/`wallet_transactions` | 0 rows |

**T3 — API route tests (Vitest, Next route handlers; Supabase pointed at local DB or mocked where the finding is pure handler logic)**

| Case | Finding | Steps | Expected |
|---|---|---|---|
| T3.1 | F2-16 | `charge.failed` then `charge.success` for same reference on a booking | second event ignored or auto-refund triggered; booking stays cancelled |
| T3.2 | F2-08 | cancel booking, then signed `charge.success` | not marked paid / refund queued |
| T3.3 | F2-24 | seed `tax` + `refund(tax)` rows; GET `/api/provider/finance/vat-reports?year=` through real PostgREST | `vat_collected` ≠ 0 (currently 0) |
| T3.4 | F2-30 | Flutterwave webhook without `verif-hash` under `NODE_ENV=test`; duplicate event without `data.id` | 401; second rejected as duplicate |
| T3.5 | F2-33 | Paystack `refund.processed` for amount > remaining | capped/rejected |
| T3.6 | F2-21 | Flutterwave `transfer.failed` after completed payout | payout ledger reversed; balance restored |
| T3.7 | F2-37 | PayCloud webhook with invalid RSA signature | non-200 |
| T3.8 | F2-62 | `GET /api/admin/settings` with no `platform_settings` row and env secrets set to sentinel values | response contains no sentinel |
| T3.9 | F2-25 | `POST request-payment` with `amount: 1e12` and `0.001` | 400 |
| T3.10 | F2-19 | `POST /api/provider/payouts` with `amount: "abc"` | 400 not 500 |
| T3.11 | F2-57 | provider refund route: wallet credit succeeds, finalize throws | refund row `completed` or wallet credit rolled back |
| T3.12 | F2-34 | provider-create booking with client `membership_discount_amount: 9999` | server value used |
| T3.13 | F2-35 | Yoco create with bare `entity_type/entity_id` of another provider | 403/404 |
| T3.14 | F2-47 | Paystack `invoice.update` handler throws | 500 (retryable) |
| T3.15 | F3-12 | staff JWT with `manage_team` only: `POST /api/provider/staff {role:"provider_owner"}` | 403; no `owner` row created |
| T3.16 | F3-13 | same JWT: `PATCH staff/[other]/settings {is_admin:true}` | 403 or field stripped |
| T3.17 | F3-14 / F3-15 | same JWT: `PATCH staff/[self] {job:"manager"}`; `POST roles {permissions: all true}` | rejected / unheld perms stripped |
| T3.18 | F3-06 | `create_sales` JWT: `POST /api/provider/sales` with `unit_price: 0.01` for a R500 service and `payment_status:"completed"` | server re-prices or rejects |
| T3.19 | F3-10 | staff JWT without `manage_team`: `POST shifts` for colleague; `POST staff/[other]/time-clock/clock-in` | 403 |
| T3.20 | F3-01 | `edit_products` JWT: `POST products {retail_price:-5}` | 400 |
| T3.21 | F3-02 | staff JWT without `manage_marketing`: `POST campaigns/test-send` | 403; no credit debit |
| T3.22 | F3-07 | staff JWT without `edit_settings`: `PATCH settings/payments {noShowFeeAmount: 9999}` | 403 |
| T3.23 | §4 UNVERIFIED | `POST group-bookings` with client `travel_fee: 0`, `total_price: 1` for priced services | server recomputed values stored |
| T3.24 | §4 UNVERIFIED | `GET /api/paystack/verify?reference=<unknown>` unauthenticated with mocked gateway returning success | no order-table writes without gateway confirmation |

**T4 — Concurrency (local DB)**

| Case | Finding | Steps | Expected |
|---|---|---|---|
| T4.1 | F2-03 | two parallel Stripe `payment_intent.succeeded` for same intent | one `booking_payments` row; `total_paid` once |
| T4.2 | payout | two parallel `POST /api/provider/payouts` for full balance | one accepted (RPC lock) |
| T4.3 | F2-55 | two parallel checkout requests debiting wallet for same booking | one debit |
| T4.4 | gift card | two parallel reserves on one card | balance never negative |

**T5 — Arithmetic property tests (Node + local PG as oracle)**

| Case | Finding | Steps |
|---|---|---|
| T5.1 | §2.1 | 100 000 random amounts: `Math.round(x*100)/100` vs PG `ROUND(x::numeric,2)`; `roundCurrency`; `percentOf` |
| T5.2 | F2-38 | enumerate 0.01…10 000.00 at 15%: `computeVat` vs `vat-inclusive-breakdown` divergence count |
| T5.3 | §2.4 | `splitMoneyProportionally` Σ = total for 1e5 random splits |
| T5.4 | F2-05 | full 33 333-amount sweep TS vs trigger (already done on staging; re-run locally as regression) |

**T6 — Mobile (static + unit)**

| Case | Steps |
|---|---|
| T6.1 | run `apps/provider` Jest suites (not executed in Phase 1) |
| T6.2 | assert every device-computed money value in §2 is recomputed server-side (table from G2) |
| T6.3 | `apps/provider/.env.local` points at production — confirm app cannot be started by Phase 4 scripts |

**T7 — Reconciliation**

| Case | Steps |
|---|---|
| T7.1 | run `scripts/prod/audit-finance-ledger.mjs` checks against the local seeded DB |
| T7.2 | `ledger_reconciliation_summary`, `gl_currency_drift_exceptions`, integrity RPCs (`list_integrity_*`) after all T1–T4 scenarios; every exception explained or logged as a finding |

### 5.3 Deliverable and gates

`audit/04-test-results.md`: per case — command, output file path (under `%TEMP%\beautonomi-audit\p4\`), verdict, evidence. Any test file written for Phase 4 lives outside the repo. No fixes in Phase 4. Phase 5 fixes only on named findings, one at a time, fail-then-pass.

### 5.4 Approval needed from you

1. Environment: Option A (local Supabase via Docker) — may I start it? (It downloads Supabase images; no production or staging contact.)
2. If Docker cannot run: approve Option B (synthetic writes to staging) or skip T1/T2/T4.
3. Read-only production catalog query (grants + `platform_settings.payouts`) to close §11 of Phase 2 — yes/no.
