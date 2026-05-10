# Platform Readiness Memo — 2026-05-10

## Verdict

| Engine | Verdict | Notes |
| --- | --- | --- |
| Accounting | Amber | Local ledger/payment tests and release gates pass. Prod DB drift audit is blocked because `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not available in this shell. |
| Availability | Amber | Added timezone-sensitive calendar-block and pre-payment revalidation coverage. Staging manual matrix and k6 availability load remain unrun because staging access and `k6` are unavailable locally. |
| Booking | Amber | Added pending-payment lifecycle writer/sync, bulk transition enforcement, webhook dispatch integration, and custom-offer traceability tests. Staging cross-app parity remains unrun. |

## Automated Artifacts

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm release:check` | Pass | Ran after all Phase 3 edits; typecheck, lint, and tests passed. |
| `pnpm audit:multi-tenant:strict` | Pass with review list | Strict non-admin route heuristic passed; admin tenant audit still lists 5 admin files for review. |
| `pnpm audit:routes` | Pass | Regenerated `docs/audit/ROUTES_WEB.md`, `docs/audit/ROUTES_CUSTOMER.md`, `docs/audit/ROUTES_PROVIDER.md`. |
| `pnpm verify:cron-schedule` | Pass | 25 crons, 25 handler dirs. |
| `pnpm prod:gameday:checklist` | Pass/display | Checklist printed payment, DB, cron, and notification outage drills. |
| `pnpm prod:verify:release` | Fail | Fails at `scripts/prod/verify-observability-gates.mjs`: `NEXT_PUBLIC_SENTRY_DSN` missing. Runtime probes also skipped with `fetch failed`. |
| `node scripts/prod/audit-finance-ledger.mjs` | Blocked | Missing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. |
| k6 load suites | Blocked | `k6` command is not installed in this environment. |

## Code Readiness Changes

- `pending_payment` is now a real lifecycle state for new-card checkout after Paystack initialization; successful payment sync moves it to `confirmed` or `pending` based on provider confirmation settings.
- Provider bulk booking actions now use `isValidProviderBookingStatusTransition` before updating each row.
- Pre-payment slot revalidation now has tests for provider-local calendar blocks via the real `isProviderCalendarWindowBlocked` path.
- `@/lib/resources/assignment` is the canonical resource availability path; `@/lib/availability/resources` is a deprecated shim.
- The placeholder API integration test now exercises `charge.success` dispatch across booking, custom offer, wallet top-up, gift-card order, and second-charge paths.
- Custom-offer finalization now has a success-path assertion that every finance transaction description carries `[custom_offer:<id>]`.

## Known Issues / Blockers

| Severity | Item | Owner | Next step |
| --- | --- | --- | --- |
| High | Phase 1 prod drift audit not executed | Ops/eng with prod env | Provide read-only/prod service env, then run `node scripts/prod/audit-finance-ledger.mjs` and the SQL checks from the plan. |
| High | Manual staging matrices not executed | QA/eng | Execute `MANUAL_FINANCE_VALIDATION.md`, `MANUAL_BOOKING_FLOW_VALIDATION.md`, and `MANUAL_PAYOUT_REPORTING_VALIDATION.md` against seeded staging. |
| High | Load tests not executed | Eng/devops | Install `k6`, set staging target env, then run booking-flow, provider-calendar, webhook-storm, and soak-mixed. |
| High | `prod:verify:release` no-go | Devops | Set `NEXT_PUBLIC_SENTRY_DSN` and runtime target env; rerun `pnpm prod:verify:release`. |
| Medium | Cross-app parity not executed | QA/eng | Validate the 5 canonical bookings across customer RN, customer web, provider RN, provider web, PDFs, and admin. |

## Rollback Notes

- Migrations 582-585 are lower-risk to roll forward/fix because they primarily add/backfill payment, pricing, and loyalty-ledger behavior.
- Migrations 586-587 are high risk to roll back because 586 drops the legacy loyalty transaction table and 587 changes custom-offer message/finalization semantics.
- Any rollback must be dry-run separately against a staging clone first, with finance ledger and receipt parity checks rerun afterward.
