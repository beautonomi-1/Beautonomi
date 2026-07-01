# Documentation verification

Short record of checks run against the codebase to ensure docs are accurate. Last verification: **2026-07-01** (Enterprise Go-Live Hardening pass).

---

## Verified true

- **PLATFORM_FEATURES.md** – Customer and provider feature lists match app structure (tabs, account-settings, more menu). Customer account settings correctly list Profile details (no "Business" for customer).
- **ADDITIONAL_CHARGES_AND_PAYOUT_RULES.md** – Platform coverage and "See also" links (REDIRECTS_BY_PLATFORM, PROVIDER_WEB_VS_MOBILE_AUDIT) are valid. Model and payout rules align with implementation intent.
- **CUSTOMER_APP_REFERENCE.md** – Related docs (CUSTOMER_BOOKING_FLOW_AUDIT, ACCOUNT_SETTINGS_AUDIT, CUSTOMER_PROFILE_COMPLETION_AUDIT) exist. API usage map matches `apps/web/src/app/api` and customer app usage.
- **Support tickets API** – `GET /api/me/support-tickets` selects `ticket_number`. `POST /api/me/support-tickets/[id]/messages` exists for user replies. Implemented in `apps/web/src/app/api/me/support-tickets/`.
- **Internal links** – Sampled links in REDIRECTS_BY_PLATFORM, APP_SCREENS_API_WIRING, ADDITIONAL_CHARGES, CUSTOMER_APP_REFERENCE, AUDIT_REPORT, DEPLOYMENT_EAS, IOS_RELEASE_SUBMIT, store-compliance, and GLOBAL_EXPANSION_GUIDE point to existing docs.
- **GAPS_AND_IMPROVEMENTS** – "Done" items (getApiErrorMessage, useBookings/useCart caching, accessibility, invoice download) are reflected in the customer and provider codebases.

---

## Corrections made

1. **GAPS_AND_IMPROVEMENTS.md** – Support tickets section was outdated. Updated to state that `ticket_number` is included in `GET /api/me/support-tickets` and that `POST /api/me/support-tickets/[id]/messages` exists for user replies. Added a short "Status" column so remaining gaps (My tickets UI, ticket number in submit success) are clearly optional.
2. **CUSTOMER_APP_REFERENCE.md** – Account settings stack listed "business" (removed from customer app). Updated to "profile-details" and removed "business" so the route list matches current `apps/customer/app/(app)/account-settings/`.

---

## 2026-07-01 Refresh (Enterprise Go-Live Hardening)

### Additions verified

- **`docs/audits/cron-systems-audit.md`** — Regenerated from `apps/web/vercel.json` (38 entries, up from stale 14-entry version). All paths verified against route handlers via `pnpm verify:cron-schedule`.
- **`docs/MANUAL_FINANCE_VALIDATION.md`** — Refreshed with automated drift detection section referencing `.github/workflows/finance-drift.yml` and `supabase/migrations/724_finance_audit_run_rpc.sql`.
- **`docs/SCALE_SLO_GATES.md`** — k6 runbook section added, referencing `.github/workflows/load-test.yml` and `tooling/load-test/` scripts.
- **`docs/platform/admin-spa/ADMIN_CUTOVER_EXECUTION_REPORT.md`** — Updated to reflect SPA as default; legacy Next.js admin pages removed.

### Automated verification script

`docs/scripts/verify-documentation.mjs` — checks file path references in key doc files. Run with `node docs/scripts/verify-documentation.mjs`.

### Cron schedule CI check

`pnpm verify:cron-schedule` (`docs/scripts/verify-cron-schedule.mjs`) — validates all 38 cron paths in `vercel.json` have corresponding `route.ts` handlers. Runs in the `test` CI job.

---

## Recommendations

- **My tickets UI** – API is ready; adding a "My tickets" page (web) or screen (provider app) that calls `GET /api/me/support-tickets` and shows ticket number in submit success would complete the support-ticket flow described in GAPS_AND_IMPROVEMENTS.
- **Periodic re-check** – Re-run verification when adding or removing major routes/APIs or after large doc consolidations. Focus on: API route existence, account-settings and more-menu route lists, and "See also" / related-doc links.
- **Cron audit cadence** — Re-run `pnpm verify:cron-schedule` and update `docs/audits/cron-systems-audit.md` whenever a cron handler is added or removed.
