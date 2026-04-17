# Soft-delete policy

> Status: adopted 2026-04-17 (F29 in the audit remediation plan).

## Why soft-delete?

We operate a fintech/marketplace where audit, refunds, and reporting must still
work after a user "deletes" their record. Hard-deleting rows breaks:

- Historical financial reports (a booking with no provider row cannot be
  aggregated by provider).
- Dispute/refund trails (customer-facing apps need to show the past even if
  the account was closed).
- RLS joins (soft-deleted rows still exist for admins).

Instead of `DELETE`, user-facing entities are flagged with `deleted_at`
timestamps and excluded from normal reads via filtered views.

## Scope

Soft-delete applies to the following entity tables:

- `users`
- `providers`
- `offerings`
- `products`
- `provider_locations`
- `provider_staff`
- `booking_holds` (short-lived; still soft-deleted for audit)

Tables that are **exempt** (hard-delete is OK):

- Ephemeral OTP tables (`sms_otp`, etc.).
- Analytics/event streams (`finance_transactions` is append-only by design).
- Webhook events (pruned by cron — see `prune-webhook-events`).

## Implementation

Each in-scope table gets:

1. `deleted_at timestamptz NULL` column.
2. A partial index `CREATE INDEX ... WHERE deleted_at IS NULL` on hot query
   columns so queries that filter it out stay fast.
3. A filtered view `<table>_active` used by app-level code for reads:

   ```sql
   CREATE OR REPLACE VIEW public.providers_active AS
     SELECT * FROM public.providers WHERE deleted_at IS NULL;
   ```

4. RLS policies on the base table use `deleted_at IS NULL` for customer/end-user
   reads; admin roles can still see deleted rows.
5. A `soft_delete_<table>(id uuid, reason text)` function that sets
   `deleted_at = now()` and logs to `audit_log`.

See migration `497_soft_delete_policy.sql` for the baseline schema changes.

## How to delete

Application code **MUST NOT** issue `DELETE FROM ...` against in-scope tables.
Use either:

- `supabase.rpc("soft_delete_provider", { p_provider_id, p_reason })`
- `.update({ deleted_at: new Date().toISOString() }).eq("id", ...)`

## Hard-delete exceptions

Hard deletion is only permitted:

- Via the compliance/erasure cron job (GDPR "right to erasure"), which runs
  ONCE per user after the retention window and is audited in
  `compliance_erasure_log`.
- For tables explicitly declared exempt above.

## Retention / anonymisation windows

- Soft-deleted rows are retained for **365 days** in default environments,
  after which the compliance job anonymises PII-bearing columns but keeps
  aggregate fields for reporting.
- Finance transactions are **never** anonymised — only their customer/provider
  links are redacted.

## Enforcement

A CI lint rule (follow-up: add to `eslint-rules/`) will flag `.delete()` calls
on in-scope tables outside of the compliance job directory.
