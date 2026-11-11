# Phase 5 — Consolidated findings

Beautonomi provider app + backend, financial-systems audit. Sources: `01-inventory.md` (F-xx), `02-money-flows.md` (F2-xx), `03-feature-matrix.md` (F3-xx), `04-test-results.md` (F4-xx, execution results). Severities below are **final**; where Phase 4 execution changed a severity the change is noted in the Evidence column.

**Fix status:** local/staging remediations are in `audit/06-fixes.md`. No production deploy, commit, or live charge has been made.

## 1. Executive summary

| Question | Answer |
|---|---|
| Does cash reconcile? | Yes at the booking level: `total_paid − total_refunded` and the sum of ledger rows agree in every executed scenario. |
| Does the allocation reconcile to the cent? | **No.** Sequential partial refunds leave non-zero platform-fee / provider-earnings / VAT residuals on fully-refunded bookings (F2-06, exact numbers in `04 §2`). Refund deletion/cancellation leaves ledger reversals orphaned (F2-51/54). The reconciliation RPCs report zero drift while this is the case (F4-07). |
| Can providers be paid? | **Not via the app on the audited schema.** `insert_payout_request_guarded` raises a type error on every call; function body identical on staging (F4-02). Production UNVERIFIED. |
| Are gateway refunds recorded? | **No** for any refund carrying `payment_id` (Stripe, Yoco, card-machine, chargebacks, group-guest): a unique index collides with the refund ledger trigger and the refund never reaches `completed` (F4-03). Provider-app refunds (unlinked) are unaffected. |
| Can money be mutated without authorisation? | **Yes.** Anyone with the public anon key can rewrite `finance_transactions.fees` and post GL entries (F2-61); staff with no finance permission can insert/update/delete refunds (F2-01); customers can set their own additional charges to R0.01/paid (F2-02); any authenticated user can reserve another customer's gift card (F2-23). Root cause: hosted default EXECUTE privileges never revoked (F4-05). |
| Can a non-owner become owner? | **Yes**, three ways (F3-12, F3-13, F3-15), executed against the real handlers. |
| Secrets | One committed Paystack **test** secret in a doc + git history (F-01). Env values for Paystack secret/webhook returned by an admin GET when settings row is absent (F2-62). Twilio/email credentials stored plaintext (F3-24). |
| Schema reproducibility | Migrations do not replay from scratch in any order (F4-01); staging reached incrementally. |
| Tests | Mobile 544/544 pass; web 4 843/4 844 pass (one environmental timeout, passes in isolation). No DB-level test exists for any money invariant (F-03); all ledger tests mock the DB, which is why F4-02/F4-03 are invisible to CI. |

Counts: **2 Critical · 19 High · 44 Medium · 49 Low** (114 rows; 25 confirmed by execution, 0 refuted).

## 2. Severity scale

| Severity | Meaning |
|---|---|
| Critical | Money loss/exposure or secret exposure exploitable now with no precondition |
| High | Wrong money allocation, unguarded money mutation, privilege escalation, or a money flow that cannot complete |
| Medium | Integrity/control gap that needs a precondition, a misconfiguration, or an insider |
| Low | Hygiene, defence-in-depth, consistency, display |

Effort: **S** ≤ ½ day · **M** 1–3 days · **L** > 3 days (incl. data backfill or migration squash). Fix column is a sketch, not a design.

## 3. Findings

### 3.1 Critical

