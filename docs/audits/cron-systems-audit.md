# Vercel Cron Systems Audit

**Date:** 2026-07-01
**Scope:** All 38 Vercel cron jobs in `apps/web/vercel.json`
**Auditor:** Enterprise Go-Live Hardening — Workstream H (Support/Docs)
**Previous entry count:** 14 (stale — regenerated from live vercel.json)

---

## 1. Cron System Map

### Configuration Source

All cron jobs are configured in `apps/web/vercel.json` and target Next.js API route handlers under `apps/web/src/app/api/cron/*/route.ts`. Authentication is enforced by `verifyCronRequest()` in `apps/web/src/lib/cron-auth.ts` (checks `Authorization: Bearer <CRON_SECRET>`).

### Registered Cron Jobs (vercel.json — 38 entries)

| # | Path | Schedule | Human Schedule | Category |
|---|------|----------|----------------|----------|
| 1 | `/api/cron/sync-paystack-terminal-payments` | `*/15 * * * *` | Every 15 min | Payments |
| 2 | `/api/cron/send-reminders` | `0 * * * *` | Hourly | Notifications |
| 3 | `/api/cron/expire-booking-holds` | `*/5 * * * *` | Every 5 min | Bookings |
| 4 | `/api/cron/expire-pending-payment-bookings` | `*/10 * * * *` | Every 10 min | Bookings |
| 5 | `/api/cron/expire-pending-payment-orders` | `*/10 * * * *` | Every 10 min | Commerce |
| 6 | `/api/cron/expire-on-demand-requests` | `0 2 * * *` | Daily 02:00 UTC | Requests |
| 7 | `/api/cron/expire-custom-requests` | `15 2 * * *` | Daily 02:15 UTC | Requests |
| 8 | `/api/cron/execute-automations` | `0 6 * * *` | Daily 06:00 UTC | Marketing |
| 9 | `/api/cron/process-recurring-bookings` | `0 0 * * *` | Daily midnight UTC | Bookings |
| 10 | `/api/cron/check-low-stock` | `0 8 * * *` | Daily 08:00 UTC | Commerce |
| 11 | `/api/cron/ranking-recompute` | `0 4 * * *` | Daily 04:00 UTC | Platform |
| 12 | `/api/cron/inactivity-retention` | `0 10 * * *` | Daily 10:00 UTC | Compliance |
| 13 | `/api/cron/expire-message-attachments` | `30 3 * * *` | Daily 03:30 UTC | Messaging |
| 14 | `/api/cron/expire-ads-campaigns` | `0 */2 * * *` | Every 2 hours | Ads |
| 15 | `/api/cron/expire-cancelled-subscriptions` | `0 2 * * *` | Daily 02:00 UTC | Subscriptions |
| 16 | `/api/cron/expire-provider-badges` | `45 2 * * *` | Daily 02:45 UTC | Providers |
| 17 | `/api/cron/subscription-reminders` | `0 7 * * *` | Daily 07:00 UTC | Subscriptions |
| 18 | `/api/cron/provider-stall-check` | `0 */4 * * *` | Every 4 hours | Providers |
| 19 | `/api/cron/purge-audit-logs` | `0 2 * * 0` | Weekly Sun 02:00 UTC | Compliance |
| 20 | `/api/cron/purge-compliance-snapshots` | `30 2 * * 0` | Weekly Sun 02:30 UTC | Compliance |
| 21 | `/api/cron/process-account-deletions` | `15 3 * * *` | Daily 03:15 UTC | Compliance |
| 22 | `/api/cron/prune-webhook-events` | `30 2 * * *` | Daily 02:30 UTC | Payments |
| 23 | `/api/cron/abandoned-carts` | `0 */6 * * *` | Every 6 hours | Commerce |
| 24 | `/api/cron/refresh-provider-analytics` | `*/15 * * * *` | Every 15 min | Analytics |
| 25 | `/api/cron/refresh-reports` | `15 * * * *` | Hourly at :15 | Analytics |
| 26 | `/api/cron/process-whatsapp-queue` | `*/2 * * * *` | Every 2 min | Messaging |
| 27 | `/api/cron/reset-whatsapp-counters` | `0 * * * *` | Hourly | Messaging |
| 28 | `/api/cron/abandoned-bookings` | `0 * * * *` | Hourly | Bookings |
| 29 | `/api/cron/process-notification-queue` | `*/2 * * * *` | Every 2 min | Notifications |
| 30 | `/api/cron/sync-whatsapp-template-status` | `*/10 * * * *` | Every 10 min | Messaging |
| 31 | `/api/cron/grant-marketing-credits` | `0 0 1 * *` | Monthly 1st midnight UTC | Marketing |
| 32 | `/api/cron/dispatch-scheduled-campaigns` | `*/5 * * * *` | Every 5 min | Marketing |
| 33 | `/api/cron/reconcile-push-delivery` | `*/10 * * * *` | Every 10 min | Notifications |
| 34 | `/api/cron/prune-idempotency-keys` | `0 3 * * *` | Daily 03:00 UTC | Platform |
| 35 | `/api/cron/reconciliation-gate` | `0 5 * * *` | Daily 05:00 UTC | Finance |
| 36 | `/api/cron/slack-operational-alerts` | `15 * * * *` | Hourly at :15 | Observability |
| 37 | `/api/cron/process-membership-renewals` | `0 6 * * *` | Daily 06:00 UTC | Memberships |
| 38 | `/api/cron/membership-renewal-reminders` | `0 7 * * *` | Daily 07:00 UTC | Memberships |

