# Fee Management and Revenue

## What Fee Management is

**Admin path:** `/admin/fees` (superadmin only).

Fee Management lets you:

1. **Configure** – Set expected fee rates per payment gateway (e.g. Paystack: 1.5% + fixed). Stored in `payment_gateway_fee_configs`.
2. **Adjust** – Record one-off fee corrections/waivers for specific transactions in `payment_fee_adjustments` (and optionally update the related `payment_transactions.fees` / `finance_transactions.fees`).
3. **Reconcile** – Compare expected fees (from your config + transactions) vs actual fees from gateway statements; record variances in `fee_reconciliations`.

## How it impacts revenue

- **Gross revenue** = total amount customers pay (booking totals, etc.).
- **Gateway fees** = what the payment gateway (e.g. Paystack) charges **the platform** on each transaction. These are a **platform cost**, not a deduction from provider earnings.
- **Net revenue** (platform) = gross revenue from platform’s perspective minus gateway fees.
- **Provider earnings** = calculated per your commission/take rules; they are **not** reduced by gateway fees. Gateway fees are borne by the platform.
- **Platform take** = commission (and any other platform share) minus gateway fees. So:
  - **Accurate fee config** → correct expected gateway cost and thus correct view of **platform take** and **net revenue**.
  - **Adjustments** → align recorded fees with reality when there are discrepancies (e.g. refunds, waivers, corrections).
  - **Reconciliations** → align expected vs actual gateway fees (e.g. from monthly statements) so revenue and cost reporting are correct.

## Wiring in the app

- **Configs:** CRUD via `/api/admin/fees/configs` (GET/POST/PATCH). Data in `payment_gateway_fee_configs`. Used to define *expected* fee rules per gateway/currency.
- **Adjustments:** `/api/admin/fees/adjustments`. Writes to `payment_fee_adjustments`; optionally updates `payment_transactions.fees` or `finance_transactions.fees` when you correct a specific transaction.
- **Reconciliations:** `/api/admin/fees/reconciliations`. Writes to `fee_reconciliations` (expected vs actual fees, variance, status).

The DB function `calculate_expected_fee(gateway_name, transaction_amount, currency)` returns the expected fee for a given amount using the active config for that gateway/currency. It can be used in reporting or in backend logic that needs an expected fee (e.g. finance summaries).

## If the tables are missing

If you see **“Could not find the table 'public.payment_gateway_fee_configs' in the schema cache”**:

1. Run migrations so the fee tables exist. Migration **246_payment_gateway_fee_tables_ensure.sql** creates `payment_gateway_fee_configs`, `payment_fee_adjustments`, and `fee_reconciliations` if they are missing (idempotent).
2. The Fee Management APIs are written to treat “table not in schema cache” as “no data yet”: they return empty lists so the Fee Management page still loads. After applying the migration, reload and add configs as needed.
