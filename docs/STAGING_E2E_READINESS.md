# Staging end-to-end readiness

## Automated checks (local)

Requires [Supabase CLI](https://supabase.com/docs/guides/cli) logged in (`supabase login`).

```powershell
cd C:\Users\NoloSehlolo\Documents\Beautonomi

# Parity: buckets + core tables (prod vs staging)
pnpm compare:supabase

# Full gate: buckets, tables, preview domains, verify:db on both projects,
# create production `receipts` bucket if missing, sync public assets prod → staging
pnpm readiness:supabase

# Check only (no prod fix, no asset sync)
pnpm readiness:supabase:check
```

## What “ready” means

| Layer | Staging | Production |
|--------|---------|------------|
| **Migrations** | Git migrations through **971** via `supabase db push` | Schema live; **no** `schema_migrations` ledger in CLI — **do not** run full `db push` on prod without a baseline plan |
| **Storage buckets** | All canonical buckets (971 + migration-created) | Same set; **`receipts`** bucket added for app code (prod historically had typo `reciepts` only) |
| **Storage files** | Public CMS/learning assets copied from prod via `readiness:supabase` | Source of truth for seeded public files |
| **Tenant hosts** | **970** preview rows: `staging.beautonomi.com`, `staging.beautonomi.co.za` | Production hosts from 358/789 |
| **Auth** | `supabase config push --project-ref byfzhyqvtbasxptxdupf` (see `supabase/config.toml` `[auth]`) | Dashboard URLs unchanged by staging tooling |
| **Vercel Preview** | Env vars in [`.env.staging.preview.example`](../apps/web/.env.staging.preview.example) | Production env separate |

## Deploy Preview

1. Set Vercel **Preview** env from [`.env.staging.preview.example`](../apps/web/.env.staging.preview.example) (all keys marked there).
2. Assign **`staging.beautonomi.com`** to the Preview environment in Vercel (Domains), so Host → tenant resolution hits migration **970** rows (`environment = preview`).
3. Redeploy `develop` or trigger [VERCEL_DEPLOY_HOOK_DEVELOP](VERCEL_DEPLOY_HOOKS.md).
4. Smoke: `/signup` (hero from staging storage), login (redirect allow-list on staging Supabase Auth), `/api/public/home` (200 with ZA tenant).

### Why this wiring works

- **`TENANT_DOMAIN_ENV=preview`** (or `VERCEL_ENV=preview`) selects `tenant_domains.environment = preview` ([`tenant-domain-environment.ts`](../apps/web/src/lib/tenant/tenant-domain-environment.ts)).
- **970** maps `staging.beautonomi.com` → `tenants.slug = za`.
- **`NEXT_PUBLIC_*`** point at **staging** Supabase; **`NEXT_PUBLIC_APP_URL`** matches Auth site URL and Paystack callbacks.
- **`pnpm readiness:supabase:check`** confirms buckets, core tables, preview domain rows, and `verify:db` on both Supabase projects.

## Ongoing migrations

```powershell
supabase link --project-ref byfzhyqvtbasxptxdupf
.\scripts\supabase-push-staging.ps1
pnpm readiness:supabase:check
```
