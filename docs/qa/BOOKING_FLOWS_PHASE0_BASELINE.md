# Booking flows — Phase 0 baseline

Read-only checks before and after migrations `1029`–`1037`.

## Automated tests

From repo root:

```bash
pnpm test
```

Save any pre-fix failures for comparison. After deploy, the booking/group/order/custom-offer suites should be green.

## Production SQL reports

Run each query in `scripts/prod/booking-flows-baseline-reports.sql` against production (or a production snapshot). Record counts and sample IDs in your change ticket.

| Report | Purpose |
|--------|---------|
| 1 | Duplicate group service lines (online bookings with `group_booking_id`) |
| 2 | Providers with `group_booking_enabled = false` but staff-created groups |
| 3 | `booking_status_transition_violations` (last 60 days) |
| 4 | Online groups with null/zero `total_price` |
| 5 | Partial product refunds mislabelled as full (`payment_status = refunded`) |

**After Phase 1:** expect report 1 → zero new duplicates; report 4 totals backfilled.

**After Phase 4:** report 5 rows repaired manually; no new mislabelled partials.

**Status guard (optional migration 1032):** only add strict enforcement if report 3 shows no unexpected transitions for targeted flows.

## Staging migration verify

```powershell
./scripts/supabase-push-staging.ps1
```

Confirm `create_booking_with_locking` includes `guest_name` and `group_participant_id`:

```sql
SELECT pg_get_functiondef('public.create_booking_with_locking'::regprocedure);
```

Re-run the five reports on staging after push.