| ID | Severity | Area | Description | Evidence | Impact | Fix | Effort |
|---|---|---|---|---|---|---|---|
| F-01 | Critical | Secrets | Paystack test-mode secret key committed in a prior audit document and in git history; original migration already remediated | `docs/audits/COMPREHENSIVE_TECHNICAL_AUDIT_2026-04.md:890`; `supabase/migrations/403_…sql:1-24` | Test-mode only, but ground rule 3 + history exposure | Rotate key in Paystack dashboard; remove line; add secret scanning to CI | S |
| F2-61 | Critical | DB grants | `post_gateway_fee_delta` is SECURITY DEFINER, EXECUTE to `anon`/`authenticated`, no auth check | Executed: anon set `fees=999.00` on a ledger row (`04 §3` T2.4) | Anyone with the public anon key rewrites fees and posts GL journals for any row | `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; require service_role or an explicit permission check | S |

### 3.2 High

| ID | Severity | Area | Description | Evidence | Impact | Fix | Effort |
|---|---|---|---|---|---|---|---|
| F4-02 | High | Payouts | `insert_payout_request_guarded` inserts `COALESCE(p_payout->>'status','pending')` (text) into `payouts.status` (`payout_status` enum) → SQLSTATE 42804 | Executed locally; staging body hash identical, column type identical (`04 §2` T1.16) | `POST /api/provider/payouts` 500s for every provider; no payout requests possible | `::payout_status` cast; DB-level test | S |
| F4-03 | High | Refund ledger | Unique index `ux_finance_transactions_source_payment_per_type (source_payment_id, transaction_type)` (mig. 489) collides with `create_finance_ledger_from_booking_refund`, which writes several `refund` rows with the same `source_payment_id` | Executed: duplicate-key error on `UPDATE … status='completed'` for a linked refund (`04 §2` T1.15); index + trigger identical on staging | Stripe/Yoco/card-machine/chargeback/group-guest refunds never complete; gateway money out, ledger and booking unchanged | Drop or widen the index to include `transaction_category`; idempotency already covered by `ux_…source_refund_component` | S |
| F2-06 | High | Arithmetic | Sequential partial refunds mis-allocate components (`v_total` denominator mixes `total_amount+cancellation_fee` and `total_paid+total_refunded`) | Executed: fully refunded 333.33 leaves platform_fee +2.42, provider_earnings −9.12, tax +6.70; 3×111.11 → +3.25/−12.25/+9.00 (`04 §2` T1.1c, T1.2) | Provider over-clawed, platform retains fee/VAT on refunded sales, VAT over-declared; error grows with refund count | Allocate refund against *remaining* component balances (component net ÷ remaining paid) | M |
| F2-01 | High | RLS | `booking_refunds` `FOR ALL` policy for owner **and staff**, no `WITH CHECK`; grants to `authenticated` | Executed: `view_calendar`-only staff inserted/updated/deleted refunds (`04 §3` T2.1) | Route permission checks and caps bypassed | Split policy: SELECT for staff; write only via service role; drop `authenticated` I/U/D grants | S |
| F2-02 | High | RLS | Customer UPDATE policy on `additional_charges` without column restriction | Executed: customer set `amount=0.01, status='paid'` (`04 §3` T2.2) | Customer self-settles charges | Restrict policy to SELECT; writes via API only | S |
| F2-22 | High | Validation | `validate_refund_amount`: booking-level over-refund is WARNING only when `payment_id` is NULL | Executed: 400.00 refund on 333.33 accepted, `total_refunded > total_paid` (`04 §2` T1.3b) (Phase 2: Medium → High) | Combined with F2-01/F2-33, over-refund is reachable | Hard-fail when `total_refunded + NEW.amount > total_paid` for completed refunds | S |
| F2-23 | High | Auth | `reserve_gift_card_redemption` callable by any authenticated user against any booking/card | Executed: customer B reserved A's card against A's booking (`04 §3` T2.3) (Phase 2: Medium → High) | Balance lock-up, code-validity oracle | Check card owner / booking customer = `auth.uid()`; revoke `anon` | S |
| F2-31 | High | Ledger | Payment/tip/staff-line ledger triggers swallow exceptions (fail-open) | Executed: payment committed `paid`, 0 ledger rows, 1 `reconciliation_exceptions` row; no push alert (`04 §2` T1.13, §8 T7.7) (Phase 2: Medium → High) | Money accepted with no ledger; detection depends on someone opening the admin page | Fail-closed for `finance_transactions`; or alert on `source='ledger'` exception insert | M |
| F2-08 | High | State machine | `charge.success` after cancellation not guarded in Paystack webhook | `charge-success.ts:884-1088` [SV] | Cancelled booking becomes `paid`, ledger posted, no auto-refund | Reject/auto-refund when booking status is terminal | M |
| F2-16 | High | State machine | Failed-then-success: status-agnostic `payment_transactions` lookup lets late `charge.success` mark a cancelled booking `paid` | `charge-success.ts:912-917` [SV]; no test | As F2-08 | Filter lookup by status; test | S |
| F2-21 | High | Payouts | Flutterwave `transfer.failed` sets status but posts no ledger reversal | `flutterwave-transfer-webhook.ts:113-116` | Provider balance permanently understated | Reverse `payout` ledger row on failure (as Paystack path does) | S |
| F2-24 | High | Reporting | Provider VAT report selects without `transaction_type` then filters on it → `vat_collected` always 0; test masks it | `vat-reports/route.ts:122,184-199` [SV] | Wrong VAT figures shown in app | Add column to select; fix test | S |
| F2-30 | High | Webhooks | Flutterwave webhook: no lease, random `eventId` fallback, unsigned bypass outside production, non-constant-time compare | `04`/`02 §8.1` [T:A] | Replay / forged events | Use the shared lease RPC; require signature everywhere; `timingSafeEqual` | S |
| F2-63 | High | DB grants | `recognize_period_revenue`, `recognize_ads_spend_delta` SECDEF, EXECUTE to `anon` | Executed: anon call succeeded (`04 §3` T2.5) (Phase 2: Medium → High) | Arbitrary revenue-recognition postings | Revoke; service_role only | S |
| F2-64 | High | DB grants | `void_/capture_gift_card_redemption_for_sale` SECDEF, EXECUTE to `anon`, no ownership | Executed: anon call succeeded (`04 §3` T2.6) (Phase 2: Medium → High) | Restore/capture any POS gift-card redemption | Revoke; ownership check | S |
| F2-66 | High | DB grants | `revoke_all_user_sessions`, `revoke_user_sessions_by_ids`, `brand_clear_user_references`, `claim_/finish_cron_run` EXECUTE to `anon` | Executed: anon reached `revoke_all_user_sessions` body (`04 §3` T2.8) (Phase 2: Medium → High) | Log out any user; interfere with cron leases | Revoke | S |
| F3-12 | High | Privilege escalation | `POST /api/provider/staff` (gated `manage_team`) maps client role → `provider_staff.role='owner'` with all permissions; PATCH has the guard, POST does not | Executed: 200, insert payload `role:"owner"` (`04 §4` T3.15) | Manager creates a full owner (payouts, bank accounts, refunds) | Owner-only guard on `role==='owner'`; step-up | S |
| F3-13 | High | Privilege escalation | `PATCH staff/[id]/settings` passes `is_admin` through for `manage_team` editors | Executed: 200 with `is_admin:true` in update (`04 §4` T3.16) | Any manager grants admin | Strip `is_admin` unless caller is owner | S |
| F3-15 | High | Privilege escalation | `POST/PATCH /api/provider/roles*` accept permission maps the caller does not hold | Executed: role stored with `manage_finance, issue_refunds, process_payments` by `manage_team`-only caller (`04 §4` T3.17); self-assignment path via `role_id` setter UNVERIFIED | Finance permissions minted by non-finance staff | Ceiling = caller's permissions; step-up | S |

### 3.3 Medium

| ID | Severity | Area | Description | Evidence | Impact | Fix | Effort |
|---|---|---|---|---|---|---|---|
| F4-01 | Medium | Schema / DR | `supabase/migrations` does not replay from scratch (lexicographic: 105 failures; numeric: 65, 1 after retry); an out-of-order replay silently reverted `update_booking_payment_status` | `04 §1` build table, `apply*.log` | No reproducible environment; schema drift undetectable | Baseline snapshot + forward-only migrations; CI check for monotonic prefixes | M |
| F4-04 | Medium | Group bookings | Participant `price` and `travel_fee` client-supplied, only clamped ≥ 0 | `group-bookings/route.ts:469-508` [SV] | Under-priced group bookings | Server-side recompute from offerings/travel settings | S |
| F4-05 | Medium | DB grants | Hosted default privileges: `anon` EXECUTE on 1 058/1 256 public functions (54 SECDEF), `authenticated` on 1 113; no migration revokes | Staging catalog, `04 §1`; e.g. `977_….sql:172` grants only | Root cause of F2-61/63/64/65/66 and future regressions | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; one-off sweep; CI assertion | M |
| F4-07 | Medium | Reconciliation | Reconciliation RPCs only compare `finance_transactions` ↔ `journal_*`; no check of component nets vs booking state or of orphaned `source_refund_id` | `04 §8` T7.5–T7.6: zero drift reported with F2-06/F2-51 present | False assurance | Add booking-level and parent-existence checks | S–M |
| F2-65 | Medium | DB grants | `brand_reset_tenant_data` SECDEF, EXECUTE to `anon` | Executed; only `brand_*` tables affected (`04 §3` T2.7) (Phase 2: High → Medium) | Anon wipes a tenant's brand module | Revoke | S |
| F2-12 | Medium | State machine | Booking status guard trigger exempts `service_role`; API uses service role → never enforced | Executed (`04 §2` T1.12) | Only app-level transition checks exist | Enforce in trigger for all roles, or move to a single app transition function with tests | M |
| F2-51 / F2-54 | Medium | Refunds | DELETE or `completed→cancelled` on `booking_refunds` leaves ledger reversals in place while booking totals recompute | Executed: 6 orphan rows, booking back to `paid` (`04 §2` T1.9) | Ledger and booking disagree | Trigger to reverse/delete ledger rows on refund delete/cancel; or forbid DELETE | S |
| F-03 | Medium | Tests | `supabase/tests/money_flows.sql` has no assertions; no DB-level money invariant test | `supabase/tests/money_flows.sql:1-35` | F4-02/F4-03 class defects invisible to CI | pgTAP or SQL harness run against a built DB in CI | M |
| F-04 | Medium | Arithmetic | Rounding defined in ≥6 local copies + ~90 inline sites | `01 §3.1` | Inconsistent cents (see F4-06) | Single helper (`percentOf`/minor-unit math) | M |
| F-05 | Medium | Units | `provider_yoco_payments.amount` BIGINT cents vs NUMERIC rands elsewhere | `127_yoco_integration_tables.sql:61,227` | Unit-mixing hazard | Normalise or name column `amount_cents` + helper | M |
| F-06 | Medium | Webhooks | Flutterwave select-then-insert (no lease); PayCloud no global idempotency, 200 on bad signature; Yoco no dedupe pre-check | `01 §1.2` | Duplicate processing window | Shared lease RPC everywhere | S |
| F-07 | Medium | Money input | `charge-saved-card`, `paystack/initialize` accept `body.amount` on some branches; `request-payment` unbounded | `01 §3.3` | Client-influenced charge amounts | Derive from entity; bound | S |
| F2-03 | Medium | Idempotency | No unique `booking_payments` index for Stripe/Flutterwave; select-then-insert | `record-booking-stripe-payment.ts:40-45` | Duplicate `total_paid` under concurrent webhooks | Unique index on gateway reference | S |
| F2-07 | Medium | Tips | Allocations `ROUND(tip×share,2)` with no residual fix (100.00 → 99.99); second tips never allocated | `220:83-111` | Cents lost; later tips unallocated | Largest-remainder; allocate per tip row | S |
| F2-09 | Medium | Audit | Payout-account changes not audit-logged | `02 §4` | No trail on bank changes | `writeAuditLog` | S |
| F2-10 | Medium | Auth | Step-up on bank-account change default off | `provider-security.ts:25-32` | Account takeover → payout redirection | Default on | S |
| F2-15 | Medium | Disputes | Dispute amount unit heuristic `n ≥ 1000 ⇒ minor` | `paystack-dispute-lifecycle.ts:59`, `flutterwave-dispute-handler.ts:11` | Wrong reserve for small/large disputes | Use gateway-documented units | S |
| F2-17 | Medium | Config | `apps/provider/.env.local`, `apps/customer/.env.local` point at production project | `02 §0` | Dev runs against prod | Point at staging | S |
| F2-20 | Medium | Controls | No dual control payout approve → transfer | `02 §4` | Single admin moves money | Maker-checker | M |
| F2-25 | Medium | Validation | Additional charge `amount: z.number().positive()`, no max/scale | `02 §6.1` | Absurd charges | Bound + 2dp | S |
| F2-26 | Medium | Refunds | No Flutterwave refund webhook handler | `02 §5.1` | Gateway refunds unrecorded | Implement | M |
| F2-27 | Medium | Disputes | Flutterwave/Stripe closed disputes don't set `payment_disputes.provider_id` | `02 §5.3` | No payout reserve | Set provider from booking | S |
| F2-32 | Medium | Security | `finance_audit_run` arbitrary SELECT executor (service_role) | `724:15-38` | Data exfil if service key leaks | Allow-list queries | S |
| F2-33 | Medium | Refunds | Paystack/Stripe refund webhooks insert gateway amount as `completed` with no remaining-balance cap | `02 §5.1` | Over-refund recorded (now also blocked by F4-03 when linked) | Cap to remaining paid | S |
| F2-35 | Medium | IDOR | Yoco create with bare `entity_type/entity_id` skips amount/ownership guards | `yoco/payments/route.ts:427-435` | Charge against another entity | Resolve + authorise entity | S |
| F2-39 | Medium | VAT | `provider_vat_number_snapshot` never written for bookings/orders | `02 §7` | Invoices lack VAT number at time of sale | Write snapshot on create | S |
| F2-40 | Medium | GL | `recompute_journal_for_finance_tx` bypasses wrapper routing → suspense | `510:250-276` vs `977:175-208` | GL misposting on recompute | Route through wrapper | S |
| F2-42 | Medium | Invoices | `generateProviderInvoice` never computes line items | `generate-provider-invoice.ts:116-125` | Zero-value invoices | Build lines from ledger | M |
| F2-44 | Medium | Invoices | Issued invoices mutable by superadmin PATCH; no DB immutability | `provider/invoices/[id]/route.ts:159-218` | Tampering with issued documents | Trigger: block update after `issued` | S |
| F2-48 | Medium | Controls | Superadmin posts manual adjustments directly; no upper bound | `admin/finance/adjustments/route.ts:69,109-117` | Unbounded single-actor postings | Maker-checker + cap | M |
| F2-53 | Medium | Payroll/tips | AFTER-trigger alphabetical order: staff lines read tip allocations before they are written | `866:207-215`, `939:53-56`, `220:122-126` | No staff tip lines for first tip (runtime UNVERIFIED) | Rename/merge triggers | S |
| F2-57 | Medium | Refunds | Provider refund route: finalize error after wallet credit → wallet credited, refund not completed | `provider/bookings/[id]/refund/route.ts:679-686` | Double exposure on retry | Single transaction / compensating action | M |
| F2-60 | Medium | Commission | Paystack Terminal base allocation: 0 commission and payout-eligible; add-ons via same route take full commission | `allocation/route.ts:182`, `available-payout-balance.ts:89-95` | Inconsistent commission | Decide and align | S |
| F2-62 | Medium | Secrets | `admin/settings` GET returns env `PAYSTACK_SECRET_KEY`/`PAYSTACK_WEBHOOK_SECRET` inside defaults when no settings row | `admin/settings/route.ts:269,275,517-518` | Secret disclosure to admins / logs | Never echo env secrets | S |
| F2-68 | Medium | Audit | Five admin money mutations without `writeAuditLog` | `02 §8.6` | No trail | Add logging | S |
| F2-72 | Medium | Auth | `paystack/transfers*`, `splits`, `transfer-recipients*` outside admin MFA/session-age path | `02 §8.6` | Weaker control on transfer routes | Route through admin guard | S |
| F3-01 | Medium | Validation | Product `retail_price`/`supply_price`/`tax_rate` unbounded; no CHECK | Executed: `-5 / -2 / 150` inserted (`04 §4` T3.20) | Negative prices into orders/inventory | Zod bounds + CHECK | S |
| F3-02 | Medium | Authz / spend | Campaign PATCH/DELETE/send/test-send role-only; send debits marketing credits | `campaigns/[id]/…` | Any staff spends credits | `manage_marketing` | S |
| F3-06 | Medium | Money input | POS `POST /api/provider/sales` trusts client `subtotal`, `unit_price`, `discount_amount`, `tip_amount`, `payment_status` | `provider/sales/route.ts:563,615-623,683-694` | Falsified sales/VAT/commission reporting | Server-side recompute | M |
| F3-07 | Medium | Authz | Role-only writes to payment settings, ads campaigns/checkout, PayCloud terminals, Yoco devices | `settings/payments/route.ts:38-41,197`; `ads/campaigns/route.ts:270`; `paycloud/terminals/route.ts:25,121` | Any staff changes money settings / commits ad funds | Permission gates | S |
| F3-10 | Medium | Payroll input | Shifts and time-clock routes role-only | `provider/shifts/route.ts:310`, `time-clock/clock-in/route.ts:16` | Staff edit colleagues' hours | `manage_team` | S |
| F3-14 | Medium | Privilege escalation | `manage_team` staff self-assign `manager` preset | `staff/[id]/route.ts:320-346,459-462` | Gains finance permissions | Block self-edit of role | S |
| F3-21 | Medium | Payroll config | Commission rates `Number(x)` unbounded; no CHECK on `provider_staff` | `settings/team/commissions/route.ts:232-247,273-281` | Pay miscalculation | Bounds + CHECK | S |
| F3-24 | Medium | Secrets at rest | Twilio `auth_token`, email `api_key/api_secret` stored plaintext | `twilio-integration/route.ts:162-166`, `email-integration/route.ts:163-167` | DB read = credential leak | Encrypt (pgsodium/app-level) | M |

### 3.4 Low

| ID | Severity | Area | Description | Evidence | Impact | Fix | Effort |
|---|---|---|---|---|---|---|---|
| F-02 | Low | Config | Web client falls back to `placeholder.supabase.co` + placeholder JWT (not a credential) | `apps/web/src/lib/supabase/client.ts:19-24` (Phase 2 resolution) | Silent misconfig | Throw if env missing | S |
| F-08 | Low | Hygiene | Untracked ignored credential files on workstation | `git check-ignore -v` | None in repo | Note only | — |
| F-09 | Low | Tests | No device E2E, no property tests, no coverage thresholds; orphaned `jest-setup.js` | `01 §5` | Gaps | Add thresholds | M |
| F4-06 | Low | Arithmetic | Float-then-round (`Math.round(x*100)/100`, `roundCurrency`) ≠ PG `ROUND` in 0.27 % of fee computations; `percentOf` matches exactly | Executed 500 000 trials (`04 §6`) | 1c API-vs-ledger drift on ~1/370 bookings | Use `percentOf` everywhere DB recomputes | S |
| F2-04 | Low | Idempotency | `paycloud_webhook_events`, `provider_yoco_webhook_events` no UNIQUE | `02 §1.3` | Duplicates | Add unique | S |
| F2-05 | Low | Arithmetic | Commission base TS float vs trigger `NUMERIC(10,6)` → 1c divergence on 0.5 % | `02 §2.2` | Noise | As F4-06 | S |
| F2-11 | Low | DB grants | Internal SECDEF helpers (`_shadow_replay…`, `log_finance_ledger_trigger_failure`) EXECUTE to `anon` | Executed: callable, write not reproduced (`04 §3` T2.9) (Phase 2: Medium → Low) | Noise/abuse | Revoke (covered by F4-05) | S |
| F2-13 | Low | Validation | `validate_booking_total` accepts tax-exclusive or VAT-inclusive totals ±0.01 | Executed: arbitrary total rejected (`04 §2` T1.11) (Phase 2 note; stays Low) | Ambiguity | Single formula | S |
| F2-14 | Low | Deploy | `1027` `v_pf := 0` guard for provider-sourced bookings not in live trigger | Executed: `platform_fee` row on provider-sourced cash booking (`04 §2` T1.4); API static test asserts fee never set on that path (Phase 2: High → Low) | Latent only | Re-apply guard | S |
| F2-18 | Low | Idempotency | `wallet_topup` ledger dedupe keyed on `description` | `02 §1.3` | Fragile | Key on reference | S |
| F2-19 | Low | UX | Payout `INVALID_AMOUNT` surfaces as 500 | `02 §4` | Confusing | Map to 400 | S |
| F2-28 | Low | Disputes | Provider never notified of disputes | `02 §5.3` | Ops | Notify | S |
| F2-29 | Low | Idempotency | No unique on `booking_refunds.refund_provider_id` | `02 §5.1` | Duplicate gateway refunds | Unique partial index | S |
| F2-34 | Low | Discounts | Provider-create honours client `membership_discount_amount` | `provider/bookings/route.ts:1556-1558` | Staff-set discount | Recompute | S |
| F2-36 | Low | Units | cents↔rands `/100` hard-coded; mixed units in Yoco | `yoco/webhook/route.ts:584,619` | Hazard | Helper | S |
| F2-37 | Low | Webhooks | PayCloud DB lookups before signature; 200 on invalid | `paycloud/webhook/route.ts:21-102` | Enumeration | Verify first; 401 | S |
| F2-38 | Low | VAT | Two inclusive-VAT implementations with different rounding order | `computeVat.ts:30-35` vs `vat-inclusive-breakdown.ts:26-27` | 1c differences | Unify | S |
| F2-41 | Low | Receipts | Subscription receipt recomputes VAT at render with current rate | `subscription-receipt-pdf.ts:131-134` | Historical receipts change | Snapshot rate | S |
| F2-43 | Low | Invoices | Numbers not gap-free | `insert-with-invoice-number.ts:14-43` | SARS sequence expectations | Sequence table | M |
| F2-45 | Low | GL/FX | `revert_journal_for_finance_tx` hard-codes `'ZAR'` | `728:331` | FX rows | Use row currency | S |
| F2-46 | Low | Subscriptions | Two live entitlement RPCs with differing grace | `286` vs `10101` | Inconsistent access | Remove one | S |
| F2-47 | Low | Webhooks | `subscription.*`/`invoice.*` errors ack 200 | `webhook/route.ts:468` | Lost events | 500 on failure | S |
| F2-49 | Low | Period locks | Not enforced on DELETE, `journal_*`, `payouts`, `payment_transactions`, NULL-tenant | `492` | Back-dated edits | Extend trigger | S |
| F2-50 | Low | Period locks | App guard fails open on query error | `period-lock.ts:51-61` | Bypass on outage | Fail closed | S |
| F2-52 | Low | IAP | `APPLE_IAP_VERIFY_JWS` env kill-switch disables verification | `jws.ts:67-70` | Misconfig risk | Remove in prod | S |
| F2-55 | Low | Wallet | `wallet_debit_self` no idempotency key | `376:206-259` | Double debit on retry | Add key | S |
| F2-56 | Low | DB grants | `recognize_gift_card_breakage` invoker-rights, PUBLIC EXECUTE | [DB] | Noise | Revoke | S |
| F2-58 | Low | Auth | PayCloud refund requires `process_payments` not `issue_refunds` | `paycloud/payments/[id]/refund` | Wrong gate | Fix permission | S |
| F2-59 | Low | Reconciliation | Manual mark-paid accepts any `reference` labelled `yoco` | `additional-charges/[chargeId]/mark-paid/route.ts:148-167` | Fake references | Validate against Yoco | S |
| F2-67 | Low | Authz | `admin/bookings/[id]/refund` gated by Providers-Ops not Finance | `route.ts:24` | Wrong section | Fix gate | S |
| F2-69 | Low | POPIA | Full gateway payloads persisted (Yoco/PayCloud); raw phone logged | `provider/clients/create/route.ts:125` | PII at rest/in logs | Redact | S |
| F2-70 | Low | Idempotency | HTTP idempotency key not scoped by user | `lib/http/idempotency.ts:59-64` | Cross-user replay | Scope key | S |
| F2-71 | Low | Auth | `me/memberships/purchase` bypasses `requireRoleInApi` | `route.ts:25-31` | Inconsistent | Add guard | S |
| F3-03 | Low | Authz | Packages POST/DELETE role-only; add-ons/resource-groups owner-only | `packages/route.ts:202-214` | Inconsistent | Align | S |
| F3-04 | Low | Authz | ~20 role-only mutations where siblings use permissions | `appendix/03-matrix-G1/G3/G4` | Inconsistent | Align | M |
| F3-05 | Low | Validation | Promotion PATCH allows 500 % discount | `promotions/[id]/route.ts:172-181` | Mispriced | Bound | S |
| F3-08 | Low | Functional | Sales settings GET owner-only while PATCH is `edit_settings` → 403 on load | `settings/sales/taxes/route.ts:24,72` | Broken screen for staff | Align | S |
| F3-09 | Low | Money input | Ads CPC `budget` client-supplied, no floor/ceiling | `ads/campaigns/route.ts:311,358` | Odd charges | Bound | S |
| F3-11 | Low | Abuse | Unauthenticated Mapbox routes | `location/validate/route.ts:40`, `mapbox/reverse-geocode/route.ts:24` | Cost abuse | Auth + rate limit | S |
| F3-16 | Low | Dead UI | Time-off-types CRUD always 409 | `time-off-types/route.ts:97-101` | Broken feature | Remove or implement | S |
| F3-17 | Low | Display | Terminal `collection_intent` echoes client `expected_amount` | `paystack-terminal-provider-mobile-api.ts:482-552` | Display only (allocate caps) | Derive | S |
| F3-18 | Low | Identity | `PATCH /api/me/profile` writes `phone` without resetting `phone_verified` | `me/profile/route.ts:387,449-454` | Unverified phone | Reset flag | S |
| F3-19 | Low | Auth | Password change without current password when policy flag false | `me/password/route.ts:46-52,102-123` | Weaker for customers | Default true | S |
| F3-20 | Low | POPIA | Invitee email/user ids logged; invite token in error body | `staff/route.ts:481,512,594,672`; `staff/[id]/invite/route.ts:165-175` | PII in logs | Redact | S |
| F3-22 | Low | Validation | Cancellation policy percentage no `max(100)`, `hours_before` unbounded | `cancellation-policies/route.ts:13-16` | Odd fees | Bound | S |
| F3-23 | Low | Validation | Appointment SLA/expiry minutes unvalidated | `settings/appointments/route.ts:89-126` | Auto-expiry misfire | Bound | S |
| F3-25 | Low | Compliance | Self-declared DOB lifts age locks | `me/profile/route.ts:396-400`; `age-band.ts:71-78` | Age assurance weak | Policy decision | S |
| F3-26 | Low | Ops | `verifyCronRequest` uses `!==` | `lib/cron-auth.ts:23` | Timing side-channel (low practical) | `timingSafeEqual` | S |
| F3-27 | Low | Tests | ~1 in 8 provider routes tested; none for sales POST, PayCloud payments, terminal allocate, pay-runs, staff role mapping | appendix | Regressions | Add route tests | M |

## 4. Recommended order

| Step | Findings | Why first |
|---|---|---|
| 1 | F-01 (rotate), F2-61, F2-63, F2-64, F2-66, F2-65, F2-11, F2-56 → via F4-05 default-privilege revoke | One migration closes every anon-callable function; zero product impact |
| 2 | F4-02 | Payouts are broken; one-line cast |
| 3 | F4-03 | Gateway refunds are broken; one index change |
| 4 | F3-12, F3-13, F3-15, F3-14 | Privilege escalation; small route guards |
| 5 | F2-01, F2-02, F2-23 | RLS/RPC money mutation |
| 6 | F2-06 + F4-07 | Fix allocation and add the check that would have caught it |
| 7 | F2-22, F2-33, F2-51/54, F2-31 | Refund integrity |
| 8 | F4-01, F-03 | Make the schema reproducible and testable so the above stays fixed |

## 5. Assumptions

| # | Assumption |
|---|---|
| A1 | Staging schema (`byfz****`) is representative of production. Every `[DB]`/executed claim was verified on staging or on a local build whose key function bodies hash-match staging; production was never read. |
| A2 | `platform_settings` is empty on prod as on staging (commission disabled, 0 %, fixed R15 fee). If prod has commission enabled, F2-06 residuals also include commission (Phase 2 §2.3 worked example: provider over-clawed R15.82 at 15 %). |
| A3 | The provider app's refund path never sends `payment_id` (verified in code); if any mobile build does, F4-03 also affects it. |
| A4 | Default privileges on the hosted project have not been changed by hand since the staging catalog was read (2026-11-08/09). |
| A5 | Vercel cron, webhook and gateway secrets are configured per environment; no live gateway call was made. |
| A6 | Severity reflects the audited schema; where a finding is fixed on prod but not staging it would show as a false positive — none such were identified. |

## 6. UNVERIFIED

| Item | Reason | Resolve by |
|---|---|---|
| Production parity for F4-02, F4-03, F2-61/63/64/65/66, F2-14 (live trigger body) | Rule 2: no prod access used | One read-only `pg_catalog` query on prod (approval required) |
| Whether payouts / gateway refunds are currently failing in prod | No prod data or logs | Prod `payouts` and `booking_refunds` counts; Sentry `42804` / `23505` on the two routes |
| `platform_settings` on prod (A2) | Prod data | Read-only `SELECT` |
| F3-15 self-escalation via `provider_staff.role_id` | `rg role_id apps/web/src/app/api/provider`: the API only ever sets `role_id = null` (`staff/[id]/route.ts:463`, `staff/[id]/permissions/route.ts:241`); no route assigns a role id | Escalation path therefore requires a DB-direct write or a future setter; High stands because minted roles with finance permissions persist |
| F2-53 trigger ordering at runtime | Resolved locally | `20_ledger_integrity.test.sql` inserts a 100.00 tip, asserts 3 allocations summing to 100.00, and asserts `aab_create_tip_allocations_on_tip` sorts before the staff-lines trigger. Passed in the post-`10143` local audit run (`06-fixes.md`) |
| T1.5–T1.8 tips | Resolved locally | F2-07 in `20_ledger_integrity.test.sql`: 3 allocations sum to 100.00. Passed post-`10143` | 
| T4.1 Paystack double-submit | Resolved locally | `20_ledger_integrity.test.sql`: second capture with the same `payment_provider_id` raises unique_violation; 1 row remains. Rolled back |
| T1.10 cancellation-fee settlement | Resolved locally | Refund of paid − fee leaves recognized components equal to the fee (50.00 on a 333.33 sale). A second `cancellation_fee` row doubled that to 100.00, so settlement no longer posts it |
| T3.3–T3.14, T3.18, T3.19, T3.22–T3.24 route tests | Resolved locally | `04 §4`: VAT, webhook signature/lease, refund cap, payout reversal, PayCloud 401, admin secret redaction, amount bounds, payout 400, wallet revert, server membership discount, Yoco ownership, invoice 500, POS totals, shift/`edit_settings` gates, group catalogue prices, Paystack verify writes only after gateway success |
| Mobile ↔ API contract (T6.2–T6.4) | Needs running API + simulator | Expo dev build against local stack |
| Pay-run detail visible to non-payroll staff | Resolved locally | `GET /api/provider/pay-runs/[id]` filters items to the caller when `userCanManagePayroll` is false and nulls salon `total_*` fields. `get-own-items.test.ts` 2/2 |
| `633_…` migration | Bare image `auth.users` shape | Real Supabase stack |
| Live gateway behaviour (Paystack/Stripe/Yoco/Flutterwave/PayCloud/IAP), transfer retry semantics | No sandbox credentials; rule 2 | Sandbox keys + webhook replay |
| `reconciliation-investigator` agent active in prod; any alerting on `reconciliation_exceptions` | Prod config | Read-only `agent_definitions` |
| Admin MFA / session-age enabled in prod | DB-controlled | Prod read |
| PII content of persisted Yoco/PayCloud payloads | No rows on staging | Prod sample with masking (approval) |
| Payroll (PAYE/UIF) and revenue-recognition correctness vs policy | No finance policy document found; code-as-spec | Finance sign-off |
| Full web Vitest final count | Resolved: 1 096 files, 5 215 / 5 215, plus account-status 5/5 (`06-fixes.md`) | — |

## 7. Fixing

Per the brief, fixes are applied only to findings you name, one at a time, each with a test that fails before and passes after, and no commit/push without approval. Suggested first request: "fix F4-02" (one-line migration + a DB-level test using the local audit container), then "fix F4-03".
