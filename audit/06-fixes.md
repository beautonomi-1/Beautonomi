# Audit remediations (local / staging only)

Never applied to production. No commit/push. Evidence is a command, test file, or path+line.

## Status

| ID | Surface | Status | Evidence |
|---|---|---|---|
| F4-02 | DB + web + app | **Fixed** | `10138` `insert_payout_request_guarded` casts `payout_status`; POST `/api/provider/payouts` maps `INVALID_STATUS` → 400; mobile `getApiErrorMessage` shows the API message. Tests: `10_security_hardening.test.sql`, `route.post-rpc.test.ts` |
| F4-03 | DB | **Fixed** | Unique index excludes refund rows. `10_security_hardening.test.sql` |
| F2-01, F2-02, F2-23, F4-05, F2-22 | DB | **Fixed** | RLS/REVOKE + refund amount hard-fail. `10_security_hardening.test.sql` (23 assertions) |
| F2-06, F2-14, F2-31, F2-07, F2-51, F2-54, F2-12, F4-07 | DB | **Fixed** | `10139`. Fail-closed ledger (`P0001`); ratio refunds net to 0. `20_ledger_integrity.test.sql` (27 assertions) |
| F2-44, F2-49, F2-45, F2-40, F2-55, F2-43, F2-18 | DB + web | **Fixed** | `10140`. Invoice freeze, period locks, reversal currency, `wallet_debit_self` idempotency, `next_document_number`. `30_controls_and_hygiene.test.sql` (17 assertions). Web callers pass `p_idempotency_key`; invoices/payouts use `nextDocumentNumber` |
| F-03, F4-01 | CI | **Fixed** | Fresh replay of **1112/1112** migrations (14 retried, then 0 fail) on `public.ecr.aws/supabase/postgres:17.6.1.127`, including `10138`–`10172`. Audit SQL on that database: 6 files, 93 assertions, all PASS. Job: `.github/workflows/ci.yml` `db-tests`. Runner: `pnpm test:db` / `supabase/tests/audit/run.mjs` |
| F-01 | Docs + CI | **Redacted** | Literal test key removed from `docs/audits/COMPREHENSIVE_TECHNICAL_AUDIT_2026-04.md:890`. CI `secret-scan` already runs `gitleaks/gitleaks-action` with `.gitleaks.toml`. **Still required:** rotate the Paystack test key (git history retains the old value). Do not print it. |
| F-02 | Web | **Fixed** | Browser client no longer falls back to `placeholder.supabase.co`. Production throws; other envs return `null`. `client-config.test.ts` 3/3 |
| F2-24 | Web + app | **Fixed** (web) | VAT report selects `transaction_type`. Same API used by the provider app finance screen |
| F2-31 (API) | Web + app | **Fixed** | `mapMoneySqlError` → `LEDGER_POSTING_FAILED` 409; `handleApiError` + refund insert use it; mobile replaces raw SQL text. Tests: `map-money-sql-error.test.ts`, `api-error.test.ts` |
| F3-08 | Web + app | **Fixed** | GET `/api/provider/settings/sales/{taxes,tips,receipt}` allows `provider_staff` (PATCH still `edit_settings`) so staff walk-in/VAT screens load |
| F3-16 | Web + app | **Fixed** | Time-off types are a read-only list of labels from `staff_time_off`. Create/edit/delete removed from web + mobile; POST/PATCH/DELETE stay 409 `NOT_SUPPORTED` |
| F3-18 | Web + app | **Fixed** | PATCH `/api/me/profile` clears `phone_verified` when the number changes. `phone-verified-reset.test.ts` |
| F2-17 | Config | **Report only** | `apps/provider/.env.local` and `apps/customer/.env.local` still point at production. Not edited (live env). Point them at staging locally |
| F3-12 / F3-13 / F3-14 / F3-15 | Web | **Fixed** | POST staff owner-role is owner-only; PATCH settings `is_admin` owner-only; staff cannot self-assign a higher role; roles POST/PATCH ceiling = caller's permissions (`role-permission-ceiling.ts`). `route.patch-self-role.test.ts` |
| F4-04 | Web + app | **Fixed** | Group booking participant prices recomputed server-side (`resolveGroupParticipantServerPrices`) |
| F2-08 / F2-16 | Web | **Fixed** | Late `charge.success` on cancelled/no_show/declined auto-refunds (`charge-success.ts`) |
| F2-21 | Web | **Fixed** | Flutterwave `transfer.failed` reverses payout ledger (`flutterwave-transfer-webhook.ts`) |
| F2-30 | Web | **Fixed** | Flutterwave signature required in every env; `timingSafeEqual`. `flutterwave-webhook-verify.test.ts` |
| F2-20 / F2-48 | Web | **Fixed** | Dual-control payout approve/transfer; manual adjustment cap + propose. Helper tests 29/29 with F2-62/F2-69 |
| F2-62 | Web | **Fixed** | Admin settings GET masks env Paystack secrets as `***`. `route.get-secrets.test.ts` |
| F2-69 | Web | **Fixed** | `redactGatewayPayload` before persisting webhook bodies |
| Authz (campaigns, shifts, terminals, staff) | Web + app | **Fixed** | Permission gates on provider API; mobile hides ads without `manage_marketing`, team without `can_manage_team`, terminals without `edit_settings`; marketing 403 uses `FinanceReportError` |
| F2-10 | Web + app | **Fixed** | `DEFAULT_PROVIDER_PROTECTION_POLICY.step_up = "enforce"`; payout-account writes call `requireStepUp`. `provider-security.test.ts` |
| F3-05 | Web | **Fixed** | Promotion POST/PATCH share `promotionValueError` (percentage 0–100, fixed ≤ 100000). `provider-promotion-api.test.ts` |
| F2-58 | Web + app | **Fixed** | PayCloud refund requires `issue_refunds` (same as booking refunds / mobile `canIssueRefunds`) and `clientMajorAmountSchema` |
| F2-67 | Web | **Fixed** | Admin booking refund gated by `ADMIN_SECTION_FINANCE`; amount uses `clientMajorAmountSchema` |
| F2-70 | Web + app | **Fixed** | Idempotency lookup after auth; mismatch → 409 `IDEMPOTENCY_KEY_CONFLICT` (unique is endpoint+key). Mobile maps the code. `idempotency.test.ts` |
| F3-26 | Web | **Fixed** | Cron bearer compare hashes then `timingSafeEqual`. `cron-auth.test.ts` |
| F3-09 | Web + app | **Fixed** | CPC budget 0 (draft) or 10–100000 with ≤2 dp. Same API for the ads screen. `client-amount-bounds.test.ts` |
| F3-01 | Web + app | **Fixed** | Product POST/PATCH/variants bound 0–1_000_000; tax 0–100. `price-bounds.test.ts` |
| F2-71 | Web + app | **Fixed** | `me/memberships/purchase` uses `requireRoleInApi` (Bearer + cookie) |
| F3-21 | Web | **Fixed** | Commission rates and pay-plan tier `commission_rate` reject outside 0–100 before write. `upsert-schema.test.ts`, `add-staff-schema.test.ts` |
| F3-22 | Web | **Fixed** | `hours_before` max 8760; percentage `fee_amount` max 100. `cancellation-policy-bounds.test.ts` |
| Ads 403 UX | App | **Fixed** | Ads `loadAll` shows the FORBIDDEN sentence instead of a generic load error |
| F2-09 | Web + app | **Fixed** | Payout-account create/update/delete call `writeAuditLog` (no full account number) |
| F2-19 | Web + app | **Fixed** | Payout `INVALID_AMOUNT` maps to 400 via `mapMoneySqlError` / payouts POST |
| F2-25 / F-07 | Web + app | **Fixed** | `request-payment` uses `clientMajorAmountSchema`; same cap on admin/provider refunds and wallet bank-refunds |
| F2-15 / F2-27 / F2-28 | Web | **Fixed** | Dispute amounts use gateway units (no `n≥1000` guess); `provider_id` from booking; provider notified. `dispute-amount-units-and-provider.test.ts` |
| F2-37 / F-06 (PayCloud) | Web | **Fixed** | PayCloud webhook verifies signature first (401 on invalid), then shared lease RPC |
| F2-50 | Web | **Fixed** | Period-lock check fails closed on query/transport errors |
| F2-52 | Web + app | **Fixed** | Apple JWS verification cannot be disabled in production |
| F3-02 / F3-07 / F3-10 | Web + app | **Fixed** | Marketing send/PATCH `manage_marketing`; payment settings `edit_settings`; time-clock colleague edits `manage_team` |
| F3-19 | Web + app | **Fixed** | `require_current_password` defaults **true** (admin, public policy, mobile config bundles) |
| F3-23 | Web + app | **Fixed** | Appointment SLA/expiry/grace integers bounded. `appointment-settings-bounds.test.ts` |
| F3-11 | Web + app | **Fixed** | `/api/location/validate` uses the Mapbox rate limiter (guests still allowed, tighter IP cap) |
| F2-34 | Web | **Fixed** | Provider-create booking membership discount is server-computed; client amount cannot override |
| F2-68 | Web | **Fixed** | `writeAuditLog` on integrity-repair, terminal payment PATCH, invoice payment refund, admin payout-account POST, platform-fees PATCH |
| F2-72 | Web | **Fixed** | Paystack transfers/splits/recipients go through `requireAdminSection(FINANCE)` (MFA/session-age). `require-paystack-payout-admin.test.ts` |
| F3-20 | Web | **Fixed** | Staff invite no longer logs invitee email; 502 invite errors no longer include `join_url` / token |
| F2-03 | DB | **Fixed** | Unique index `booking_payments_stripe_flw_provider_tx_uidx` in `10138` |
| F2-33 | Web | **Fixed** | Paystack / Stripe / Flutterwave refund webhooks cap to remaining balance (`capGatewayRefundToRemainingBalance`) |
| F2-35 | Web | **Fixed** | Yoco create normalises bare `entity_type`/`entity_id` through ownership + amount guards. `route.test.ts` |
| F2-26 | Web | **Fixed** | Flutterwave refund webhook + remaining-balance cap. `flutterwave-refund-webhook.test.ts` |
| F2-39 | Web + app | **Fixed** | VAT snapshot on public, provider, hold, series, waitlist, group, custom-offer, waiting-room walk-in, and product-order/walk-in POS create. `10143` writes the snapshot on RPC insert. `resolve-provider-vat.test.ts`, `waitlist-booking-financials.test.ts`, `finalize-custom-offer-payment.test.ts` |
| F2-42 | Web | **Fixed** | `generateProviderInvoice` builds lines from ledger rows |
| F2-53 | DB | **Fixed** | Tip-allocation trigger renamed `aab_create_tip_allocations_on_tip` in `10139` so it fires before staff lines |
| F2-57 | Web | **Fixed** | Wallet refund credit is reverted if finalize fails (`revertWalletRefundCreditAfterFinalizeFailure`) |
| F3-06 | Web + app | **Fixed** | POS `POST /api/provider/sales` recomputes prices/totals server-side. `route.post-server-totals.test.ts` |
| F-06 (Flutterwave / Yoco) | Web | **Fixed** | Shared `try_acquire_webhook_event_lease` on Flutterwave + Yoco (PayCloud already). `yoco-webhook-event-id.test.ts` |
| F2-32 | DB | **Fixed** | `10141` `finance_audit_run` named-query allow-list. `40_finance_audit_allowlist.test.sql` |
| F2-59 | Web + app | **Fixed** | Yoco mark-paid / walk-in collect must match a successful `provider_yoco_payments` row. `assert-yoco-mark-paid-reference.test.ts` |
| F2-60 | Web | **Fixed** | Terminal add-on settlement uses `commissionMode: "provider_collected"` (0 platform commission), same as base booking allocation |
| F3-17 | Web + app | **Fixed** | Terminal collection intent derives remaining due; client `expected_amount` is only a hint without an entity. `resolve-terminal-expected-amount.test.ts` |
| F3-03 | Web + app | **Fixed** | Packages POST/PATCH/DELETE `requirePermission("edit_services")`. `packages/__tests__/permission-gate.test.ts` |
| F3-04 | Web + app | **Fixed** | Remaining G1 mutations already gated (`edit_settings` / `edit_appointments` / `send_messages` / `manage_team`). Shifts POST uses `canActOnStaffTimeRecords` (own shift or `manage_team`) |
| F2-38 | Web | **Fixed** | `computeVatInclusiveBreakdown` is a thin adapter over canonical `computeVat`. `vat-inclusive-breakdown.test.ts` |
| F2-41 | Web | **Fixed** | Subscription receipts use stored `metadata.vat_*` snapshot; only legacy rows recompute. `subscription-receipt-vat.test.ts` |
| F2-47 | Web | **Fixed** | Paystack webhook returns 500 on retryable `subscription.*` / `invoice.*` unless `isPermanentWebhookError` |
| F3-25 | Web + app | **Fixed** | Self-declared DOB cannot lift 18+ locks (`ageBandForLocks`). Verified KYC still can. `age-band.test.ts`, `require-social-access.test.ts` |
| F3-24 | Web | **Fixed** | Twilio `auth_token` and email `api_key`/`api_secret` encrypted at rest (`enc.v1.` + AES-256-GCM). Legacy plaintext still readable. `integration-secrets.test.ts` |
| F2-61 / F2-63 / F2-64 / F2-65 / F2-66 / F2-11 / F2-56 | DB | **Fixed** | `10138` revokes `anon`/`authenticated` EXECUTE on those SECURITY DEFINER functions (incl. `_shadow_replay*`, `log_finance_ledger_trigger_failure`, `recognize_gift_card_breakage`). `10_security_hardening.test.sql` |
| F4-06 | Web + app | **Fixed** | Write + display money uses shared helpers. Leftover nested display outstanding / membership-loyalty / checkout gift coverage / charge remaining after wallet-gift / net-after-fee tender remaining / tip-base collect outstanding / ledger collected-split / create-subtotal fee-net receipt-reconstruct / package-discount cancel-preview takings delivery / remaining-refundable at-home mark-paid PayCloud void / app remaining-refundable ads-net travel-fee preview / PAYE annualize ARR trial plan-price / marketplace MRR contribution weekly salary-slice / gift-card sales FX display / payouts net-of-refunds at-home price custom-offer subtotal / gateway-fee Stripe cents receipt-cache admin MRR / no-show collected product-return remaining product-sales line revenue / persisted booking total custom-offer commission-base / provider-create total recurring series Apple settlement proceeds / outstanding coverage payroll net-pay PayCloud deposit-due admin this-month sales-history net / team-totals rollups ledger-health deferred-recognized / tip-cashback extras LTV median staff revenue share taxable accum / report allocated-revenue ledger accumulators / recognized MRR recorded-takings wallet-gift channel-revenue / payroll deduction-total parseMoney rounding / payout-balance geo booking-value accumulators / inventory category stock-value accumulators / extra-charge persist total held wallet+gift / ledger aggregate admin finance fees+commission / ads brand-marketing spend accumulators / brand strategy envelope campaign allocated budget / scorecard measured money / gift-card daily cap wallet credit payment-method totals / unpaid-card refund totals provider refund coverage / recorded-takings wallet mark-paid total front-desk paid / gateway-fee anomaly total provider ads budget remaining / ads auction remaining attributed spend / subscription MRR bridge marketing credit balance / fee variance collected net PayCloud charge total / group price sums receipt card paid deposit remaining / ads period spend payout commission client total spent / unit price report averages / ARPU average booking value / client ledger averages / lifetime-value averages / revenue growth deltas / report revenue maps / refund-cap rails / signed amounts / report averages use `addMoney`/`subtractMoney`/`multiplyMoney`/`sumMoney`. Ratings / health-check % remain local |
| F-04 | Web + app | **Fixed** | Local `roundMoney`/`round2` wrappers on money surfaces now call `roundCurrency` |
| F-05 | Web + DB | **Fixed** | `yocoStoredAmountToMajor` / `fromMinorUnits`. `10144` COMMENT ON COLUMN (BIGINT cents). Column not renamed |
| F-09 | Web + app | **Fixed** | Coverage floors + property sample; Maestro **assertion** login smokes (`pnpm e2e:maestro:provider-login` / `customer-login`). Device still required to run the YAML; not in CI. Provider `jest-setup.js` left unwired (jest-native `extend-expect` hangs jest-expo) |
| F3-27 | Web | **Fixed** | PayCloud payments 403 + source contract; terminal allocate FEATURE_DISABLED; pay-runs approve/mark-paid 403/400; staff owner-role mapping contract. Sales POST already covered |
| F2-04 | DB | **Fixed** | Yoco `provider_yoco_webhook_events_webhook_id_uidx` in `10138`; PayCloud `paycloud_webhook_events_order_event_uidx` in `10142`. `50_booking_total_paycloud_entitlement.test.sql` |
| F2-05 | Web | **Fixed** | `resolveCommissionBaseForBookingPayment` uses `multiplyMoney` / `subtractMoney`. `resolve-commission-base-for-booking-payment.test.ts` |
| F2-13 | DB + web + app | **Fixed** | `validate_booking_total` one formula (`10142`). `create_booking_with_locking` persists `tax_inclusive`/`tax_rate`/VAT snapshot/`platform_fee_*`/`loyalty_discount_amount` on insert (`10143`) so exclusive-VAT public, provider, hold, series, and waitlist RPC creates pass the trigger. `51_create_booking_rpc_tax_inclusive.test.sql` 8/8 |
| F2-29 | DB | **Fixed** | Unique index `booking_refunds_refund_provider_id_uidx` in `10138` |
| F2-36 | Web + app | **Fixed** | Yoco webhook already uses `fromMinorUnits`; create-payment `amount_cents` now too. `yoco-payments-client-reference.test.ts` |
| F2-46 | DB | **Fixed** | `get_provider_subscription_tier` / `provider_has_feature_access` wrap `get_provider_subscription_plan` (10101 grace). `10142` |
| Remaining | mixed | **Open** | Human: rotate Paystack test key (F-01); point mobile `.env.local` at staging (F2-17). No production apply |

