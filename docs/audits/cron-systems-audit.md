# Vercel Cron Systems Audit

**Date:** 2026-04-11
**Scope:** All Vercel cron jobs in the Beautonomi monorepo
**Auditor Role:** Principal Platform Reliability Auditor, Cron/Workflow Reviewer, Backend Systems QA Lead

---

## 1. Cron System Map

### Configuration Source

All cron jobs are configured in `apps/web/vercel.json` and target Next.js API route handlers under `apps/web/src/app/api/cron/*/route.ts`.

### Registered Cron Jobs (vercel.json — 14 entries after all fixes)

| # | Path | Schedule | Handler File | Purpose |
|---|------|----------|-------------|---------|
| 1 | `/api/cron/send-reminders` | `0 * * * *` (hourly) | `api/cron/send-reminders/route.ts` | Appointment + rebook reminders |
| 2 | `/api/cron/expire-booking-holds` | `*/5 * * * *` (every 5 min) | `api/cron/expire-booking-holds/route.ts` | Expire stale booking slot holds |
| 3 | `/api/cron/expire-on-demand-requests` | `0 2 * * *` (daily 02:00 UTC) | `api/cron/expire-on-demand-requests/route.ts` | Expire unclaimed on-demand requests |
| 4 | `/api/cron/execute-automations` | `0 6 * * *` (daily 06:00 UTC) | `api/cron/execute-automations/route.ts` | Marketing automation execution |
| 5 | `/api/cron/process-recurring-bookings` | `0 0 * * *` (daily midnight UTC) | `api/cron/process-recurring-bookings/route.ts` | Create next bookings from recurring series |
| 6 | `/api/cron/check-low-stock` | `0 8 * * *` (daily 08:00 UTC) | `api/cron/check-low-stock/route.ts` | Low stock product alerts |
| 7 | `/api/cron/ranking-recompute` | `0 4 * * *` (daily 04:00 UTC) | `api/cron/ranking-recompute/route.ts` | Provider quality score recomputation |
| 8 | `/api/cron/inactivity-retention` | `0 10 * * *` (daily 10:00 UTC) | `api/cron/inactivity-retention/route.ts` | User inactivity warnings + archival |
| 9 | `/api/cron/expire-message-attachments` | `30 3 * * *` (daily 03:30 UTC) | `api/cron/expire-message-attachments/route.ts` | Chat attachment storage cleanup |
| 10 | `/api/cron/expire-ads-campaigns` | `0 */2 * * *` (every 2 hours) | `api/cron/expire-ads-campaigns/route.ts` | Expire time/budget/pack ad campaigns |
| 11 | `/api/cron/expire-cancelled-subscriptions` | `0 1 * * *` (daily 01:00 UTC) | `api/cron/expire-cancelled-subscriptions/route.ts` | Transition cancelled/expired subscriptions + notify |
| 12 | `/api/cron/subscription-reminders` | `0 7 * * *` (daily 07:00 UTC) | `api/cron/subscription-reminders/route.ts` | Subscription expiry reminders (30/14/7/3/1 day) |
| 13 | `/api/cron/provider-stall-check` | `0 */4 * * *` (every 4 hours) | `api/cron/provider-stall-check/route.ts` | Onboarding stall/dropout classification |

### Cron-Adjacent Endpoints (not in vercel.json)

| Path | Auth | Purpose | Status |
|------|------|---------|--------|
| `/api/notifications/subscription-reminder/check` | `verifyCronRequest` | Subscription expiry reminders (30/14/7/3/1 day) | **STUB** — send functions are `console.log` placeholders |
| `/api/admin/provider-ops/run-stall-check` | `x-cron-secret` header | Onboarding stall/dropout classification | Not wired to Vercel cron; manual or external |
| `/api/provider/automations/execute` | Bearer CRON_SECRET | Automation execution engine | Called internally by cron #4 |

### Shared Auth Helper

