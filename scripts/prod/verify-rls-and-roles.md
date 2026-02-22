# RLS and Roles — Verification Notes

Generated notes from Supabase migrations and codebase patterns. Use as a reference when verifying production RLS and role enforcement; not a substitute for running migrations and testing.

## Source of truth

- **Migrations:** `supabase/migrations/*.sql`
- **Policies:** Grep for `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- **Roles:** Application roles are in `user_profiles.role` (e.g. customer, provider_owner, provider_staff, superadmin) and enforced in API routes via `requireRoleInApi` / `getProviderIdForUser`

## RLS coverage (from migration scan)

Migrations show RLS and policies on (among others):

- **Core:** users, user_profiles, providers, provider_staff, bookings, payments, webhook_events
- **Financial:** finance_transactions, provider_payout_accounts, product_orders, wallet
- **Content:** platform_settings, feature_flags, amplitude_integration_config, control plane tables (module_configs, integrations)
- **Storage:** avatars, service images, gallery, booking documents, receipts, verification documents, explore assets
- **E-commerce:** cart, product reviews, returns, shipping config
- **Provider:** locations, services, clients, forms, waitlist, automations, invoices, membership plans, campaigns, referrals
- **Explore:** explore posts, comments, saved list

Many tables have superadmin policies (e.g. `add_superadmin_*`) allowing full access for support. Provider-scoped tables restrict by `provider_id` with policies that use `auth.uid()` and join to provider_staff/providers.

## Platform_settings and platform_secrets

- **platform_settings.settings:** JSON that may be readable by anon or authenticated roles in some migrations; must not contain secrets. Public endpoints (e.g. branding, third-party-config) read only whitelisted keys.
- **platform_secrets:** Holds secret keys (Paystack, OneSignal, Mapbox, Amplitude, calendar OAuth). RLS should restrict to service role or superadmin only; API uses service role when reading for webhooks/admin.

## Webhook and cron

- **webhook_events:** Idempotency store for Paystack (and optionally others). Writes via service role in API route.
- **Cron:** `/api/cron/*` protected by `CRON_SECRET` or `INTERNAL_API_SECRET`; no RLS on cron execution (server-to-server).

## Verification checklist

1. Ensure all sensitive tables have RLS enabled and policies that restrict by tenant (provider_id) or role (superadmin).
2. Ensure platform_secrets is not readable by anon or by role that client code could use.
3. Ensure service role is used only server-side (Next.js API, cron, webhooks); never in client bundle.
4. After applying new migrations, run a quick test: anon and customer role should not see other providers’ data or platform_secrets.