## Replay evidence (F4-01 / F-03)

Command (throwaway container `beautonomi-audit-replay`, never a hosted URL):

```
== prelude (auth/storage stubs for the bare image)
== applying 1112 migrations in numeric order
   ok=1098 fail=14
== retry pass 1 (14 migrations whose dependencies carry a higher prefix)
   ok=14 fail=0
== all 1112 migrations applied
```

The 14 that failed on the first pass and applied on the retry include `10147_product_orders_realtime_omit_contact.sql` and `10148_product_order_contact_column_select.sql`. After apply, `portal_tokens` has one policy: `Providers can view tokens for their bookings`.

Audit SQL on that same container (`node supabase/tests/audit/run.mjs --docker beautonomi-audit-replay`):

```
PASS  10_security_hardening.test.sql  (23 assertions)
PASS  20_ledger_integrity.test.sql  (30 assertions)
PASS  30_controls_and_hygiene.test.sql  (17 assertions)
PASS  40_finance_audit_allowlist.test.sql  (5 assertions)
PASS  50_booking_total_paycloud_entitlement.test.sql  (10 assertions)
PASS  51_create_booking_rpc_tax_inclusive.test.sql  (8 assertions)
All 6 audit test files passed.
```

Earlier replay, before `10138`–`10172` existed: 1080/1080 (12 retried). Audit SQL then was 3 files, 67 assertions.