### Cron Categories Summary

| Category | Count | Fastest Interval |
|----------|-------|-----------------|
| Notifications | 3 | Every 2 min |
| Messaging | 4 | Every 2 min |
| Bookings | 4 | Every 5 min |
| Payments | 3 | Every 10 min |
| Marketing | 3 | Every 5 min |
| Commerce | 3 | Every 10 min |
| Analytics | 2 | Every 15 min |
| Subscriptions | 2 | Daily |
| Memberships | 2 | Daily |
| Compliance | 4 | Daily |
| Providers | 2 | Every 4 hours |
| Platform | 2 | Daily |
| Finance | 1 | Daily |
| Observability | 1 | Hourly |
| Requests | 2 | Daily |
| Ads | 1 | Every 2 hours |

---

## 2. Shared Auth Helper

**File:** `apps/web/src/lib/cron-auth.ts` — `verifyCronRequest()`

- Checks `Authorization: Bearer <CRON_SECRET || INTERNAL_API_SECRET>`
- In production: validates `x-vercel-id` header is present (Vercel-origin guarantee)
- Logs unexpected user-agent (expects `vercel-cron/1.0`)
- Returns `401` on auth failure — no silent bypass

---

## 3. High-Frequency Crons (≤ 5 min)

These fire most often and consume the most function invocations. Monitor for:
- Cold-start latency spikes
- Timeout errors (Vercel Pro/Enterprise: up to 300s; Hobby: 10s)
- Idempotency enforcement

| Path | Interval | Risk |
|------|----------|------|
| `/api/cron/process-whatsapp-queue` | 2 min | Message ordering, duplicate sends |
| `/api/cron/process-notification-queue` | 2 min | Push delivery idempotency |
| `/api/cron/expire-booking-holds` | 5 min | Stale holds leaking slots |
| `/api/cron/dispatch-scheduled-campaigns` | 5 min | Duplicate campaign dispatches |
| `/api/cron/sync-paystack-terminal-payments` | 15 min | Payment reconciliation lag |
| `/api/cron/refresh-provider-analytics` | 15 min | DB write pressure |

---

## 4. Finance-Critical Crons

These must never be silently skipped or partially executed:

| Path | Schedule | Purpose | Idempotency Key |
|------|----------|---------|----------------|
| `/api/cron/reconciliation-gate` | Daily 05:00 UTC | Finance ledger invariant check | One run per day |
| `/api/cron/process-membership-renewals` | Daily 06:00 UTC | Charge recurring memberships | `membership_billing_runs` table |
| `/api/cron/sync-paystack-terminal-payments` | Every 15 min | Reconcile terminal payments | Paystack ref dedup |

Pair with the nightly **Finance Ledger Drift Check** (`.github/workflows/finance-drift.yml`) for end-to-end audit coverage.

---

## 5. CI Verification

`pnpm verify:cron-schedule` (wired to `docs/scripts/verify-cron-schedule.mjs`) runs in the `test` CI job and confirms every path in `vercel.json` has a matching `route.ts` handler. Add or remove entries in sync.

---

## 6. Cron Runbook

### Adding a new cron

1. Create `apps/web/src/app/api/cron/<name>/route.ts` with `verifyCronRequest()` auth guard.
2. Add entry to `apps/web/vercel.json` `crons` array.
3. Run `pnpm verify:cron-schedule` — should pass.
4. Update this table (or re-run the doc generator).

### Removing a stale cron

1. Delete the `route.ts` file.
2. Remove the entry from `vercel.json`.
3. Run `pnpm verify:cron-schedule` — should still pass.

### Debugging a failing cron

1. Check Vercel Functions logs: **Vercel Dashboard → Functions → Filter by path**.
2. Check `cron_job_runs` table (if present) for last execution timestamp.
3. Manually invoke: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/<name>`
4. Verify `CRON_SECRET` is set in Vercel environment variables.