`apps/web/src/lib/cron-auth.ts` — `verifyCronRequest()`:
- Checks `Authorization: Bearer <CRON_SECRET || INTERNAL_API_SECRET>`
- In production: logs unexpected user-agent (not `vercel-cron`)
- On Vercel: requires `x-vercel-id` header

### DB Entities Touched by Cron Jobs

| Entity | Cron Jobs |
|--------|-----------|
| `bookings` | send-reminders, process-recurring-bookings, ranking-recompute |
| `booking_holds` | expire-booking-holds |
| `booking_services` | send-reminders, process-recurring-bookings |
| `on_demand_requests` | expire-on-demand-requests |
| `recurring_appointments` | process-recurring-bookings |
| `ads_campaigns` | expire-ads-campaigns |
| `ads_events` | expire-ads-campaigns |
| `provider_subscriptions` | expire-cancelled-subscriptions |
| `providers` | check-low-stock, ranking-recompute |
| `products` | check-low-stock |
| `provider_quality_score` | ranking-recompute |
| `messages` | expire-message-attachments |
| `notifications` | send-reminders, check-low-stock, inactivity-retention |
| `marketing_automations` | execute-automations (downstream) |
| `automation_executions` | execute-automations (downstream) |
| `users` | inactivity-retention, execute-automations |

### App Surface Dependencies

| Cron Job | Web | Provider App | Customer App | Admin SPA |
|----------|-----|-------------|-------------|-----------|
| send-reminders | — | Push notifications | Push notifications | — |
| expire-booking-holds | Slot availability | Calendar availability | Booking flow | — |
| expire-on-demand-requests | — | Request list cleanup | — | — |
| execute-automations | — | — | Marketing messages | — |
| process-recurring-bookings | — | Calendar entries | Booking history | — |
| check-low-stock | — | Stock alerts | — | — |
| ranking-recompute | Search ordering | — | Search ordering | Provider rankings |
| inactivity-retention | — | Account warnings | Account warnings | User status |
| expire-message-attachments | Chat display | Chat display | Chat display | — |
| expire-ads-campaigns | — | Ad campaign status | Ad visibility | Ad analytics |
| expire-cancelled-subscriptions | — | Feature access | — | Subscription status |

---

## 2. Executive Summary

### Overall Cron Health: **MODERATE — requires targeted fixes**

**Configuration Issues (now fixed):**
- **CRITICAL (FIXED):** `expire-ads-campaigns` and `expire-cancelled-subscriptions` were missing from `vercel.json` — these handlers existed but would **never run automatically** in production.
- **CRITICAL (FIXED):** `expire-ads-campaigns` used inconsistent auth pattern (inline `CRON_SECRET` only, no `INTERNAL_API_SECRET` fallback, no Vercel header checks).

**Remaining Risks:**

| Risk Level | Count | Summary |
|------------|-------|---------|
| Critical | 0 | All critical deployment issues fixed |
| High | 4 | Timeout risks, missing idempotency, timezone concerns |
| Medium | 5 | Weak observability, stub handlers, schedule concerns |
| Low | 3 | Minor consistency/documentation issues |

**Production Confidence:** After the fixes applied in this audit, all 11 cron jobs are correctly wired in `vercel.json`, use consistent auth, and target real deployed routes. The system will function in production. The remaining risks are edge-case reliability and scale concerns, not showstoppers.

**Biggest Monorepo Risks:**
- All cron handlers correctly reside in `apps/web` (the deployed Next.js app) — no cross-boundary issues
- No Expo or Vite code is pulled into cron handlers
- Shared packages used (`date-fns`, internal libs) are server-compatible

---

## 3. Findings by Cron Job

### 3.1 send-reminders

