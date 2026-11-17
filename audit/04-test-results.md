# Phase 4 — Test results

Scope: execute the Phase 3 §5 test plan against a disposable local database and the web test runner. Nothing in this phase touched production, triggered a gateway call, or wrote to staging. Every row below links to a command or artefact under `%TEMP%\beautonomi-audit\` (not committed) and states PASS / FAIL / BLOCKED / UNVERIFIED.

## 0. Environment actually used

| Item | Value |
|---|---|
| Database | Docker container `beautonomi-audit-db`, image `public.ecr.aws/supabase/postgres:17.6.1.127` (same major/minor as the other local Supabase stacks on this machine), host port 55432, password is a local throwaway |
| Why not `supabase start` | `supabase/config.toml` binds 54321/54322, already held by an unrelated project's stack (`supabase_kong_HRsystem`, `supabase_db_HRsystem`); changing `config.toml` is forbidden by ground rule 1, and stopping another project's stack was not approved |
| Schema source | `supabase/migrations/*.sql` (1 077 files) applied in the order the Supabase CLI uses for a fresh `db reset` (lexicographic by filename), one transaction per file, failures logged and skipped — see §1 |
| Data | none from any real environment; all fixture rows are synthetic (`audit-*` ids, `+27 00 000 0000`, `audit@example.invalid`) |
| Gateways | none called; webhook handlers exercised only where a pure function can be invoked without network |
| Staging use | read-only catalog queries only (function bodies / grants) to diff against the local build |
| Web tests | `apps/web` Vitest, existing suites only unless noted |

## 1. Local schema build

Two full builds were attempted from `supabase/migrations` into an empty database. Logs: `%TEMP%\beautonomi-audit\local\apply.log`, `apply-numeric.log`, `retry-*.log`.

| Build | Order | Result | Notes |
|---|---|---|---|
| 1 | Lexicographic by filename (what `supabase db reset` / `db push --include-all` use for a fresh project) | **972 OK / 105 FAIL** | 4- and 5-digit files (`1007_…`, `10108_…`) sort before `154_…`, `232_…`, `331_…`; e.g. `1008_wallet_bank_refund_requests` needs `public.tenants` (created in `331_tenants_core`), `1015_provider_invoice_billing_completion` needs `provider_invoices` (`154_…`), `1010_bob_go_shipping_booking` needs `product_orders` (`232_…`). Money-relevant casualties: 1007, 1008, 1013, 1015, 1016, 1025, 1035, 1037, 1038, 10109, 10114, 10115, 10125 |
| 2 | Numeric by leading number (the README's "numbered sequentially") | **1 012 OK / 65 FAIL**, retry pass → **1 076 / 1 077** | Remaining failure: `633_user_verification_signup_source_admin` (`auth.users.email_confirmed_at` absent in the bare image — fixture limitation, not a repo defect). The retry succeeded because 64 files depend on *later* numbers, e.g. `582_booking_payments_wallet_gift_and_payment_status_tolerance` references `booking_payments.tenant_id`, added by `3811_booking_payments_tenant_id` |

Consequences observed:

- Neither ordering replays cleanly. The live schema on staging was reached incrementally (`scripts/supabase-push-staging.ps1` pushes only not-yet-applied versions and `migration repair`s 10 orphan versions), not by replaying the folder. **A fresh environment (DR, new region, local dev) cannot be built from the migrations folder as-is** → F4-01.
- In build 2 the retry re-applied `582` *after* `589`/`595`, silently reverting `update_booking_payment_status` to its older body (no lifecycle auto-advance, `partially_paid` instead of `partially_refunded`). Detected by hashing function bodies against staging; fixed locally by re-applying `589` and `595`. Illustrates how out-of-order replay produces a schema that differs from staging without any error.

After build 2 + fixes, parity with staging (read-only catalog):

| Object class | Staging | Local |
|---|---|---|
| `public` tables | 518 | 518 |
| `public` functions | 1 283 | 1 282 |
| Triggers (non-internal) | 390 | 378 |
| RLS policies (`public`) | 957 | 960 |
| Normalised body hash equal: `create_finance_ledger_from_payment`, `create_finance_ledger_from_booking_refund`, `create_booking_payment`, `insert_payout_request_guarded`, `provider_finance_summary`, `update_booking_payment_status` (after fix), `validate_refund_amount` | — | **all 7 identical** |
| `finance_transactions` unique indexes (`ux_…source_payment_per_type`, `ux_…source_refund_component`, `ux_finance_wallet_topup_description`) | present | identical definitions |
| `payouts.status` type | `payout_status` enum | `payout_status` enum |

Grants: the bare image has no Supabase default privileges, so a fresh build leaves functions executable only by their explicit grantees. Staging shows **1 058 of 1 256 `public` functions executable by `anon` and 1 113 by `authenticated`** (hosted default privileges; 54 / 109 of them `SECURITY DEFINER`). For T2 the staging EXECUTE grants were mirrored locally from the staging catalog (`mirror-grants.sql`, 1 662 statements) so probes reflect the real environment. This also shows the anon-callable SECDEF functions in Phase 2 are not created by any migration — they come from default privileges plus the absence of `REVOKE … FROM PUBLIC/anon` in the migrations that create them (e.g. `977_gateway_fee_delta_and_adjustment.sql:172` only *grants* `service_role`).

Fixture: synthetic tenant `audit-za`, 4 users (`audit-*@example.invalid`, `+2700000000x`), provider `Audit Salon` (commission override 15 %), 2 staff, 1 offering (R318.33), gift card `AUDIT-GC-0001` (R200). Bookings follow Phase 2 worked example A: services 318.33 VAT-inclusive + platform fee 15.00 = **333.33**, `tax_amount` 41.52. Platform commission came out **0.00** in every ledger row because `platform_settings` is empty locally (same as staging, see Phase 2 §1); provider earnings therefore = 333.33 − 15.00 − 41.52 = **276.81**.

## 2. T1 — DB trigger / RPC tests

Script `local\t1-ledger.sql`, output `t1-ledger.out`. Run as `postgres` (equivalent to the API's service-role client). Amounts are what the live trigger bodies produced.

| ID | Scenario | Expected | Observed | Verdict |
|---|---|---|---|---|
| T1.1a | Cash payment 333.33 on booking A | ledger rows sum to cash | `platform_fee` 15.00 (net 15.00), `provider_earnings` 276.81, `tax` 41.52 (net 0); `bookings.payment_status=paid`, `total_paid=333.33` | PASS |
| T1.1b | Refund 100.00 (unlinked, as the provider app sends it) | reversal of 100.00 proportionally | `refund/platform_fee` −4.50, `refund/provider_earnings` −83.04, `refund/tax` −12.46 → Σ 100.00; `payment_status=partially_refunded` | cash PASS |
| T1.1c | Refund 233.33 (remainder) | all components net to 0.00 | `refund/platform_fee` −8.08, `refund/provider_earnings` −202.89, `refund/tax` −22.36. **Residuals on a fully refunded booking: platform_fee +2.42 (platform keeps fee), provider_earnings −9.12 (provider over-clawed), tax +6.70 (VAT still recognised)**; cash Σ 333.33 ✓ | **FAIL → F2-06 confirmed** |
| T1.2 | 3 × 111.11 | components net to 0.00 | platform_fee residual +3.25, provider_earnings −12.25, tax +9.00 | **FAIL → F2-06** (error grows with refund count) |
| T1.3a | Refund 400.00 **linked** to the 333.33 payment | rejected | `ERROR: Refund amount validation failed … exceeds payment amount (333.33)` | PASS |
| T1.3b | Refund 400.00 **unlinked** (`payment_id NULL`, the provider-app path) | rejected | `WARNING: Total refunded (400.00) exceeds total paid (333.33) by more than 10%` — **row inserted**, `total_refunded=400.00 > total_paid=333.33`, `payment_status=refunded` | **FAIL → F2-22 confirmed** |
| T1.4 | `booking_source='provider'`, cash, fee 15.00 | per `1027` intent: no `platform_fee` row | `platform_fee` 15.00 row created | **F2-14 confirmed** (live body lacks the `v_pf := 0` guard; impact depends on the API never setting a fee on provider-sourced bookings — `provider-create-no-platform-fee.static.test.ts` asserts that) |
| T1.9 | DELETE a completed refund; UPDATE another completed→cancelled | ledger reversals removed / reversed | 6 `refund` ledger rows remain (net −132.75) while `bookings.total_refunded` returns to 0.00 and `payment_status=paid` | **FAIL → F2-51 / F2-54 confirmed**: ledger and booking disagree after refund deletion/cancellation |
| T1.11 | Booking with `total_amount` 999.99 vs components | rejected | `ERROR: Total amount validation failed … accepted totals [374.85 / 333.33]` — rejected | PASS (F2-13 partially mitigated: validator accepts either tax-exclusive or VAT-inclusive total) |
| T1.12 | `completed → pending` as service role / as authenticated owner | blocked | service role: update succeeds, 0 shadow-violation rows (trigger exempts `service_role`/`postgres`); owner JWT: `UPDATE 0` (RLS forbids direct booking updates). The DB guard is never exercised by the API path (`supabaseAdmin`) | **F2-12 confirmed** (only app-level transition validation exists) |
| T1.13 | Ledger insert forced to fail (fault-injection trigger) during payment insert | payment rejected or exception logged | `WARNING: Error creating finance transactions…`; payment **committed** (`total_paid 333.33`, `paid`), 0 ledger rows, 1 `reconciliation_exceptions` row (`source='ledger'`) | **F2-31 confirmed** (fail-open) — mitigated by exception row; no alert path verified |
| **T1.15** | Refund **linked** to its payment (`payment_id` set — as `stripe-settlement.ts:219`, `process-booking-chargeback.ts:169`, `settle-card-machine-payment.ts:227,490`, `group-guest-refunds.ts:172`, `awaiting-machine-refunds.ts:113`, Yoco webhook do), 50.00 on a 333.33 Yoco card payment; insert `pending` then `UPDATE status='completed'` (the API sequence) | ledger reversal rows | **`ERROR: duplicate key value violates unique constraint "ux_finance_transactions_source_payment_per_type" (source_payment_id, transaction_type)=(…, refund)`** — the refund trigger writes one `refund` row per component with the same `source_payment_id`, colliding with the index from `489_finance_transactions_unique_source_payment.sql`. The status update is rolled back; refund stays `pending`, booking stays `paid` | **FAIL → new F4-03 (High)** |
| T1.14 | `ledger_reconciliation_summary()`, `reconciliation_assert_zero_drift()`, `gl_currency_drift_exceptions()`, journal balance | zero drift | 36 legacy rows / 36 shadowed / 0 missing / 0 imbalanced / drift 0.0000; 0 unbalanced journal entries | PASS — but note the reconciliation only proves the GL mirrors `finance_transactions`; it does **not** detect T1.1c/T1.2/T1.3b/T1.9 allocation errors |
| T1.16 | `insert_payout_request_guarded(provider, 276.81, {amount 276.81,…})` | payout row | **`ERROR: column "status" is of type payout_status but expression is of type text`** (`COALESCE(p_payout->>'status','pending')` inserted into the enum column). Staging has the identical function body (hash match), the identical `payouts.status payout_status` type and no `text→payout_status` cast | **FAIL → new F4-02 (High)**: `POST /api/provider/payouts` re-throws this error (`payouts/route.ts:382-395`) → every payout request 500s on any environment with this schema; production UNVERIFIED |

T1.5–T1.8 tip allocations: executed in `supabase/tests/audit/20_ledger_integrity.test.sql` (F2-07). A 100.00 tip on three staff lines yields 3 allocations summing to 100.00. T1.10: a 333.33 sale with 283.33 refunded leaves recognized components of 50.00. Posting an extra 50.00 `cancellation_fee` on top of that retained 100.00, so settlement no longer writes that second row.

## 3. T2 — RLS / grant probes

Script `local\t2-rls.sql`, output `t2-rls.out`. Each probe runs in its own transaction as `SET ROLE anon|authenticated` with synthetic JWT claims (`request.jwt.claim.sub/role`, `request.jwt.claims`) and is rolled back. Grants mirrored from staging (see §1).

| ID | Actor | Action | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| T2.1 | staff JWT (employee, `view_calendar` only) | `INSERT booking_refunds` 1.00 on own provider's booking; `UPDATE … amount=0.01`; `DELETE` | denied | **INSERT 1, UPDATE 2, DELETE 2** rows; all 7 refund rows visible | **FAIL → F2-01 confirmed** (`Providers can manage refunds` FOR ALL) |
| T2.2 | customer JWT | `UPDATE additional_charges SET amount=0.01, status='paid'` on own booking's charge | denied | **UPDATE 1** → charge now 0.01 / paid | **FAIL → F2-02 confirmed** |
| T2.3 | customer B JWT | `reserve_gift_card_redemption('AUDIT-GC-0001', 25, <booking of customer A>)` | denied | reservation created, remaining 175.00 | **FAIL → F2-23 confirmed** (no card-owner or booking-customer check; idempotency keyed on booking only) |
| T2.4 | anon | `post_gateway_fee_delta(<provider_earnings row>, 999.00, 'audit-probe')` | denied | **executed; `fees` on the ledger row became 999.00** | **FAIL → F2-61 confirmed** |
| T2.5 | anon | `recognize_period_revenue(tenant, now-30d, now)` | denied | executed (returned) | **FAIL → F2-63 confirmed** |
| T2.6 | anon | `void_gift_card_redemption_for_sale(random uuid)` | denied | executed (returned `f`) | **FAIL → F2-64 confirmed** (callable; void of a real sale not exercised) |
| T2.7 | anon | `brand_reset_tenant_data(audit tenant)` | denied | executed; returned per-table delete counts for 15 `brand_*` tables (all 0 here); `bookings` untouched | **F2-65 confirmed as callable; scope is the brand module only → downgrade to Medium** |
| T2.8 | anon | `revoke_all_user_sessions(uid)` | denied | reached body (`DELETE FROM auth.sessions` — table absent in the bare image) | **F2-66 confirmed callable** |
| T2.9 | anon | `log_finance_ledger_trigger_failure(booking, null, 'anon probe')` | denied | executed; 0 `reconciliation_exceptions` rows written (inner insert swallowed) | F2-11: callable; write not reproduced |
| T2.10 | customer B JWT | read `booking_payments`, `bookings`, `finance_transactions` | 0 rows | 0 / 0 / 0 | PASS |
| T4.4 | two parallel authenticated sessions | `reserve_gift_card_redemption` 150.00 + 150.00 on a 200.00 card | one fails, balance ≥ 0 | session 1 → remaining 50.00; session 2 → `Insufficient gift card balance`; final balance 50.00, 1 redemption | PASS (atomic `UPDATE … WHERE balance >= p_amount`) |
| T4.2 | two parallel `insert_payout_request_guarded` for the full balance | one accepted | both fail on the T1.16 type error before reaching the balance check; the advisory lock + `pending_sum + amount ≤ p_max_available_before_reserve` logic is serialised correctly by construction, but note the ceiling is **caller-supplied** (`payouts/route.ts:368-374`), not recomputed in the RPC (service-role only, so not client-reachable) | BLOCKED by F4-02 |

Grant parity check for the probed functions (local after mirror = staging): `post_gateway_fee_delta`, `recognize_period_revenue`, `void_gift_card_redemption_for_sale`, `brand_reset_tenant_data`, `revoke_all_user_sessions`, `log_finance_ledger_trigger_failure`, `reserve_gift_card_redemption` → `anon` + `authenticated` EXECUTE; `credit_/debit_marketing_credit`, `insert_payout_request_guarded`, `create_booking_payment`, `provider_finance_summary` → `service_role` only (Phase 2 §8.6 stands).

## 4. T3 — API route tests

Method: Vitest route tests written in `%TEMP%\beautonomi-audit\web-tests\` (outside the repo) and run against the real `route.ts` handlers with the repo's own `vitest.config.ts` merged in (`vitest.audit.config.ts`). Auth/permission helpers were mocked to a *legitimate* caller holding exactly the permission the route demands; the Supabase client was replaced by a recording chain mock (`_mock-db.ts`) so the test captures the row the route would write. Each test asserts the **secure** behaviour, so a failing test = control absent. Logs: `run-t3-15.log`, `run-t3-17-20.log`.

| ID | Route | Caller | Input | Observed | Verdict |
|---|---|---|---|---|---|
| T3.15 | `POST /api/provider/staff` | staff with `manage_team` only (not owner) | `{ role: "owner", … }` | **200**; `provider_staff` insert payload `role: "owner"` with `permissions.{manage_team, manage_finance, issue_refunds, process_payments, manage_billing…}: true` (`route.ts:445-448, 636`) | **FAIL → F3-12 confirmed (High)** |
| T3.16 | `PUT /api/provider/staff/[id]/settings` | staff with `manage_team` | `{ is_admin: true }` | **200**; update payload contains `is_admin: true` (`[id]/settings/route.ts:209-250` passes body through) | **FAIL → F3-13 confirmed (High)** |
| T3.17 | `POST /api/provider/roles` | staff with `manage_team` only | role with `process_payments, issue_refunds, manage_finance, manage_team` | **200**; `provider_roles` insert stores all four permissions (`roles/route.ts:70-135` – no ceiling to caller's own permissions) | **FAIL → F3-15 confirmed (High)** |
| T3.20 | `POST /api/provider/products` | staff with `manage_products` | `retail_price: -5, supply_price: -2, tax_rate: 150` | **200**; insert payload `retail_price: -5, supply_price: -2, tax_rate: 150` (`products/route.ts:106-199`, `parseFloat` only); `products` table has no CHECK | **FAIL → F3-01 confirmed (Medium)** |
| T3.1 | `POST /api/provider/bookings/[id]/refund` | — | — | Static only: `payment_id` taken from body (`:294-299`), inserted `pending` then completed (`:485-511`); provider app never sends `payment_id` → unlinked path (T1.3b) | see T1.3b / T1.15 |
| T3.2 | `POST /api/provider/payouts` | — | — | Static: route passes `maxAvailableBeforeReserve` it computed itself (`:368-374`) and re-throws RPC errors (`:382-395`) → with F4-02 every request 500s | see T1.16 |
| T3.21 | `POST /api/provider/group-bookings` | — | — | Static: participant `price` and `travel_fee` accepted from body, only clamped `≥ 0` (`route.ts:469-508`); package pricing recomputed only when a package is selected (`lib/bookings/group-booking-package-pricing.ts`) | **new F4-04 (Medium)** |
| T3.3 | `GET /api/provider/finance/vat-reports` | — | tax + tax-refund rows | `vat-reports-refunds.test.ts`: `transaction_type` is selected; `vat_collected` is non-zero | PASS (F2-24) |
| T3.4 | Flutterwave webhook | — | missing `verif-hash`; duplicate | `flutterwave-webhook-verify.test.ts` + `flutterwave/webhook/__tests__/route.test.ts`: signature required in every env; shared lease | PASS (F2-30) |
| T3.5 | Paystack `refund.processed` | — | amount > remaining | `refund-events-cap.test.ts` (Stripe and Flutterwave cap tests too): refund capped to remaining | PASS (F2-33) |
| T3.6 | Flutterwave `transfer.failed` | — | completed payout | `flutterwave-transfer-webhook.test.ts`: payout ledger reversed | PASS (F2-21) |
| T3.7 | PayCloud webhook | — | invalid RSA signature | `paycloud/webhook/__tests__/route.test.ts`: 401 before any payment lookup | PASS (F2-37) |
| T3.8 | `GET /api/admin/settings` | — | env secrets, no settings row | `route.get-secrets.test.ts`: response contains no sentinel | PASS (F2-62) |
| T3.9 | `POST …/request-payment` | — | `1e12`, `0.001` | `request-payment/__tests__/route.test.ts`: 400 | PASS (F2-25) |
| T3.10 | `POST /api/provider/payouts` | — | `amount: "abc"` | `route.post-rpc.test.ts`: RPC `INVALID_AMOUNT` → 400 | PASS (F2-19) |
| T3.11 | provider refund | — | wallet credit then finalize throws | `revert-wallet-refund-credit.test.ts`: credit reverted | PASS (F2-57) |
| T3.12 | `POST /api/provider/bookings` | — | `membership_discount_amount: 9999` | `provider-create-no-platform-fee.static.test.ts`: applied amount is `membershipResult.membershipDiscountAmount` | PASS (F2-34) |
| T3.13 | Yoco create | — | another provider's `entity_id` | `yoco/payments/__tests__/route.test.ts`: rejected before Yoco is called | PASS (F2-35) |
| T3.14 | Paystack `invoice.update` | — | handler throws | `route.signature-idempotency.test.ts`: 500 so Paystack retries | PASS (F2-47) |
| T3.18 | `POST /api/provider/sales` | `create_sales` | `unit_price: 0.01` on a catalog service | `route.post-server-totals.test.ts`: server prices stored | PASS (F3-06) |
| T3.19 | shifts / time-clock | staff without `manage_team` | colleague shift / clock-in | `route.manage-team-gate.test.ts`: 403 | PASS (F3-10) |
| T3.22 | `PATCH` payment settings | staff without `edit_settings` | `noShowFeeAmount: 9999` | `money-settings-permission-gates.test.ts`: 403 | PASS (F3-07) |
| T3.23 | `POST /api/provider/group-bookings` | — | client `travel_fee: 0`, `total_price: 1` | `route.post-server-pricing.test.ts`: catalogue prices stored | PASS (F4-04) |
| T3.24 | `GET /api/paystack/verify` | unauthenticated | gateway success, unknown or mismatched order | `verify-product-order.test.ts`: 403 / `AMOUNT_MISMATCH` and `recordProductOrderPayment` not called. Writes sit inside `data.data.status === "success"` | PASS |

Baseline: the repo's own web suite (`vitest run`, log `t3-web-vitest-full.log`) finished after 57 min: **1 038 files, 4 844 tests — 4 843 passed, 1 failed**. The failure is `src/app/api/me/portal/__tests__/route.test.ts > GET /api/me/portal > returns error status when not authenticated` — `Test timed out in 15000ms` under heavy machine load (Docker + Jest running concurrently); not money-related; re-run in isolation → 7/7 pass (environmental timeout, not a defect). Notable existing tests that *pass* but encode the vulnerable behaviour: none found; notable **missing** tests: no test asserts a non-owner cannot create an `owner`, no test covers refunds with `payment_id` set end-to-end at the DB level (which is why F4-03 went unnoticed — all ledger tests mock the DB).

## 5. T4 — Concurrency

Two parallel `psql` sessions against the local DB, each in its own transaction, same fixture.

| ID | Scenario | Expected | Observed | Verdict |
|---|---|---|---|---|
| T4.1 | Second Paystack capture with the same `payment_provider_id` | 1 payment | `20_ledger_integrity.test.sql`: unique violation, 1 row remains. There is no `idempotency_key` column and no `ux_booking_payments_idempotency` index on local `booking_payments`; the control is `booking_payments_paystack_provider_tx_uidx` | PASS (local, rolled back) |
| T4.2 | Two payout requests for the whole available balance | 1 accepted | Two parallel `insert_payout_request_guarded` calls for 500 against a 500 ceiling on `beautonomi-audit-db`: one `pending`, the other `INSUFFICIENT_BALANCE`. Rows deleted after | PASS |
| T4.3 | Two refunds totalling > paid, concurrently, unlinked | second rejected | Two parallel 200.00 refunds on a 333.33 payment: one committed, the other rejected at 400.00 > 333.33. `10145` locks the booking row first. Rows deleted after | PASS |
| T4.4 | Two gift-card reservations 150 + 150 on a 200 card | one rejected | second session `Insufficient gift card balance`; balance 50.00 | PASS |

## 6. T5 — Arithmetic property tests

Script `local\t5-rounding.mjs`, output `t5-rounding.out`. 100 000 deterministic random amounts (0.01–9 999.99) × 5 rates {15, 12.5, 7.5, 3.9, 20} %, compared with PostgreSQL `ROUND(numeric, 2)` computed in the local DB (half-away-from-zero on exact decimals). Helpers are faithful inline copies of `packages/utils/src/money.ts` (`toMinorUnits` :66-69, `fromMinorUnits` :74-77, `roundCurrency` :101-105, `percentOf` :107-112, `splitMoneyProportionally` :174-201).

| Property | Trials | Mismatches | Verdict / note |
|---|---|---|---|
| `percentOf(a, r)` == PG `ROUND(a*r/100, 2)` | 500 000 | **0** | PASS — integer-minor-unit arithmetic matches the DB |
| Plain `Math.round(a*r/100*100)/100` (pattern used in many routes, e.g. `provider/bookings/[id]/refund/route.ts`, `settle-card-machine-payment.ts`) == PG | 500 000 | **1 345 (0.27 %)** | FAIL — half-cent binary artefacts, e.g. 4 304.36 × 12.5 % → PG 538.05 / JS 538.04; 7 731.50 × 15 % → 1 159.73 / 1 159.72 |
| `roundCurrency(a*r/100)` == PG | 500 000 | 1 345 | FAIL for the same inputs — `roundCurrency` adds `Number.EPSILON` but still rounds a float product; only `percentOf` (minor-unit multiply first) is DB-consistent |
| `splitMoneyProportionally(total, w[])`: Σparts == total, no negative part | 100 000 | 0 / 0 | PASS (largest-remainder allocation conserves cents) |

Impact: whenever TypeScript computes a fee/commission with float-then-round and the DB trigger recomputes it with `ROUND(numeric)`, ~1 in 370 bookings differs by R0.01 between what the API displays/stores on the payment and what the ledger records → recorded as **F4-06 (Low)**; it is a reconciliation-noise source, not a loss vector. `percentOf` is the correct helper and is already exported from `@beautonomi/utils`.

## 7. T6 — Mobile unit tests

`pnpm --filter provider test` (Jest) from `apps/provider`; log `%TEMP%\beautonomi-audit\t6-mobile-jest.log`.

| Suites | Tests | Failed | Duration |
|---|---|---|---|
| 123 passed | 544 passed | 0 | 240 s |

Verdict: PASS (baseline). Coverage of money logic in the mobile suite is thin: no test for the Payments / Refund screens' amount handling or for `formatCurrency` edge cases; the suite is dominated by hooks/components/navigation. Mobile ↔ API contract tests (T6.2–T6.4 in the plan) were not executed — they need a running API; Phase 3 tracer evidence stands.

## 8. T7 — Reconciliation

| ID | Check | Observed | Verdict |
|---|---|---|---|
| T7.1 | `ledger_reconciliation_summary()` after all T1 activity | 36 legacy / 36 shadowed / 0 missing / 0 imbalanced / drift 0.0000 | PASS (GL mirrors ledger) |
| T7.2 | `reconciliation_assert_zero_drift()` | no exception | PASS |
| T7.3 | `gl_currency_drift_exceptions()` | 0 rows | PASS |
| T7.4 | Σ(`journal_lines.raw_amount` debit) == Σ(credit) per entry | 0 unbalanced entries | PASS |
| T7.5 | Does any reconciliation function detect the T1.1c/T1.2 residuals (fully refunded booking with non-zero `provider_earnings`/`tax` net)? | **No** — all checks compare `finance_transactions` with `journal_*`; none compares component nets against booking state (`total_paid − total_refunded`) | **GAP → F4-07 (Medium)** |
| T7.6 | Does any check flag T1.9 (refund rows whose `booking_refunds` source no longer exists / is cancelled)? | **No** — `source_refund_id` orphans are not checked | part of F4-07 |
| T7.7 | `reconciliation_exceptions` after T1.13 fail-open | 1 row (`source='ledger'`) | PASS (logged). Consumers: admin list/assign/resolve routes (`api/admin/reconciliation-exceptions/…`), `api/admin/finance/ledger-health`, and the agent sweep (`lib/agents/workflows/workforce-sweep.ts:124-160`) which only acts when the `reconciliation-investigator` agent is `active`. No push alert (email/Slack/webhook) on a new `source='ledger'` exception found → a fail-open ledger write is visible only to someone who opens the admin page. UNVERIFIED whether the agent is active in production |

## 9. Findings confirmed / refuted by execution

### 9.1 Prior findings — status after execution

| ID | Phase | Severity before | Result | Severity after | Evidence |
|---|---|---|---|---|---|
| F2-01 | 2 | High | CONFIRMED — staff with no finance permission inserted/updated/deleted `booking_refunds` | High | T2.1 |
| F2-02 | 2 | High | CONFIRMED — customer set own charge to 0.01/paid | High | T2.2 |
| F2-06 | 2 | High | CONFIRMED with exact residuals (+2.42 / −9.12 / +6.70 on 333.33; grows with refund count) | High | T1.1c, T1.2 |
| F2-11 | 2 | Medium | anon can call `log_finance_ledger_trigger_failure`; write not reproduced | Low | T2.9 |
| F2-12 | 2 | Medium | CONFIRMED — DB transition guard is never exercised by the service-role API path | Medium | T1.12 |
| F2-13 | 2 | Medium | Partially mitigated — `validate_booking_total` rejects arbitrary totals but accepts two different "correct" totals (tax-excl / VAT-incl) | Low | T1.11 |
| F2-14 | 2 | Medium | CONFIRMED in trigger body; exploitable only if API ever sets a fee on a provider-sourced booking (static test says it does not) | Low | T1.4 |
| F2-22 | 2 | High | CONFIRMED — unlinked refund of 400 on 333.33 accepted with WARNING | High | T1.3b |
| F2-23 | 2 | High | CONFIRMED — unrelated authenticated user reserved another customer's gift card against a booking they don't own | High | T2.3 |
| F2-31 | 2 | High | CONFIRMED fail-open; exception row logged, no push alert | High | T1.13, T7.7 |
| F2-51 / F2-54 | 2 | Medium | CONFIRMED — ledger reversals survive refund DELETE/cancel; booking reverts to `paid` | Medium | T1.9 |
| F2-61 | 2 | Critical | CONFIRMED — anon changed `finance_transactions.fees` to 999.00 | Critical | T2.4 |
| F2-63 | 2 | High | CONFIRMED callable by anon | High | T2.5 |
| F2-64 | 2 | High | CONFIRMED callable by anon | High | T2.6 |
| F2-65 | 2 | High | Callable by anon, but body only deletes `brand_*` tables | **Medium** (downgrade) | T2.7 |
| F2-66 | 2 | High | CONFIRMED callable by anon (body reached) | High | T2.8 |
| F3-01 | 3 | Medium | CONFIRMED — negative prices / tax_rate 150 inserted | Medium | T3.20 |
| F3-12 | 3 | High | CONFIRMED — `manage_team` staff creates `owner` with all permissions | High | T3.15 |
| F3-13 | 3 | High | CONFIRMED — `manage_team` staff sets `is_admin: true` | High | T3.16 |
| F3-15 | 3 | High (conditional) | CONFIRMED — role created with finance permissions the caller lacks | High | T3.17 |
| F3-06, F3-10, F3-07 | 3 | — | Executed after the fix: server sale totals, `manage_team` and `edit_settings` gates | control present | T3.18, T3.19, T3.22 |
| F3-02 | 3 | — | `route.manage-marketing-gate.test.ts`: PATCH/DELETE/send/test-send 403 without `manage_marketing` | control present | — |
| F3-21 | 3 | — | Pay-plan tiers now reject `commission_rate` outside 0–100 before insert. `upsert-schema.test.ts` + `add-staff-schema.test.ts`. DB CHECK still in `10_security_hardening.test.sql` | control present | — |
| F3-24 | 3 | — | `integration-secrets.test.ts`: dummy token stored as `enc.v1.` and not as plaintext; legacy plaintext still readable | control present | — |

Refuted: none. Every finding selected for execution reproduced.

### 9.2 New findings from Phase 4

| ID | Severity | Area | Description | Evidence | Impact | Fix (sketch) | Effort |
|---|---|---|---|---|---|---|---|
| **F4-02** | **High** | Payouts | `insert_payout_request_guarded` inserts `COALESCE(p_payout->>'status','pending')` (text) into `payouts.status` (`payout_status` enum) → `42804` type error on every call. Function body hash identical on staging. | T1.16; `payouts/route.ts:368-395`; staging catalog | `POST /api/provider/payouts` returns 500 for every provider on any environment with this schema — providers cannot request payouts via the app. Prod UNVERIFIED (no access by rule). | Cast: `(COALESCE(p_payout->>'status','pending'))::payout_status`; add a DB-level test | S |
| **F4-03** | **High** | Refund ledger | Unique index `ux_finance_transactions_source_payment_per_type (source_payment_id, transaction_type)` (migration 489) collides with `create_finance_ledger_from_booking_refund`, which writes several `refund` rows sharing `source_payment_id = NEW.payment_id`. Any refund whose `payment_id` is set cannot transition to `completed`. Index + trigger identical on staging. | T1.15; `stripe-settlement.ts:219`, `process-booking-chargeback.ts:169`, `settle-card-machine-payment.ts:227,490`, `group-guest-refunds.ts:172`, `awaiting-machine-refunds.ts:113`, Yoco webhook | Gateway-originated refunds/chargebacks (Stripe, Yoco, card machine, group guest) fail at the DB; money refunded at the gateway is never reflected in the ledger or booking; provider-app refunds (no `payment_id`) unaffected — which is why it was not noticed. | Drop the index or make it `(source_payment_id, transaction_type, transaction_category)`; the refund trigger already sets `source_refund_id`, so `ux_…source_refund_component` provides idempotency | S |
| **F4-01** | Medium | Schema / DR | `supabase/migrations` does not replay from scratch in either lexicographic (105 failures) or numeric (65 failures, 1 after retry) order; staging reached its state incrementally. One out-of-order replay silently reverted `update_booking_payment_status`. | §1 build table; `apply.log`, `apply-numeric.log` | No reproducible way to stand up a new environment or verify prod schema = migrations; drift undetectable | Squash to a baseline schema snapshot (`supabase db dump --schema public`) + keep forward migrations; enforce monotonically increasing prefixes in CI | M |
| **F4-04** | Medium | Group bookings | Participant `price` and group `travel_fee` are client-supplied and only clamped to ≥ 0 | `group-bookings/route.ts:469-508` | Provider staff (or tampered client) can under-price group bookings; totals downstream trust these | Recompute from `offerings`/`provider_travel_settings` server-side; reject mismatch | S |
| **F4-05** | Medium | DB grants | Hosted default privileges give `anon` EXECUTE on 1 058 / 1 256 public functions (54 SECDEF) and `authenticated` on 1 113; no migration issues `REVOKE … FROM PUBLIC, anon` when creating SECDEF functions | §1 grants; `977_….sql:172`; staging catalog | Root cause of F2-61/63/64/65/66 and future regressions | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated`; one-off revoke sweep; CI check | M |
| **F4-06** | Low | Arithmetic | Float-then-round (`Math.round(x*100)/100`, `roundCurrency`) disagrees with PG `ROUND` on 0.27 % of fee computations by R0.01; `percentOf` is correct | T5 | Cent-level API-vs-ledger drift on ~1 in 370 bookings; reconciliation noise | Use `percentOf`/minor-unit math everywhere a DB trigger recomputes the same figure | S |
| **F4-07** | Medium | Reconciliation | No reconciliation check compares ledger component nets with booking state or detects orphaned `source_refund_id`; `reconciliation_assert_zero_drift()` returned 0.0000 while the DB held the F2-06 residuals and the F2-51 orphans | T7.5, T7.6 | "Reconciles to the cent" is reported while allocation is wrong; errors accumulate silently | Add checks: per fully-refunded booking Σnet per component = 0; every `refund` ledger row has a `completed` `booking_refunds` parent | S–M |

## 10. UNVERIFIED after Phase 4

| Item | Why unverified | What would verify it |
|---|---|---|
| Production schema parity (F4-02, F4-03, F2-61…66 grants) | Rule 2: no production access used; only staging catalog compared | One read-only `pg_catalog` query on prod (function hash of `insert_payout_request_guarded`, index def, `pg_proc.proacl` for the 5 functions) — requires explicit approval |
| Whether payouts currently fail in prod (F4-02) | as above; also no access to prod logs / Sentry | Prod `payouts` rows created in the last 30 days, or Sentry search for `42804` on `/api/provider/payouts` |
| Whether gateway refunds are failing in prod (F4-03) | as above | Count of `booking_refunds` with `payment_id IS NOT NULL AND status='pending'` older than 1 h on prod |
| `633_user_verification_signup_source_admin` | Bare image's `auth.users` lacks `email_confirmed_at`; fixture limitation | Apply on a real Supabase stack |
| T1.5–T1.8 tip allocation | Resolved | `20_ledger_integrity.test.sql` F2-07: 3 allocations sum to 100.00. Passed post-`10143` |
| T3.3–T3.14, T3.18, T3.19, T3.22–T3.24 | Resolved locally | §4 rows. 16 files / 75 tests, then 5 files / 25 tests, all passed |
| Mobile ↔ API contract tests (T6.2–T6.4) | Need a running API + device/simulator | Expo dev build against local Next.js with the local DB |
| T1.10 cancellation-fee settlement | Resolved locally | `20_ledger_integrity.test.sql`: retained components = 50.00. Settlement no longer posts a second `cancellation_fee` for the same retain |
| T4.1 Paystack double-submit | Resolved locally | `20_ledger_integrity.test.sql`: second row with the same Paystack transaction id rejected; 1 row remains |
| Full web Vitest result | Resolved: 5 215 / 5 215, plus account-status 5/5 (`06-fixes.md`) | — |
| `reconciliation-investigator` agent active in prod; any alerting on `reconciliation_exceptions` | Config/data in prod | Prod `agent_definitions` row (read-only) |
| `platform_settings` empty on prod (commission 0 %) — same as staging? | Prod data | One read-only `SELECT count(*)` |
| Live gateway behaviour (Paystack/Stripe/Yoco/Flutterwave/PayCloud/IAP) | No sandbox credentials supplied; rule 2 forbids live calls | Sandbox keys per gateway + webhook replay |

Local environment left running: Docker container `beautonomi-audit-db` (port 55432, synthetic data only, throwaway password). Remove with `docker rm -f beautonomi-audit-db` when no longer needed.
