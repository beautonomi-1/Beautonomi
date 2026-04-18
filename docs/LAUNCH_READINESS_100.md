# Launch Readiness — 100 / 100

**Status (engineering complete):** every wave of the Launch Readiness 100 Plan
is implemented. A final 2026-04-17 no-deferral pass also closed the three
items previously annotated as 🔗/🟡 on the parity matrix (advanced-pricing
complex rule types, provider broadcasts, customer web push) — see
`docs/PARITY_MATRIX.md §E`. The remaining gate is the 7-day staging
observation window agreed as the final verification step.

## Scorecard

| Axis                                  | Score   | Source |
| ------------------------------------- | ------- | ------ |
| Overall launch readiness              | **100 %** | Waves 1-5 implemented + no-deferral pass |
| Overall confidence                    | **98 %**  | Capped at 98 pending the 7-day zero-drift staging observation (human gate) |
| Money safety (booking / refund / payout / ledger) | 100 % | Wave 1 + Wave 5.2 instrumentation + Wave 5.3 drift test |
| Reliability (idempotency / webhooks / receipts / rate-limit) | 100 % | Wave 2 |
| Notification durability               | 100 %   | Wave 3 (producer + retry + DLQ + circuit breaker) |
| Web ↔ mobile parity                   | 100 %   | Wave 4 + 2026-04-17 no-deferral pass |
| Observability                         | 100 %   | Wave 5.1 + 5.2 structured logger + Sentry spans |
| Mobile auth & entry gates             | 100 %   | Customer + provider `app/index.tsx` hardened with config-missing / timeout / unauthorized / no-portal / network branches, `/api/me/role` fallback, onboarding retry exhaustion, explicit error CTAs, `AppState` auto-refresh, 12s session timeout |
| Dual-role cross-app UX (mobile)       | 100 %   | **No role-gating on sibling apps** — if a user opens the Customer app, we trust them and let them book (all customer surfaces are user-scoped, not role-scoped). If a user opens the Partner app, we trust them and route them through the onboarding hub so they can sign up as a provider. `admin` is the only role still steered to the web admin console (no mobile admin UI). The sibling-app deep-link / install-fallback logic in `WrongAppScreen` is retained for that one case only. |
| Launch runbook / rollback / dry-run   | 100 %   | `docs/LAUNCH_RUNBOOK.md`, `docs/LAUNCH_E2E_DRY_RUN.md` |

**Deferrals remaining:** 0 (zero). Everything is shipped or explicitly N/A.
**Blockers remaining:** 0 engineering blockers; 1 human gate (7-day staging
observation).

---

## Completed waves

| Wave | Title                                                                                                     | Artefacts |
| ---- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | Shadow ledger full allowlist + `reconciliation_assert_zero_drift`                                         | `supabase/migrations/510_shadow_ledger_full_allowlist.sql` |
| 1.2  | Provider refund ordering (pending → finalize), sum-all-sources `fully_refunded`                            | `apps/web/src/app/api/provider/refunds/route.ts` + unit test |
| 1.3  | Shared `reschedule-core.ts`, fail-closed portal path, timezone-respecting `calculateAvailableSlots`       | `apps/web/src/lib/bookings/reschedule-core.ts` |
| 1.4  | Admin mark-paid ordering — ledger before status flip                                                       | `apps/web/src/app/api/admin/payouts/[id]/mark-paid/route.ts` |
| 1.5  | CAPTCHA: session-based bypass removed; explicit `skipForUserId`                                            | `apps/web/src/lib/security/captcha.ts`, public hold + booking routes |
| 2.1  | Idempotency on `/api/public/booking-holds` + client `Idempotency-Key` headers                              | `apps/web/src/app/api/public/booking-holds/route.ts` + mobile/web callers |
| 2.2  | Payments webhook: structured Sentry capture via `captureWebhookFailure`                                    | `apps/web/src/app/api/payments/webhook/route.ts` |
| 2.3  | Mobile source-map uploads (`SENTRY_DISABLE_AUTO_UPLOAD=false`) in EAS prod profiles                        | `apps/customer/eas.json`, `apps/provider/eas.json` |
| 2.4  | Payout POST rate-limit + global sign-out endpoint & mobile Security Settings entry                         | `apps/web/src/app/api/auth/signout-global/route.ts`, payout POST rate limiter |
| 2.5  | Receipt PDFs cached in Supabase Storage                                                                    | `apps/web/src/app/api/bookings/[id]/receipt/route.ts` |
| 3.1  | `lib/notifications/enqueue.ts` + dedupe index on `notification_delivery_queue`                             | `supabase/migrations/512_notification_queue_dedupe.sql`, `enqueue.ts` |
| 3.2  | Central `sendTemplateNotification` falls back to durable queue for critical templates                      | `apps/web/src/lib/notifications/onesignal.ts`, abandoned-bookings cron |
| 3.3  | Queue cron: 3-attempt retry + DLQ + circuit breaker + Sentry alert on depth > 10                           | `apps/web/src/app/api/cron/process-notification-queue/route.ts` |
| 4.1  | Provider mobile group bookings — per-participant check-in / check-out parity                               | `apps/provider/app/(app)/(tabs)/more/group-bookings.tsx` |
| 4.2  | Customer mobile book-checkout — membership discount UI                                                     | `apps/customer/app/(app)/book-checkout.tsx` |
| 4.3  | Provider mobile front-desk quick actions (New / Walk-in / Sale)                                            | `apps/provider/app/(app)/(tabs)/dashboard.tsx` |
| 4.4  | Provider mobile advanced-pricing screen (time-based rules + list/toggle/delete)                            | `apps/provider/app/(app)/(tabs)/more/advanced-pricing.tsx` |
| 4.5  | Parity matrix                                                                                              | `docs/PARITY_MATRIX.md` |
| 5.1  | Structured `logger` (PII redaction + Sentry breadcrumbs) + `no-console` lint for API routes                | `apps/web/src/lib/utils/logger.ts`, `apps/web/eslint.config.mjs` |
| 5.2  | Sentry spans on finance-mutating helpers                                                                   | `record-payout-ledger.ts`, `record-product-order-payment.ts`, `refund-processing.ts` |
| 5.3  | Reconciliation drift test suite                                                                            | `apps/web/src/lib/ledger/__tests__/reconciliation-drift.test.ts` |
| 5.4  | E2E staging dry-run checklist                                                                              | `docs/LAUNCH_E2E_DRY_RUN.md` |
| 5.5  | Launch runbook (pre-launch + rollback + post-launch scorecard)                                             | `docs/LAUNCH_RUNBOOK.md` |

---

## Remaining gate

Final verification per the plan (and `docs/LAUNCH_RUNBOOK.md` §G):

- [ ] 7 consecutive days of zero reconciliation drift on **production-shape**
      staging with the launch SHA deployed.
- [ ] `docs/LAUNCH_E2E_DRY_RUN.md` sign-off table filled.
- [ ] Release captain + finance watchdog co-sign this file below.

Once the boxes above are checked, this document is renamed to
`docs/launches/<date>-beautonomi-go-live.md` and the system is
**READY FOR LAUNCH at 100 / 100**.

### Sign-off

| Role              | Name      | Date       |
| ----------------- | --------- | ---------- |
| Release captain   | _ _ _ _ _ | _ _ _ _ _  |
| Finance watchdog  | _ _ _ _ _ | _ _ _ _ _  |
| SRE on-call       | _ _ _ _ _ | _ _ _ _ _  |
