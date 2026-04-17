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
  clean for the period.
- `v_ledger_reconciliation` (F14 shadow-writer) shows no rows where
  `journal_entry_id IS NULL` for transactions inside the period.

## Procedure

1. Run audit locally against prod credentials (read-only):

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=<secret> \
     node scripts/prod/audit-finance-ledger.mjs 2026-03-01 2026-03-31
   ```

   Abort if the script reports any discrepancies.

2. Close the period in the admin UI (`/admin/finance/period-close`) OR via
   SQL:

   ```sql
   INSERT INTO public.financial_period_locks
     (tenant_id, period_start, period_end, closed_by, closed_at, note)
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

Reopening unlocks writes for the period. Only do this after written approval
from the CFO.

```sql
UPDATE public.financial_period_locks
SET reopened_at = now(), reopened_by = '<admin>', reopen_reason = '<reason>'
WHERE tenant_id = '<tenant>' AND period_start = '2026-03-01';
```

After reopening:
- Notify finance + audit stakeholders.
- Add a `period_reopen` audit log row.
- Close the period again as soon as the corrective writes are posted.