- **Schedule:** `0 9 * * *` (daily 09:00 UTC)
- **Purpose:** Send appointment reminders (24h and 2h before) and rebook nudges
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Route exists, correct path, GET method

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Schedule mismatch:** Comment says "every hour" but schedule is once daily at 09:00 UTC. The 2-hour reminder window will only catch appointments between 11:00-12:00 UTC. Bookings at other times miss the 2h reminder entirely. | **HIGH** |
| 2 | **No pagination:** `sendAppointmentReminders` loads all matching bookings with no `limit`. Large platforms could timeout. | **MEDIUM** |
| 3 | **Rebook query is unbounded:** `sendRebookReminders` queries all `completed` bookings up to ~400 weeks back — memory risk at scale. | **HIGH** |
| 4 | **Timezone display:** Reminder notification text uses server locale for time formatting, not provider/customer timezone. | **MEDIUM** |
| 5 | **Idempotency race:** Dedup uses read-then-write on `notifications` table — concurrent runs could double-send. | **LOW** |

**Recommendation:**
- Change schedule to `0 * * * *` (hourly) to actually catch the 2h and 24h reminder windows, or adjust the window logic.
- Add `limit` + pagination to both reminder queries.

### 3.2 expire-booking-holds

- **Schedule:** `*/5 * * * *` (every 5 minutes)
- **Purpose:** Expire booking slot holds past their `expires_at`
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | None — this is the cleanest cron job. Conditional update on `hold_status = 'active'` + `expires_at < now()`. Fully idempotent, no pagination needed (single atomic UPDATE), no external calls. | — |

**Verdict:** Production-safe. No changes needed.

### 3.3 expire-on-demand-requests

- **Schedule:** `0 2 * * *` (daily 02:00 UTC)
- **Purpose:** Expire stale on-demand requests for DB cleanup
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | None — single atomic conditional UPDATE. Idempotent, safe, lightweight. | — |

**Verdict:** Production-safe. No changes needed.

### 3.4 execute-automations

- **Schedule:** `0 6 * * *` (daily 06:00 UTC)
- **Purpose:** Execute marketing automations (email/SMS/WhatsApp/push)
- **Auth:** `verifyCronRequest` on cron wrapper; inner POST uses Bearer token
- **Deployment:** Cron wrapper calls same app via HTTP fetch

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Schedule mismatch:** Comment says "every 5-15 minutes" but schedule is once daily. Marketing automations with time-sensitive triggers may fire late. | **MEDIUM** |
| 2 | **Self-fetch pattern:** Cron GETs itself, then POST fetches the same deployment. This adds latency, could fail if `NEXT_PUBLIC_SITE_URL` or `VERCEL_URL` resolves differently than expected, and doubles the serverless invocation cost. Direct function call would be safer. | **MEDIUM** |
| 3 | **Timeout risk:** Downstream handler processes ALL active automations sequentially with per-recipient network calls (SMS/email). No time budget or batching. Could exceed Vercel's 60s function timeout on Hobby or 300s on Pro. | **HIGH** |
| 4 | **Dedup race:** `checkIfAlreadySent` is read-then-write with no unique constraint. Overlapping runs can double-send. | **MEDIUM** |
| 5 | **`executed` count misleading:** An automation is counted as "executed" even if all recipient sends failed. | **LOW** |

**Recommendation:**
- Consider increasing frequency if time-sensitive automations are needed.
- Replace self-fetch with direct function import to eliminate network hop.
- Add time budget / early exit to prevent timeout.

### 3.5 process-recurring-bookings

- **Schedule:** `0 0 * * *` (daily midnight UTC)
- **Purpose:** Create next booking from each active recurring series
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Timezone risk in datetime construction:** `createBookingFromRecurringSeries` constructs `new Date(\`${date}T${time}\`)` which interprets in server's local TZ (UTC on Vercel). If `time` is the provider's local business time (e.g. 10:00 SAST), the booking will be created at 10:00 UTC (12:00 SAST in summer). | **HIGH** |
| 2 | **No concurrency protection:** If cron triggers twice (Vercel retry), two bookings could be created for the same series date. `last_booking_date` update happens after creation, creating a race window. | **MEDIUM** |
| 3 | **No pagination:** Loads all active recurring appointments in one query. | **LOW** |
| 4 | **Good error isolation:** Per-appointment try/catch prevents one failure from blocking others. Errors collected and returned. | — |

