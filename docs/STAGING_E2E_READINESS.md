# Staging end-to-end readiness

## Full staging DB prep (before production tenant reset)

Aligns **staging** with **production** platform/tenant settings (not transactional data), then runs catalogue and E2E seeds.

```powershell
cd C:\Users\NoloSehlolo\Documents\Beautonomi

# Preview what would copy from production
pnpm sync:staging:config:dry-run

# Migrations + assets + config sync + postal/GRC/AI/E2E seeds (+ Paystack if .env.paystack.sync.local)
pnpm staging:db:e2e

# Check-only (dry-run config + compare + readiness)
pnpm staging:db:e2e:check
```

**Notes:**

- Production **Paystack live** keys are **not** copied; use `pnpm sync:paystack:staging` with **test** keys in `apps/web/.env.paystack.sync.local`.
- Preview hosts `staging.beautonomi.com` / `.co.za` are **never** overwritten.
- Tenant/region **UUIDs** stay staging-native; rows match by **slug** / **code**.
- After a production **tenant reset**, re-run config sync on staging if prod admin settings changed.

## GitHub Actions (staging E2E)

Set repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `SUPABASE_URL` | Staging project URL (`byfzhyqvtbasxptxdupf`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role (not production) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel **Deployment Protection** automation bypass (Option B header) |
| `E2E_TENANT_A_BASE` | `https://staging.beautonomi.com` |
| `E2E_TENANT_B_BASE` | `https://staging-uk.beautonomi.com` |

**Multi-market isolation:** staging DB must include **`uk`** tenant and `tenant_domains` row **`staging-uk.beautonomi.com`** → `uk` (applied by `pnpm sync:staging:config`). Add the hostname in **Vercel** (Preview / `develop`) and DNS **CNAME** → `cname.vercel-dns.com`.

**Seed:** `node scripts/e2e/seed-staging.mjs` (idempotent; slug `e2e-test-provider-beautonomi`). Requires migrations **972+973** on staging for Auth signup.

**After DNS / secrets change:** run **Actions → E2E Manual (Staging) → Run workflow** (default base URL `https://staging.beautonomi.com`), or locally:

```powershell
pnpm verify:staging:preview
$env:VERCEL_AUTOMATION_BYPASS_SECRET = "your-bypass-secret"
pnpm verify:staging:preview
pnpm run verify:staging:e2e:hosts
```

Preview **Vercel env** (staging Supabase + `TENANT_DOMAIN_ENV=preview` + service role): [STAGING_VERCEL_PREVIEW_ENV.md](./STAGING_VERCEL_PREVIEW_ENV.md).

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
