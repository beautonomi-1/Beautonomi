# Booking flows release checklist

Use after code merge, before enabling split payment in production.

## 1. Database

```powershell
./scripts/supabase-push-staging.ps1
```

Confirm migrations **1029** through **1037** applied (no pending in `supabase migration list`).

Verify RPC:

```sql
SELECT pg_get_functiondef('public.create_booking_with_locking'::regprocedure);
-- Must include guest_name and group_participant_id in booking_services INSERT.
```

## 2. Phase 0 reports (staging or prod snapshot)

Run all queries in `scripts/prod/booking-flows-baseline-reports.sql`. Archive results.

| After | Expect |
|-------|--------|
| Phase 1 deploy | Report 1: no new duplicate group lines; report 4 totals backfilled |
| Phase 4 deploy | Report 5: no new mislabelled partial refunds |
| Phase 5 | Split/invite columns present; templates `group_invite_guest`, `group_share_paid`, `group_guest_cancelled` in `notification_templates` |

## 3. Automated tests (CI or local)

```bash
cd apps/web && npx vitest run
cd apps/customer && npm test
cd apps/provider && npm test
cd apps/web && npx tsc --noEmit
```

## 4. Manual E2E

`docs/qa/BOOKING_FLOWS_E2E_MATRIX.md` on web, customer app, and provider app.

## 5. Rollout order

1. Phases 1–4 (safe without split opt-in).
2. Phase 5: keep **`group_split_payment_enabled = false`** until E2E split scenarios pass; then opt in per provider.

## 6. Optional data repair

- Report 5 rows: manual PATCH or SQL to fix `payment_status` on partial refunds.
- Report 1 historical dupes: migration **1030** on deploy (audit table + delete).
