# Runbook — finance period close

> Used to freeze a month of financial data so reports are reproducible and
> further writes are blocked. Pairs with migration `492_finance_enforce_period_locks.sql`.

## When to run

- Monthly, on the 3rd business day of the following month (after all late
  webhooks have settled).
- On demand for a tenant that needs an audited period (e.g. year-end).

## Preconditions

- All scheduled jobs for the period have completed:
  - `/api/cron/expire-booking-holds` — no expired holds for the period.
  - `/api/cron/expire-cancelled-subscriptions` — subscriptions posted.
  - `/api/cron/provider-stall-check` — no stuck provider payouts.
- Nightly finance audit (`scripts/prod/audit-finance-ledger.mjs`) exited
  clean for the period (script **requires** migration `724` RPC; exits non-zero if missing).
- Ledger Health (`/admin/ledger-health`) or `ledger_reconciliation_summary` RPC
  shows no open drift for the tenant. Do **not** rely on raw `v_ledger_reconciliation`
  alone — `provider_earnings` rows intentionally have no journal entry.

## Procedure

1. Run audit locally against prod credentials (read-only):

   ```bash
   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<secret> \
     node scripts/prod/audit-finance-ledger.mjs 2026-03-01 2026-03-31
   ```

   Abort if the script reports any discrepancies or exits `2` (RPC missing).

2. Close the period in the admin UI (`/admin/period-locks`) OR via
   SQL:

   ```sql
   INSERT INTO public.financial_period_locks
     (tenant_id, period_start, period_end, locked_by, locked_at, notes)
   VALUES
     ('<tenant-uuid>', '2026-03-01', '2026-03-31', '<admin-uuid>', now(),
      'Monthly close');
   ```

3. Verify the trigger blocks further writes:

   ```sql
   INSERT INTO public.finance_transactions (tenant_id, provider_id, amount, currency, transaction_type, created_at)
   VALUES ('<tenant-uuid>', '<provider>', 1, 'ZAR', 'payment', '2026-03-15');
   -- Expect: ERROR: finance period ... is locked
   ```

4. Publish the closed month's reports (PDFs / CSVs) to the archive bucket.

## Reopening a period (emergencies only)

Reopening **deletes** the lock row (there is no `reopened_at` column). Only do
this after written approval from the CFO.

```sql
DELETE FROM public.financial_period_locks
WHERE tenant_id = '<tenant>' AND period_start = '2026-03-01' AND period_end = '2026-03-31';
```

Or use the admin UI unlock action on `/admin/period-locks`.

After reopening:
- Notify finance + audit stakeholders.
- Add a `period_reopen` audit log row.
- Close the period again as soon as the corrective writes are posted.