**Recommendation:**
- Add timezone-aware datetime construction using provider's timezone from their profile.
- Add a unique constraint or check before creating a booking for a given series + date combination.

### 3.6 check-low-stock

- **Schedule:** `0 8 * * *` (daily 08:00 UTC)
- **Purpose:** Alert providers about low stock products
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **No dedup:** Every run re-alerts for all products still below threshold. Providers could receive daily duplicate alerts for the same product. | **MEDIUM** |
| 2 | **No pagination:** Loads all products in one query. | **LOW** |

**Recommendation:**
- Add a `last_low_stock_alert_at` timestamp to avoid re-alerting for the same product within a cooldown period (e.g. 7 days).

### 3.7 ranking-recompute

- **Schedule:** `0 4 * * *` (daily 04:00 UTC)
- **Purpose:** Recompute quality scores for all active providers
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Timeout risk at scale:** `computeQualityScoreForProvider` loads ALL terminal-status bookings per provider with no limit. With batches of 100 providers running in parallel, each loading potentially thousands of bookings, this could exceed function timeout. | **HIGH** |
| 2 | **Good batching pattern:** Processes providers in batches of 100 with `Promise.all`. Uses `upsert` for idempotent writes. | — |

**Recommendation:**
- Add a date range limit to the bookings query (e.g. last 12 months) to bound data volume.
- Consider reducing `BATCH_SIZE` or adding progress checkpointing.

### 3.8 inactivity-retention

- **Schedule:** `0 10 * * *` (daily 10:00 UTC)
- **Purpose:** Send 6-month inactivity warnings; archive abandoned accounts
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Good claim-based batching:** Uses RPC `claim_inactivity_retention_warnings` with batch limit of 200, up to 8 batches. Prevents duplicate processing via atomic claim. | — |
| 2 | **Archive RPC is opaque:** Cannot verify archive safety without the SQL migration. Should be audited separately. | **LOW** |
| 3 | **Notification send is sequential:** Per-user `sendTemplateNotification` calls are sequential within each batch. 200 users × round-trip time could be slow. | **LOW** |

**Verdict:** Well-designed with proper claim-based dedup. Minor optimization opportunities.

### 3.9 expire-message-attachments

- **Schedule:** `30 3 * * *` (daily 03:30 UTC)
- **Purpose:** Remove expired chat file attachments from storage and update message records
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Good pagination:** Uses `PAGE = 200` with `MAX_PAGES = 40` cap (max 8,000 rows per run). | — |
| 2 | **Good idempotency:** Checks for marker in JSON before processing; stripped attachments won't match on re-run. | — |
| 3 | **Storage removal errors logged but not failed:** If `remove` fails for some paths, the message JSON is still updated, potentially losing references to files that weren't deleted. | **MEDIUM** |

**Recommendation:**
- Skip JSON update if storage removal fails, to preserve the reference for retry.

### 3.10 expire-ads-campaigns

- **Schedule:** `0 */2 * * *` (every 2 hours) — **NEWLY ADDED to vercel.json**
- **Purpose:** End time-based, CPC budget, and impression pack ad campaigns
- **Auth:** `verifyCronRequest` — **FIXED** (was inline check)
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Auth was inconsistent (FIXED):** Was using inline `CRON_SECRET` only check without `INTERNAL_API_SECRET` fallback or `x-vercel-id` verification. Now uses `verifyCronRequest`. | **FIXED** |
| 2 | **Was not in vercel.json (FIXED):** Handler existed but was never triggered. Now added with `0 */2 * * *`. | **FIXED** |
| 3 | **Impression count query unbounded:** For impression pack campaigns, loads ALL `ads_events` for matching campaigns without pagination. Could be slow with high-traffic campaigns. | **MEDIUM** |
| 4 | **Good idempotency:** All updates are conditional on `status = 'active'` + specific criteria. Safe to re-run. | — |
| 5 | **RPC fallback pattern:** If `expire_overspent_ads_campaigns` RPC doesn't exist, falls back to manual query+update. Good defensive coding. | — |

