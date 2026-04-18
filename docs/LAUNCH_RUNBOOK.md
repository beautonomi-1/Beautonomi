# Beautonomi Launch Runbook

> Operational runbook for go-live. This file is the release captain's
> single source of truth between T-24 h and T+168 h post-launch.

## A · Roles

| Role              | Duty                                                          |
| ----------------- | ------------------------------------------------------------- |
| Release captain   | Owns this runbook end-to-end. Gates the cutover.              |
| Finance watchdog  | Sits on reconciliation dashboard for first 24 h.              |
| SRE on-call       | Sentry + Vercel + Supabase paging. 24/7 for first 7 days.     |
| Mobile on-call    | EAS + store rollout halt / rollback authority.                |
| Support lead      | Triage customer-facing issues; owns communications.           |

---

## B · T-24 h pre-launch checklist

- [ ] `docs/LAUNCH_E2E_DRY_RUN.md` completed on staging within last 48 h, signed off.
- [ ] `docs/PARITY_MATRIX.md` has no `❌` rows on critical booking / payments / calendar.
- [ ] All **Wave 1–5** todos closed in the Launch Readiness 100 Plan.
- [ ] `npm run test` green on target SHA for `apps/web`, `apps/customer`, `apps/provider`.
- [ ] `npm run typecheck` green on all three apps.
- [ ] `reconciliation-drift.test.ts` green (no new transaction_types outside allowlist).
- [ ] Secrets audit: `CRON_SECRET`, `SENTRY_AUTH_TOKEN`, Paystack live keys, OneSignal, Upstash, Supabase service role all present in Vercel prod + EAS prod profiles.
- [ ] Staging has been running 7 consecutive days with zero ledger drift (`v_ledger_reconciliation`).
- [ ] Mobile prod builds submitted to App Store + Play Store (internal track) with release notes.
- [ ] Feature flags (control plane) reviewed: everything that should default-on is on.
- [ ] Backup: `pg_dump` of production Supabase ran in the last 24 h; restore timing verified.

---

## C · T-0 cutover sequence

Run sequentially. **Do not skip a step.**

1. Freeze writes on legacy origin (if migrating). Verify via admin banner.
2. Final `supabase db push` for prod — compare output against staging's pending list; must be identical.
3. Deploy Vercel prod (web + admin). Check `/api/health` returns 200 with correct release SHA.
4. Trigger Sentry release finalization (`sentry-cli releases finalize`).
5. Flip customer DNS / apex to prod origin (CloudFlare).
6. Promote mobile builds from internal → production track. Stagger: iOS first (24 h), then Android.
7. Enable all cron jobs in `vercel.json` (they are scheduled already; verify first run logs success):
   - `process-notification-queue` (1 min)
   - `reconciliation-gate` (5 min)
   - `abandoned-bookings` (15 min)
   - `period-lock-runner` (hourly)
8. Announce launch via `#launch` Slack channel only once every item above is green.

---

## D · Rollback decision tree

Apply the **first** condition that trips. Don't wait for a perfect answer.

| Symptom                                                                 | Decision                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Reconciliation drift > R500 within 15 min window                        | ROLLBACK web deploy. Keep mobile online; web is the money path. |
| `notification_delivery_queue` DLQ > 100 in 30 min                       | ROLL FORWARD — pause cron, ship hotfix; notifications are not money. |
| Paystack webhook failure rate > 5 % for 10 min                          | ROLLBACK webhook route deploy only (`/api/payments/webhook`). |
| Mobile crash-free sessions < 99 % on launch cohort                      | HALT mobile store rollout (App Store Connect / Play Console). |
| Customer sign-up success < 90 % (auth flow broken)                      | ROLLBACK auth-touching commits; keep everything else.         |
| Calendar double-book reported with evidence                             | INSTANT ROLLBACK to last known-good; finance freeze bookings. |
| Any unbounded loop, OOM, or db connection exhaustion                    | ROLLBACK + page Supabase support.                             |

**Rollback mechanics**

- Web: Vercel dashboard → Deployments → "Promote to production" on last good deploy.
- Admin SPA: same, its bundle is hosted from `/public/admin`, tied to the web deploy.
- Mobile: halt store rollout; do NOT attempt to force-push a fix build in the launch window. Phased release gives us time to ship a fix via the next build cycle.
- DB: never rollback migrations forward; fix forward only. Use `finance_transactions` repair RPCs (`_shadow_replay_finance_tx_row`) and the admin ledger tools if ledger rows need recomputing.

---

## E · Post-launch monitoring scorecard (T+0 h → T+168 h)

Check hourly for first 24 h, then every 4 h for 6 days.

| Metric                                                 | Target            | Source                                     |
| ------------------------------------------------------ | ----------------- | ------------------------------------------ |
| Reconciliation drift (abs)                             | **0.00**          | `v_ledger_reconciliation` view             |
| `reconciliation_gate_runs.passed`                      | true for last 24 runs | same table                             |
| Notification queue DLQ depth                           | 0                 | `notification_delivery_queue` (status=dead_letter) |
| Notification queue pending age p95                     | < 5 min           | same table                                 |
| Paystack webhook success rate                          | > 99 %            | `payment_transactions` + Sentry counts     |
| Booking creation success rate                          | > 98 %            | Sentry transaction `POST /api/public/bookings` |
| Booking double-book incidents                          | 0                 | support tickets + `booking_holds` audit    |
| Sentry unresolved `error` events                       | < 10 new / hr     | Sentry issues                              |
| Mobile crash-free sessions (7-day rolling)             | > 99 %            | Sentry mobile projects                     |
| Vercel function error rate (p99 routes)                | < 1 %             | Vercel observability                       |
| Upstash rate-limit 429 spike                           | < 2 % of /api     | Vercel logs                                |
| Idempotency conflict (booking-holds) rate              | < 5 %             | `request_idempotency_keys`                 |

**Escalation** — any red row triggers the decision tree in section D.

---

## F · Support playbook (top 3 user-facing scenarios)

1. **"I paid but my booking says unpaid"**
   - Look up booking → `booking_payments` rows for that `booking_id`.
   - If Paystack reference present but `booking.status = pending_payment`, replay webhook: `POST /api/admin/payments/replay` with ref.
   - Do NOT manually toggle `booking.status`; always replay.

2. **"I got charged twice"**
   - `select * from booking_refunds where booking_id = ?`.
   - If only one `booking_payments` row, customer is mistaken (card statements often show authorisation + capture as two lines — they're the same).
   - If two payment rows, use admin refund tool — do NOT issue refunds via Paystack dashboard directly (it bypasses our ledger).

3. **"I'm not getting confirmation notifications"**
   - Check `notification_delivery_queue` for that user_id + dedupe pattern.
   - If `status = failed`, check Sentry for the latest processor run; if DLQ, re-enqueue via `/api/admin/notifications/reingest`.
   - Do NOT send manually via Twilio/OneSignal dashboard — bypasses dedupe.

---

## G · 7-day post-launch sign-off gate

Launch is not "complete" until:

- [ ] 7 consecutive days of zero reconciliation drift on production.
- [ ] 7 consecutive days with DLQ depth ≤ 3 at any moment.
- [ ] 7 consecutive days with no P0 Sentry issues unresolved > 4 h.
- [ ] Post-mortem done for every P1 incident (if any occurred).
- [ ] `docs/PARITY_MATRIX.md` verification log updated with production-confirmation row.

Once all boxes are checked, the release captain declares **LAUNCH COMPLETE** in
`#launch` and this runbook is archived into `docs/launches/<date>-beautonomi-go-live.md`.
