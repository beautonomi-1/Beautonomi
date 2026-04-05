# `create_booking_payment` RPC (optional DB function)

The web route `POST /api/provider/bookings/[id]/mark-paid` calls `create_booking_payment(...)` when the function exists in the database; otherwise it inserts into `booking_payments` directly.

**This repository** does not ship a migration that creates `create_booking_payment`. Some environments may define it manually.

**Tenant alignment:** After migration **381**, `booking_payments.tenant_id` is NOT NULL. Inserts should set `tenant_id` from the booking or rely on the trigger `booking_payments_set_tenant_from_booking` (see `381_booking_payments_tenant_id.sql`). The mark-paid fallback path passes `tenant_id` from the loaded booking row.

**If you maintain a custom RPC:** ensure it sets `tenant_id` (or that the trigger runs on insert) so RLS and reporting stay correct.