### 3.11 expire-cancelled-subscriptions

- **Schedule:** `0 1 * * *` (daily 01:00 UTC) — **NEWLY ADDED to vercel.json**
- **Purpose:** Transition `cancelled` and naturally expired subscriptions
- **Auth:** `verifyCronRequest` — correct
- **Deployment:** Correct

**Issues Found:**

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Was not in vercel.json (FIXED):** Handler existed but never triggered. Cancelled subscriptions would remain `active` in the DB indefinitely, potentially granting features past their billing period. | **FIXED** |
| 2 | **Good dual-path logic:** Handles both (a) explicitly cancelled subs past `expires_at` and (b) naturally expired subs with `auto_renew = false`. Both are conditional UPDATEs — fully idempotent. | — |
| 3 | **No notification on expiry:** When a subscription is expired/cancelled by this job, no notification is sent to the provider. They may not realize their plan ended. | **MEDIUM** |
| 4 | **Missing `past_due` handling:** Subscriptions with `status = 'past_due'` that are past `expires_at` are not transitioned. They should be expired after the grace period. | **MEDIUM** |

**Recommendation:**
- Add OneSignal notification when subscription is expired by this job.
- Add a third UPDATE for `past_due` subscriptions past the 3-day grace period + `expires_at`.

---

## 4. Cross-Cron Risks

### 4.1 Auth Pattern Inconsistency

Three different auth patterns exist across cron/scheduled endpoints:

| Pattern | Used By |
|---------|---------|
| `verifyCronRequest` (Bearer + INTERNAL_API_SECRET fallback + x-vercel-id) | 10 of 11 cron handlers (after fix) |
| Inline `CRON_SECRET` only | `expire-ads-campaigns` (**FIXED**) |
| `x-cron-secret` header (not Bearer) | `run-stall-check` (not in vercel.json) |
| Inline `CRON_SECRET || INTERNAL_API_SECRET` | `provider/automations/execute` (called by cron #4) |

**Risk:** Operators configuring env vars may miss that some endpoints need different secrets or header formats.
**Status:** Fixed — all 11 cron handlers now use `verifyCronRequest`.

### 4.2 Timezone Inconsistency

All cron schedules run in **UTC** (Vercel's default). The platform primarily serves South Africa (**SAST = UTC+2**).

| Impact | Detail |
|--------|--------|
| `send-reminders` at 09:00 UTC = 11:00 SAST | Reasonable for morning reminders |
| `process-recurring-bookings` at 00:00 UTC = 02:00 SAST | Creates bookings after midnight local time — acceptable |
| `check-low-stock` at 08:00 UTC = 10:00 SAST | Good — business hours |
| `inactivity-retention` at 10:00 UTC = 12:00 SAST | Good — daytime |
| Datetime construction in recurring bookings | **Risk** — uses UTC interpretation for local times |

### 4.3 Missing Observability

No cron job has:
- Structured logging with correlation IDs
- External alerting on failure (e.g. Sentry, PagerDuty)
- Duration/success metrics
- Dead-man's switch monitoring (alert if cron stops running)

All rely on Vercel's built-in cron logs and `console.error`.

### 4.4 No Overlapping Run Protection

None of the 11 cron jobs have explicit locking to prevent overlapping runs. Vercel cron does not guarantee that a previous invocation has completed before the next one starts. For jobs running every 5 minutes (`expire-booking-holds`), this is safe because the operation is atomic. For heavy jobs like `ranking-recompute` or `execute-automations`, overlapping runs could cause issues.

### 4.5 Self-Fetch Anti-Pattern

`execute-automations` uses `fetch()` to call another endpoint on the same deployment. This:
- Doubles serverless invocation costs
- Introduces network failure modes
- May fail if `NEXT_PUBLIC_SITE_URL` doesn't resolve to the same deployment
- Makes the call chain harder to trace

---

## 5. Missing or Incomplete Cron Functionality

### 5.1 Missing Cron Jobs (Should Exist)

| Feature | Current State | Impact | Priority |
|---------|--------------|--------|----------|
| **Loyalty points expiry** | Schema has `points_expiry_days` and `expires_at` on transactions but no cron to expire them | Points never expire; financial liability grows indefinitely | **HIGH** |
| **Gift card expiry** | `validate` endpoints check `expired_at` but no cron marks them as expired | Expired gift cards remain in `active` status; validation catches it but reporting/UI is inconsistent | **MEDIUM** |
| **Subscription payment retry / past_due escalation** | `past_due` subscriptions have a 3-day grace period (from prior audit fix) but no cron to transition them to `cancelled` after grace | Provider keeps features past grace period; relies solely on webhook and `expire-cancelled-subscriptions` (which doesn't check `past_due`) | **HIGH** |
| **No-show auto-marking** | No automated marking of no-shows after scheduled time passes | Provider must manually mark no-shows; reporting may undercount | **MEDIUM** |
| **Subscription expiry reminders** | Handler exists at `/api/notifications/subscription-reminder/check` but (a) uses placeholder send functions and (b) queries wrong table (`subscriptions` instead of `provider_subscriptions`) | Providers get no advance warning before subscription expires | **HIGH** |
| **Promo code expiry** | No cron to deactivate expired promotional codes | Expired promos may still validate if `is_active` isn't toggled | **LOW** |
| **Stall check** | `run-stall-check` exists but is not wired to vercel.json | Stalled onboarding drafts are never auto-classified unless an admin triggers manually | **MEDIUM** |

### 5.2 Partially Implemented

| Feature | State | Issue |
|---------|-------|-------|
| Subscription reminder check | Route handler exists with `verifyCronRequest` auth | Send functions are `console.log` stubs; queries `subscriptions` table (likely doesn't exist — should be `provider_subscriptions`) |
| Provider ops stall check | Route handler exists with dual auth (admin + cron) | Not wired to vercel.json; uses non-standard `x-cron-secret` header |

---

## 6. Prioritized Fix Plan

### CRITICAL (Implemented in This Audit)

| # | Fix | File | Status |
|---|-----|------|--------|
| 1 | Add `expire-ads-campaigns` to vercel.json with `0 */2 * * *` schedule | `apps/web/vercel.json` | **DONE** |
| 2 | Add `expire-cancelled-subscriptions` to vercel.json with `0 1 * * *` schedule | `apps/web/vercel.json` | **DONE** |
| 3 | Fix `expire-ads-campaigns` auth to use `verifyCronRequest` | `apps/web/src/app/api/cron/expire-ads-campaigns/route.ts` | **DONE** |

### HIGH (Implemented in This Audit)

| # | Fix | File | Status |
|---|-----|------|--------|
| 4 | Fix `send-reminders` schedule from daily to hourly (`0 * * * *`) | `apps/web/vercel.json` | **DONE** |
| 5 | Add `past_due` subscription handling (3-day grace → expired) | `apps/web/src/app/api/cron/expire-cancelled-subscriptions/route.ts` | **DONE** |
| 6 | Add pagination + reduce lookback window in `sendRebookReminders` | `apps/web/src/lib/bookings/appointment-reminders.ts` | **DONE** |

### HIGH (Remaining)

| # | Fix | Details |
|---|-----|---------|
| 7 | **Fix timezone in `createBookingFromRecurringSeries`** | Use provider's timezone when constructing scheduled datetime from date + time strings |
| 8 | **Add timeout budget to `ranking-recompute`** | Limit bookings query to last 12 months; add early exit if approaching function timeout |

### MEDIUM (Implemented in This Audit)

| # | Fix | File | Status |
|---|-----|------|--------|
| 9 | Replace self-fetch in `execute-automations` with direct import | `apps/web/src/app/api/cron/execute-automations/route.ts` | **DONE** |

### MEDIUM (Remaining)

| # | Fix | Details |
|---|-----|---------|
| 10 | Implement subscription expiry reminder cron | Rewrite the stub handler to use `provider_subscriptions` table and real notification sends |
| 11 | Add low-stock alert dedup | Track `last_low_stock_alert_at` per product to avoid daily re-alerts |
| 12 | Add expiry notification to `expire-cancelled-subscriptions` | Send push notification when subscription is expired by cron |
| 13 | Wire `run-stall-check` to vercel.json | Add as hourly cron or adjust auth to use `verifyCronRequest` with Bearer |
| 14 | Fix `expire-message-attachments` storage removal | Don't update message JSON if storage removal fails |
| 15 | Add pagination to `expire-ads-campaigns` impression count query | Large campaigns could have millions of events |

### LOW

| # | Fix | Details |
|---|-----|---------|
| 16 | Add overlapping-run protection to heavy jobs | Use a simple DB-based lock for `ranking-recompute`, `execute-automations`, `inactivity-retention` |
| 17 | Add structured logging/monitoring | Emit structured logs with job name, duration, items processed for all cron jobs |
| 18 | Create loyalty points expiry cron | New handler to expire points past `expires_at` |
| 19 | Create gift card status expiry cron | New handler to mark gift cards as `expired` when past `expires_at` |
| 20 | Add unique constraint for recurring booking dedup | Prevent `process-recurring-bookings` from creating duplicate bookings on retry |
| 21 | Document timezone expectations | Add a note in vercel.json or README about all schedules being UTC |

---

## 7. Final Verdict

### Is the cron system production-safe?

**YES, after the critical fixes applied in this audit.** Before this audit, two cron handlers (`expire-ads-campaigns` and `expire-cancelled-subscriptions`) were completely non-functional because they were missing from `vercel.json`. This means:
- Ad campaigns would never automatically expire (active forever until manual intervention)
- Cancelled subscriptions would remain `active` in the database (granting features past billing period)

Both are now correctly wired.

### Is the Vercel configuration aligned with implementation?

**YES.** All 11 cron entries in `vercel.json` now map to real deployed route handlers in `apps/web`. All use the `GET` method (Vercel cron only supports `GET`). All routes use `verifyCronRequest` for consistent auth.

### Will jobs work as intended in this monorepo?

**YES, with caveats:**
- All handlers are in `apps/web` — the only deployed Next.js app — so no cross-boundary issues
- No Expo/Vite code is imported into cron handlers
- Shared packages are server-compatible
- The `send-reminders` schedule should be changed to hourly for full reminder coverage (HIGH priority)
- Several jobs lack pagination and could timeout at scale
- The subscription expiry reminder handler is a stub and needs a rewrite before it can be wired up

### What must be fixed before release?

1. ~~Add `expire-ads-campaigns` and `expire-cancelled-subscriptions` to vercel.json~~ **DONE**
2. ~~Fix `expire-ads-campaigns` auth to use `verifyCronRequest`~~ **DONE**
3. ~~Change `send-reminders` schedule to hourly~~ **DONE**
4. ~~Add `past_due` subscription handling~~ **DONE**
5. ~~Add pagination to `sendRebookReminders`~~ **DONE**
6. ~~Replace self-fetch in `execute-automations`~~ **DONE**
7. ~~Fix timezone in `createBookingFromRecurringSeries`~~ **DONE** (uses `fromBusinessTime` + provider timezone)
8. ~~Add timeout budget to `ranking-recompute`~~ **DONE** (COUNT queries + 12-month window)
9. ~~Create subscription expiry reminder cron~~ **DONE** (new handler with real notifications)
10. ~~Add low-stock alert dedup~~ **DONE** (7-day cooldown per provider)
11. ~~Add provider notification on subscription expiry~~ **DONE**
12. ~~Wire provider stall check to vercel.json~~ **DONE** (new cron wrapper iterating tenants)
13. ~~Fix message attachment storage safety~~ **DONE** (skip JSON update on removal failure)
14. ~~Add pagination to ads impression count~~ **DONE** (per-campaign COUNT queries)

All critical, high, and medium priority items have been implemented.
