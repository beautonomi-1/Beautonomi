# Platform audit remediation — verification (Phase 9)

## Automated (local)

```bash
pnpm typecheck
pnpm lint
pnpm --filter web exec vitest run src/lib/__tests__/bookings-write-client-static.test.ts
pnpm --filter web exec vitest run src/lib/security/__tests__/rls-harness.test.ts
pnpm --filter web exec vitest run src/lib/provider/__tests__/available-payout-balance-scenarios.test.ts
pnpm --filter web exec vitest run src/lib/bookings/__tests__/verify-paystack-booking-charge.test.ts
pnpm --filter web exec vitest run src/app/api/payments/webhook/__tests__/route.signature-idempotency.test.ts
```

Full monorepo: `pnpm test` (compare to [BASELINE.md](./BASELINE.md)).

## Staging E2E

Set `E2E_STAGING_API_URL` and run:

- `apps/web/e2e/money-path.spec.ts`
- `apps/web/e2e/booking-happy-path` (if configured)
- `apps/web/e2e/concurrent-booking-slot.spec.ts`

## Migration rollout order

Apply after deploying app code that uses `getBookingsAdminClient()` for all booking writes:

1. `944_bookings_client_write_lockdown.sql`
2. `945_booking_status_transition_guard.sql` (shadow mode — logs to `booking_status_transition_violations`)
3. `946_booking_staff_schedule_lock.sql`
4. `947_booking_commission_snapshot.sql`
5. `948_payout_request_fraud_hold.sql`

Deferred: `docs/audit-remediation/deferred/booking_status_guard_enforce.sql` switches the guard to
`RAISE EXCEPTION 'ILLEGAL_STATUS_TRANSITION'`. Ship it only after 7 days in production with zero
unexplained rows in `booking_status_transition_violations`; copy it into `supabase/migrations/` with
the next free migration number at that time.

## Manual staging checklist

- [ ] Customer card checkout → provider complete → payout request → admin transfer
- [ ] Cancel inside / outside policy window; no-show; partial refund
- [ ] Customer reschedule; walk-in cash
- [ ] Held provider payout request returns 409 `PAYOUT_HELD`
- [ ] Post-944: customer JWT cannot `PATCH` bookings via PostgREST
- [ ] Paystack webhook retry on 503 when lease held (observe webhook_events)