Local audit DB after `10143` (`node supabase/tests/audit/run.mjs --docker beautonomi-audit-db`):

```
PASS  10_security_hardening.test.sql  (23 assertions)
PASS  20_ledger_integrity.test.sql    (27 assertions)
PASS  30_controls_and_hygiene.test.sql (17 assertions)
PASS  40_finance_audit_allowlist.test.sql  (5 assertions)
PASS  50_booking_total_paycloud_entitlement.test.sql  (10 assertions)
PASS  51_create_booking_rpc_tax_inclusive.test.sql  (8 assertions)
All 6 audit test files passed.
```

CI job `db-tests` uses the same image tag and `supabase/tests/audit/ci/apply-migrations.sh` (prelude as `supabase_admin`, then numeric apply + 3 retry passes).

## Web / app contract (same error codes on both)

| HTTP | `error.code` | When |
|---|---|---|
| 400 | `INVALID_STATUS` | Payout RPC rejected a non-`pending` insert |
| 400 | `OVER_REFUND` | `validate_refund_amount` CHECK |
| 400 | `VALIDATION_ERROR` | Product/commission CHECKs |
| 409 | `LEDGER_POSTING_FAILED` | Payment insert rolled back (F2-31 fail-closed). Gateways retry; provider/app show "retry" |
| 409 | `PERIOD_LOCKED` | Financial period lock |
| 403 | `FORBIDDEN` | Missing permission (campaigns, shifts, terminals, settings) |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Idempotency key already used by another user |

