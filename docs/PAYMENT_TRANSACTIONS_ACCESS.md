# `payment_transactions` — access model

The table is the **gateway ledger** (Paystack reference, amount, fees). It has **no `tenant_id` column** in current schema (see migration `014_paystack_support.sql`).

- **Idempotency:** `UNIQUE(provider, reference)` prevents duplicate rows for the same Paystack charge reference.
- **RLS:** Policies in older migrations scope reads via `booking_id` → `bookings` (customer/provider), plus service role for jobs.
- **Server-only writes:** Webhook handlers and payment APIs use `getSupabaseAdmin()`; do not expose raw rows on public routes.

If you add `tenant_id` later, backfill from `bookings.tenant_id` and align RLS with **382**/**385** patterns.
