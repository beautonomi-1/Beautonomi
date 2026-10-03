# Supabase Database

This directory contains the Supabase database schema and migrations for the Beautonomi platform.

## Directory Structure

```
supabase/
├── migrations/     # SQL migration files (numbered sequentially)
├── config.toml     # Supabase CLI configuration (if present)
└── seed.sql        # Seed data (if present)
```

## Running Migrations

Migrations are applied via the Supabase dashboard or CLI:

```bash
# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
npx supabase db push

# Create a new migration
npx supabase migration new my_migration_name
```

## Migration Naming Convention

Migrations are numbered sequentially: `001_initial_schema.sql`, `002_users_and_auth.sql`, etc.

> **Note**: The legacy `beautonomi/supabase/` directory contains the original copies. This root-level directory is the canonical source going forward.

## Applying the localization migrations (892–898)

After pulling localization work, apply pending migrations to your Supabase project:

```bash
# From repo root — link once per machine/project
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply all pending migrations (includes 892–898 and home MVs from 824)
npx supabase db push
```

### What these migrations add

| Migration | Objects |
|-----------|---------|
| **892** | Seeds `iso_languages`, global `preference_options` (language), `languages.enabled` feature flag |
| **893** | Tier-market country/currency/region rows |
| **894** | `iso_locales` and `iso_timezones` seed rows |
| **897** | `notification_template_translations` table + fr/ar seed templates |
| **898** | `users.emergency_contact_language` column + ZA `supported_languages` update |
| **824** (earlier) | `public_home_top_rated` and `public_home_hottest` materialized views |

### Regenerate TypeScript types

The web app types file is currently a stub until regenerated:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID \
  > apps/web/src/lib/supabase/database.types.ts
```

Or use the helper scripts in `apps/web/scripts/generate-types.ps1` / `generate-types.sh`.

### Refresh home materialized views

After migration **824** is applied, refresh reporting/home MVs:

```sql
SELECT public.refresh_reporting_views();
```

In production/staging this also runs hourly via `/api/cron/refresh-reports` (see `apps/web/vercel.json`).

### Verify objects locally

```bash
pnpm verify:db
```

Reports missing tables/columns and empty seed tables. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local`.

### Staging / greenfield `db push`

Use the global Supabase CLI (`supabase`, not `npx`) after `supabase login` and `supabase link --project-ref <ref>`.

Some historical migrations share the same numeric prefix (e.g. two `240_*` files). Renamed siblings use a four-digit prefix (`2401_*`, `3111_*`, …). On a **new** project, out-of-order versions may need:

```powershell
# From repo root (see scripts/supabase-push-staging.ps1)
supabase migration repair 240 285 311 312 314 329 381 465 577 806 --status reverted
supabase db push --yes --include-all
```

If the CLI reports `Remote migration versions not found in local`, run the `repair … reverted` line it prints, then `--include-all` again. Do **not** run `repair --status applied` for those versions unless you are fixing history without re-running SQL (it can duplicate history rows).

Hosted Supabase: enable `pgcrypto` / `pg_trgm` in the `extensions` schema where migrations expect it (`001`, `825`, `872`).

### Preview hostname (Vercel)

Migration **970_preview_staging_tenant_domains.sql** seeds `staging.beautonomi.com` and `staging.beautonomi.co.za` with `environment = preview`. Migration **971_storage_buckets_production_parity.sql** creates dashboard buckets that migrations only document. Auth redirects for staging: `supabase config push --project-ref byfzhyqvtbasxptxdupf` (see `supabase/config.toml` `[auth]` — **staging ref only**).

End-to-end gate: [docs/STAGING_E2E_READINESS.md](../docs/STAGING_E2E_READINESS.md) (`pnpm readiness:supabase`).