Mobile `getApiErrorMessage` maps those codes (and raw SQL text) to the same sentences the web toast already gets from the API body.

## Not done here

- Rotate Paystack test key (F-01 remainder). Human, dashboard.
- Point mobile `.env.local` at staging (F2-17). Human.
- Web Vitest re-run after migrations `10145`–`10172`: 5361/5361 (1159 files), plus account-status 5/5. Provider Jest 553/553. Customer Jest 413/413. An earlier customer run under parallel load timed out one legal-gate test; that file passed alone (5/5) and the full customer suite then passed 413/413. Earlier remaining package tests (`turbo run test` excluding web, provider, customer): 27/27 tasks, including GRC SQL harness 109/109. Device E2E YAML is not executed here (no emulator).
- Local `20_ledger_integrity.test.sql` on `beautonomi-audit-db` (rolled back): T4.1 duplicate Paystack `payment_provider_id` rejected, 1 row; T1.10 retained components = 50.00 on a 333.33 sale with 283.33 refunded. `settle-booking-cancellation.ts` no longer posts a second `cancellation_fee` for that retain. `settle-booking-cancellation.test.ts` 21/21.
- T3.3–T3.14, T3.18, T3.19, T3.22–T3.24 re-run against the current handlers: 21 files, 100 tests, all passed (`04-test-results.md` §4). Campaign `manage_marketing` gate (F3-02): 4/4.
- F3-21: pay-plan tier `commission_rate` is 0–100 in `payPlanUpsertSchema` (previously an untyped record). Staff create schema rejects 150 and -1. `upsert-schema.test.ts` + `add-staff-schema.test.ts` + `integration-secrets.test.ts` (F3-24): 13/13.
- T4.2 / T4.3 on `beautonomi-audit-db`: parallel payouts for the full 500 ceiling leave 1 row (`INSUFFICIENT_BALANCE` on the second). Parallel 200 + 200 refunds on a 333.33 payment leave 1 row. `10145` locks the booking in `validate_refund_amount`. `10_security_hardening.test.sql` re-run after that: ALL PASS. Fixture rows deleted.
- Customer and provider apps replace a raw `Refund amount validation failed` body with the same OVER_REFUND sentence when the API code is set. Customer also maps `INSUFFICIENT_BALANCE` and `INVALID_AMOUNT`. Provider maps `PAYOUT_HELD`. Web `getUserFacingMessage` keeps a safe API sentence and replaces raw SQL for those money codes. `formatApiErrorMessage` uses that helper, including the payout request toast and wallet bank-refund toasts. The shared fetcher stores the sanitized sentence on `FetchError`, so booking refund, mark-paid, and other toasts that print `err.message` no longer show raw SQL. `user-messages.test.ts`, web `api-error.test.ts`, portal `error-handler.test.ts`, and `fetcher-html-routing.test.ts`: 13/13. Customer `api-error.test.ts` 15/15. Provider `api-error.test.ts` 12/12.
- Both mobile apps share `@beautonomi/api` `extractErrorFromPayload`. That parser now runs `publicApiErrorMessage` before the error reaches `Alert.alert`, so a raw refund SQL body becomes “Refund exceeds the amount collected.” when the code is `OVER_REFUND`, and a safe sentence is left unchanged. `public-api-error.test.ts`: 3/3.
- Customer and provider `getApiErrorMessage` also drop a raw SQL string or a codeless SQL `message` (calendar and other callers that pass the body text directly). A normal sentence is unchanged. Customer `api-error.test.ts` 17/17. Provider `api-error.test.ts` 14/14.
- `GET /api/provider/pay-runs/[id]` already limited line items to the caller without `manage_payroll`. Salon `total_gross_pay` / `total_net_pay` / tax / UIF on that response are now nulled for that caller, so the app sums only their lines. Payroll managers still receive the stored totals. `get-own-items.test.ts` 2/2.
- Staff commission reads no longer return every colleague’s salary and rates. `GET /api/provider/staff/[id]/commission` is self, owner, `manage_payroll`, or `manage_team`. `GET /api/provider/settings/team/commissions` is the caller’s own row unless they have `manage_payroll` or `manage_team`. `manage-payroll-gate.test.ts` and `read-scope.test.ts`: 6/6.
- `GET /api/provider/staff/[id]/settings` and `GET /api/provider/staff/[id]` hide salary, hourly rate, commission, and the time-clock PIN unless the viewer is that person, the owner, or has `manage_payroll` / `manage_team`. Name and role stay. `get-pay-redaction.test.ts` 2/2.
- `GET /api/provider/staff` clears `commission_rate` on other people the same way. `GET /api/provider/staff/onboarding-checklist` is not found for another staff member unless the viewer may see pay. The response still does not include the PIN. `provider-team-roster-access.test.ts` and `read-scope.test.ts` with the settings redaction test: 6/6.
- `POST` / `PATCH` / `GET /api/provider/staff/[id]/time-clock` and `GET .../time-clock/[timeCardId]` now use the same rule as the alternate clock-in route: own records, or `manage_team` / owner. A colleague can no longer clock someone else in or read their hours. `route.manage-team-gate.test.ts` 6/6.
- `GET /api/provider/time-clock` returns only the caller’s cards unless they are the owner or have `manage_team`. The list no longer selects staff email. PIN clock-in is unchanged. `get-own-cards.test.ts` and `post.contract.test.ts`: 7/7.
- `GET /api/provider/analytics` now requires `view_reports` (owner and superadmin still pass). A staff member without that permission gets 403 instead of salon revenue, earnings, and expenses. `reports-access.test.ts` 2/2.
- `GET /api/provider/dashboard` still loads for every staff member so appointment counts stay available. Salon revenue, payout balance, earnings, and period takings are zeroed unless the viewer is the owner, a superadmin, or has `view_reports`, `view_sales`, or `process_payments`. The shared cache still stores the full payload and the redaction is applied on the way out. `redact-dashboard-salon-money.test.ts` 1/1.
- Ad campaign list, campaign updates, ad spend, and abandoning a budget order now require `manage_marketing`. A staff member without it gets 403 before campaign budgets are read or a pending checkout is reversed. Owners and superadmins still pass inside `requirePermission`. Creating and checking out a campaign already required that permission. `route.patch.test.ts` and `marketing-gate.test.ts`: 6/6.
- Marketing credit balance, ledger, send estimate, status (which includes the balance), and credit top-up now require `manage_marketing`. A staff member without it gets 403 before the salon balance is read or a Paystack top-up is started. `credits-gate.test.ts` 5/5.
- Twilio settings, the live Twilio account balance, and email integration settings now require `manage_marketing` or `edit_settings`. A staff member without either gets 403 before the integration row is loaded or Twilio is called. Saving those integrations stays owner-only. `read-gate.test.ts` 3/3.
- Paystack virtual terminals, the terminal payment inbox, setup and asset requests, and “check for new payments” now require `process_payments`. That covers the web routes and the mobile fallbacks on `/api/provider/payments` and `/api/provider/settings/payments`. A staff member without it gets 403 before terminals are listed or Paystack is called. Allocating a payment already required that permission. `process-payments-gate.test.ts` 6/6.
- Yoco device lists (including takings), a single Yoco device, Yoco account status, PayCloud settings, and terminal-integration merchant rows now require `process_payments` or `edit_settings`. PayCloud reconciliation and a single PayCloud payment (which can pull a live status) require `process_payments` or `view_sales`. A staff member without those permissions gets 403 before the rows are loaded. Creating or editing a device stays on `edit_settings`. Connecting a terminal stays owner-only. `card-machine-read-gate.test.ts` 8/8.
- `GET /api/provider/service-zones/analytics` now requires `view_reports`. It was summing every at-home booking’s total and travel fee for any staff member, and it loaded those booking addresses to do it. `GET /api/provider/finance/vat-reports/check-reminders` now uses the same permissions as the VAT reports page (`view_sales`, `view_reports`, or `process_payments`) so it no longer reveals VAT registration or that tax rows exist. `reports-access.test.ts` 2/2.
- `GET /api/provider/clients/serviced` and `GET /api/provider/clients/conversations` now require `view_clients`, the same permission as the client directory. They were returning every customer’s email, phone, date of birth, home address, and spend to any staff member, using the admin client. `directory-gate.test.ts` 2/2.
- `GET /api/provider/terminal-merchant-application` is now owner or superadmin only, matching save and submit. A staff member no longer receives the owner’s ID number, bank details, or onboarding documents, and the route no longer creates a draft application for them. `read-gate.test.ts` 1/1.
- `GET /api/provider/yoco/integration` now requires `process_payments` or `edit_settings`, the same as Yoco account status. It was returning the connected account email and public key to any staff member. Saving or disconnecting Yoco stays owner-only. `POST /api/provider/payout-accounts/verify` now requires `edit_settings`, the same as adding a bank account, so a staff member cannot look up an account holder name. `read-gate.test.ts` under the Yoco integration tests: 2/2.
- `GET /api/provider/settings/payments` still loads for every staff member so checkout can see which methods are accepted, the tax rate, and the no-show fee. The VAT number is omitted unless the viewer is the owner, a superadmin, or has `edit_settings`, `view_reports`, or `view_sales`. The Yoco public key and Paystack terminal codes, links, and QR URLs are omitted unless they can take card payments (`process_payments`, owner, or superadmin). `redact-payment-settings.test.ts` 2/2.
- `GET /api/provider/customers/[id]/profile` and `GET /api/provider/membership-subscribers` now require `view_clients`. They were returning email, phone, and booking totals through the admin client. Provider search still finds appointments and services, but client results with email or phone are omitted unless the viewer can see clients, and an appointment subtitle no longer falls back to the email address. `search-contact-visibility.test.ts` and `contact-gate.test.ts`: 4/4.
- Automation list, a single automation, and its execution history now require `manage_marketing`. The history was returning the customer’s email and phone to any staff member. Creating or editing an automation stays on `edit_settings`. Supplier list and supplier detail now require `view_products` or `edit_products`, so contact details and addresses are not returned to every staff member. `read-gate.test.ts` under automations: 4/4.
- `GET /api/provider/express-booking` now requires `edit_settings`, the same as creating, editing, or deleting a link. A staff member no longer receives every booking link, including a stored promotion or gift-card code. `read-gate.test.ts` under express-booking: 1/1.
- `GET /api/provider/settings/payee-entity` now requires `edit_settings`, the same as updating it. The registration number, registered name, and verification status are no longer returned to every staff member. `read-gate.test.ts` under payee-entity: 1/1.
- Booking list, booking detail, and the booking saved after an edit keep the customer name and drop email and phone unless the viewer has `view_clients`. Group participant phones on those payloads are dropped the same way. The shared list cache still stores the full row and the contact fields are removed on the way out. `redact-booking-customer-contact.test.ts`: 2/2.
- Group booking list, group booking detail, and the group booking returned after create use the same rule. Participant email and phone, and the customer contact on a child booking, stay off the response unless the viewer has `view_clients`. Names stay. `redact-booking-customer-contact.test.ts`: 3/3.
- Product order list, product order detail, and the order returned after an update keep the customer name and drop email and phone unless the viewer has `view_clients`. Marking an at-home arrival that was already recorded returns the booking the same way. `redact-booking-customer-contact.test.ts`: 4/4.
- Booking receipts, group booking receipts, and sale receipts keep the customer name and the salon’s own contact, and drop the customer’s email and phone unless the viewer has `view_clients`. Return request list and return detail do the same. `redact-booking-customer-contact.test.ts`: 5/5.
- The conversation list and a single conversation keep the customer name and drop email and phone unless the viewer has `view_clients`. A missing name no longer falls back to the email address. Linking existing bookings into a group returns participant contact the same way. `redact-booking-customer-contact.test.ts`: 6/6.
- `GET /api/provider/waitlist` now requires `view_calendar`, the same as a single waitlist entry. Waitlist list, detail, and the entry returned after create or update keep the customer name and drop email and phone unless the viewer has `view_clients`. The waiting-room list and the entries returned after check-in do the same. `read-gate.test.ts` under waitlist: 1/1.
- Notifying a waitlist client and the waitlist match list keep the customer name and drop email and phone unless the viewer has `view_clients`. Adding a participant to a group returns the saved row the same way, and a missing name is stored as “Guest” instead of the email address. `redact-booking-customer-contact.test.ts`: 7/7.
- Custom request list and a single custom request now require `send_messages`, the same as declining or sending an offer. The customer name stays and email is dropped unless the viewer has `view_clients`. A product-order receipt keeps the salon contact and the delivery address, and drops the customer’s email and phone the same way. `read-gate.test.ts` under custom-requests: 2/2.
- New-client, cancellation, no-show, and lifetime-value reports, plus the review list, keep the customer name and drop email and phone unless the viewer has `view_clients`. The day’s driving route now requires `view_calendar`. Stop addresses stay so the route can still be driven, and the customer’s email and phone on each stop are dropped the same way. `redact-booking-customer-contact.test.ts` and `read-gate.test.ts` under routes: 9/9.
- The package-usage report’s top clients keep the customer name and drop email unless the viewer has `view_clients`. A conversation message no longer uses the customer’s email as the sender name unless that permission is present. The booking audit log shows the actor’s name, and no longer falls back to their email. `route.test.ts` under conversation messages: 4/4.
- Booking list search, group booking search, sales search, and provider search no longer match a customer’s email or phone unless the viewer has `view_clients`. The customer’s name still matches, and someone who can see clients can still search by email or phone. `client-contact-search.test.ts` and `search-contact-visibility.test.ts`: 9/9.
- Walk-in product sales keep the customer name and drop the phone unless the viewer has `view_clients`. That covers the sales list and the order returned after a sale is created or a terminal payment is finalized. `route.test.ts` under product-sales: 6/6.
- Sending a booking payment link no longer echoes the customer’s email or phone unless the viewer has `view_clients`. The payment link itself is still returned. `contact.test.ts` under send-payment-link: 1/1.
- On-demand request list, detail, accept, and decline keep the service address and the customer name, and drop the email and phone inside the booking draft unless the viewer has `view_clients`. `redact-booking-customer-contact.test.ts`: 9/9.
- The close-out queue keeps the customer name and drops the phone unless the viewer has `view_clients`. `contact.test.ts` under close-out: 2/2.
- Dashboard insights keep the customer name on today’s and upcoming appointments, and drop the phone unless the viewer has `view_clients`. The cached dashboard payload is unchanged. `redact-dashboard-salon-money.test.ts`: 2/2.
- A single waiting-room entry, including the entry returned after a status update, keeps the customer name and drops email and phone unless the viewer has `view_clients`. `entry-contact.test.ts` under waiting-room: 2/2.
- Automation execution history keeps the customer name and drops email and phone unless the viewer has `view_clients`. `executions-contact.test.ts` under automations: 2/2.
- A profile that already uses an email address, a placeholder login being replaced, and an email send with no matching user no longer write that address to the server log. `no-customer-contact-in-logs.test.ts` 5/5 and `ensure-user-profile.test.ts` 4/4.
- A public provider review keeps the reviewer's name and no longer returns their email, or a name built from that email. `public-review-author.test.ts` 2/2.
- The public staff calendar file keeps a short client name and no longer includes the customer's email. `staff-calendar.test.ts` 1/1.
- A waitlist guest notification and a group guest with no send channel no longer write the customer's email or phone to the server log. The log keeps the waitlist entry id or the booking and participant ids. `no-customer-contact-in-logs.test.ts` 2/2.
- An on-demand request is stored without the customer's email and phone. Staff can select that row directly, so the draft keeps the name and the service address, and the booking created on accept loads contact from the user row in memory only. `10146_on_demand_payload_contact.sql` clears the same fields on rows already stored. `redact-booking-customer-contact.test.ts` 10/10 and `route.test.ts` under me/on-demand/requests 3/3.
- A live product-order alert still carries the order number, status, payment status, source, and customer name. The realtime frame no longer includes the customer's email or phone. `10147_product_orders_realtime_omit_contact.sql` applied on `beautonomi-audit-db`. `product-orders-realtime-contact.test.ts` 1/1.
- A signed-in session can no longer read `product_orders.customer_email` or `customer_phone`. Checkout, the customer's own order, and a staff member who may see clients still load those fields through the service role. Walk-in sales can still store the phone. `10148_product_order_contact_column_select.sql` applied on `beautonomi-audit-db`. `product-order-columns.test.ts` 2/2.
- A signed-in session can no longer read `waitlist_entries.customer_email` or `customer_phone`. Notify and auto-booking still load a guest address through the service role. A person who just joined still sees the address they submitted, and a staff member who may see clients still sees it on the response. `10149_waitlist_contact_column_select.sql` applied on `beautonomi-audit-db`. `waitlist-columns.test.ts` 2/2.
- A signed-in session can no longer read `booking_participants.participant_email` or `participant_phone`. Invites and cancellation notices still load a guest address through the service role. `10150_booking_participant_contact_column_select.sql` applied on `beautonomi-audit-db`. `participant-columns.test.ts` 2/2.
- A live booking-service update still carries the service line, staff, time, and guest name. The realtime frame no longer includes the guest's email or phone. `10151_booking_services_realtime_omit_contact.sql` applied on `beautonomi-audit-db`. `booking-services-realtime-contact.test.ts` 1/1.
- A signed-in session can no longer read `booking_services.guest_email` or `guest_phone`. The guest name stays on the service line. `10152_booking_service_contact_column_select.sql` applied on `beautonomi-audit-db`. `booking-services-column-select.test.ts` 1/1.
- A live Paystack terminal payment alert still carries the reference, amounts, payer name, and suggested match. The realtime frame no longer includes the payer's email or phone, or the raw charge that held them. `10153_terminal_payment_realtime_omit_contact.sql` applied on `beautonomi-audit-db`. `terminal-payment-realtime-contact.test.ts` 1/1.
- A signed-in session can no longer read `provider_paystack_terminal_payments.payer_email`, `payer_phone`, or the raw charge. The payer name stays. A staff member who may see clients still gets the address on the inbox through the service role. `10154_terminal_payment_contact_column_select.sql` applied on `beautonomi-audit-db`. `terminal-payment-columns.test.ts` 2/2.
- A signed-in session can no longer read `gift_card_orders.recipient_email`, `recipient_phone`, or the order metadata that holds a scheduled recipient address. Delivery still loads that address through the service role. The buyer’s wallet still receives it the same way. `10155_gift_card_order_contact_column_select.sql` applied on `beautonomi-audit-db`. `gift-card-order-columns.test.ts` 1/1.
- A signed-in session can no longer read `brand_approvals.guest_email`. The review page and the approval desk still load the row through the service role, and a guest link can still store the address. `10156_brand_approval_contact_column_select.sql` applied on `beautonomi-audit-db`. `brand-approval-columns.test.ts` 1/1.
- A signed-in session can no longer read `product_suppliers.email` or `phone`. The supplier name and contact name stay. A staff member who may see products still gets the address through the service role after that permission check. `10157_product_supplier_contact_column_select.sql` applied on `beautonomi-audit-db`. `product-supplier-columns.test.ts` 1/1.
- A signed-in session can no longer read `provider_yoco_oauth_tokens.user_email`. The business name stays. Connection status and payment calls still load the account email through the service role after the payments or settings check. `10158_yoco_oauth_contact_column_select.sql` applied on `beautonomi-audit-db`. `yoco-oauth-columns.test.ts` 1/1.
- A signed-in session can no longer read `report_schedules.recipients`. A staff member who may view reports still gets that address list through the service role after the reports check. `10159_report_schedule_contact_column_select.sql` applied on `beautonomi-audit-db`. `report-schedule-columns.test.ts` 1/1.
- A signed-in session can no longer read a Paystack virtual terminal’s WhatsApp number, the destination list that holds it, or the snapshot that stores the owner’s email and phone. A staff member who can take payments still gets those fields through the service role after that check. `10160_virtual_terminal_contact_column_select.sql` applied on `beautonomi-audit-db`. `virtual-terminal-columns.test.ts` 1/1.
- A signed-in session can no longer read the WhatsApp number on a Paystack terminal setup request, or the destination list that holds it. The destination name stays. A staff member who can take payments still gets the number through the service role after that check. `10161_terminal_setup_contact_column_select.sql` applied on `beautonomi-audit-db`. `terminal-setup-columns.test.ts` 1/1.
- A signed-in session can no longer read `provider_twilio_integrations.sms_from_number` or `whatsapp_from_number`. Messaging settings and message sending still load those numbers through the service role after the marketing or settings check. `10162_twilio_sender_contact_column_select.sql` applied on `beautonomi-audit-db`. `twilio-sender-columns.test.ts` 1/1.
- A signed-in session can no longer read `provider_email_integrations.from_email`. The sender name stays. Messaging settings and message sending still load the address through the service role after the marketing or settings check. `10163_email_sender_contact_column_select.sql` applied on `beautonomi-audit-db`. `email-sender-columns.test.ts` 1/1.
- A signed-in session can no longer read `provider_yoco_oauth_tokens.access_token` or `refresh_token`. The account email stays withheld. Payment calls still load the tokens through the service role. `10164_yoco_oauth_secret_column_select.sql` applied on `beautonomi-audit-db`. `yoco-oauth-secrets.test.ts` 1/1.
- A signed-in session can no longer read `provider_twilio_integrations.account_sid` or `auth_token`. The sender numbers stay withheld. Message sending still loads the credentials through the service role. `10165_twilio_secret_column_select.sql` applied on `beautonomi-audit-db`. `twilio-secrets.test.ts` 1/1.
- A signed-in session can no longer read `provider_email_integrations.api_key` or `api_secret`. The sending address stays withheld. Message sending still loads the credentials through the service role. `10166_email_secret_column_select.sql` applied on `beautonomi-audit-db`. `email-secrets.test.ts` 1/1.
- A signed-in session can no longer read `provider_yoco_integrations.secret_key` or `webhook_secret`. The public key stays. Payment calls still load the secrets through the service role. `10167_yoco_checkout_secret_column_select.sql` applied on `beautonomi-audit-db`. `yoco-checkout-secrets.test.ts` 1/1.
- A signed-in session can no longer read `calendar_syncs.access_token` or `refresh_token`. The calendar name stays. The OAuth callback still stores the tokens through the service role, and the settings list no longer returns them. `10168_calendar_sync_secret_column_select.sql` applied on `beautonomi-audit-db`. `calendar-sync-secrets.test.ts` 2/2.
- A signed-in session can no longer read `provider_yoco_terminals.api_key` or `secret_key`. The device name stays. A card charge still loads those keys through the service role after the payments check. `10169_yoco_terminal_secret_column_select.sql` applied on `beautonomi-audit-db`. `yoco-terminal-secrets.test.ts` 2/2.
- A signed-in session can no longer read `provider_yoco_webhooks.webhook_secret`. The webhook id stays. Signature checks still load the secret through the service role. `10170_yoco_webhook_secret_column_select.sql` applied on `beautonomi-audit-db`. `yoco-webhook-secrets.test.ts` 1/1.
- A signed-in session can no longer read `terminal_vendor_configs.oauth_client_secret`. The client id stays. Vendor setup still loads the secret through the service role, and the admin screen still masks it. `10171_terminal_vendor_secret_column_select.sql` applied on `beautonomi-audit-db`. `terminal-vendor-secrets.test.ts` 1/1.
- A signed-in session can no longer list every active `portal_tokens.token`. The old policy did not compare the token. Validation and new links still use the service role. A provider can still read a token for a booking they own. `10172_portal_token_lookup_policy.sql` applied on `beautonomi-audit-db`. The fresh replay has the same single remaining policy. `portal-token-lookup.test.ts` 1/1.
- Route tests that now hit a client-visibility check stub that check, and the customer order tests read `product_orders` through the admin client the route uses. Those files are included in the 5361 web passes above.
- CI typecheck (`turbo run typecheck` for packages, web, admin-web, customer, provider): 39/39. CI lint (web, admin-web, customer, provider): 20/20. The web failures were narrowed selects and the permission user type, plus the Paystack payout helper not being named as an auth guard. Contact redaction and the finance gate are unchanged. Re-run after that: web Vitest 5361/5361 (1159 files) plus account-status 5/5; provider Jest 553/553; customer Jest 413/413. Package and admin-web tests: 27/27, all cache hits (inputs unchanged).
- Apply `10138`–`10172` to **staging** (ask before). Production is out of scope.
- Commit / push (rule 7).
