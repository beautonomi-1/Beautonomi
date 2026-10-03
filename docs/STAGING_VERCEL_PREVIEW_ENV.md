# Staging Supabase + Vercel Preview (copy into Vercel)

Project: **beautonomi-staging** (`byfzhyqvtbasxptxdupf`, Frankfurt).

Set these on the **web** Vercel project under **Settings → Environment Variables**, scope **Preview** only (not Production).

| Variable | Value / notes |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://byfzhyqvtbasxptxdupf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API → anon (legacy JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service_role (**Sensitive**) — **required on Preview** for build gate + tenant resolution |
| `NEXT_PUBLIC_APP_URL` | `https://staging.beautonomi.com` |
| `CRON_SECRET` | **Required on Preview** — build fails without it (`check-security-env.mjs`). Generate a long random string (Preview ≠ Production is fine). |
| `CSRF_SECRET` | Recommended on Preview; if omitted, `CRON_SECRET` is used for CSRF at runtime. |
| Paystack | **Test** keys for Preview |
| `TENANT_DOMAIN_ENV` | **`preview`** (must match migration **970** `tenant_domains.environment`) |
| `TENANT_DOMAIN_FALLBACK_TO_PRODUCTION` | **`false`** (Preview hosts must not inherit prod hostname map) |
| `STRICT_TENANT_HOST_RESOLUTION` | **`true`** only if **`SUPABASE_SERVICE_ROLE_KEY`** is set; otherwise tenant APIs return **503 Tenant not configured** |

**Do not** point Preview at production Supabase (`ifybcfafrwcpptckznpm`) unless you intentionally test against prod data. Staging DB is `byfzhyqvtbasxptxdupf`.

Keys can also be listed locally (when logged into Supabase CLI):

```powershell
supabase projects api-keys --project-ref byfzhyqvtbasxptxdupf
```

## Preview build failed: “FATAL: Required security env vars are missing”

If Vercel logs show `✗ CRON_SECRET` / `✗ SUPABASE_SERVICE_ROLE_KEY` during `[security-env]` even though variables exist in the dashboard:

1. Scope **`CRON_SECRET`** and **`SUPABASE_SERVICE_ROLE_KEY`** to **Preview** (or All Pre-Production), not Production only.
2. Ensure **`turbo.json`** lists them in `globalPassThroughEnv` (monorepo) so Turbo forwards Vercel env into `web#build`.
3. Redeploy Preview again (failed build leaves the **previous** deployment live — env fixes do not apply until build succeeds).

## Redeploy Preview

After env changes:

1. **Vercel** → Deployments → latest **Preview** → **Redeploy**, or  
2. Push to `develop` (triggers [`.github/workflows/vercel-deploy.yml`](../.github/workflows/vercel-deploy.yml) if `VERCEL_DEPLOY_HOOK_DEVELOP` is set).

## Already applied on staging DB

- Migrations through **970** (includes `staging.beautonomi.com` / `staging.beautonomi.co.za` in `tenant_domains` with `environment = preview`).
- Auth **Site URL** and redirect allow-list include `https://staging.beautonomi.com/**`.

## Domain must be Preview (not Production)

In **Vercel → Domains**, `staging.beautonomi.com` must be assigned to the **Preview** environment.

Staging `tenant_domains` rows use **`environment = preview`** only (migration **970**). If the hostname is served by a **Production** deployment (`VERCEL_ENV=production`), lookup uses **`production`** and finds **no row** → **`503` Tenant not configured** even when Supabase keys are correct.

After env or domain changes, **redeploy** (env vars alone do not update an old deployment).

## Browser diagnostics (while logged into Vercel SSO)

Open (same tab as staging):

`https://staging.beautonomi.com/api/public/staging-deploy-meta`

Check:

| Field | Expected |
|--------|-----------|
| `vercel_env` | `preview` |
| `tenant_domain_env` | `preview` |
| `supabase_*_ref` | all `byfzhyqvtbasxptxdupf` |
| `supabase_keys_aligned` | `true` |
| `tenant_resolution` | `ok` |
| `tenant_slug` | `za` |

Read `hints[]` in the JSON if anything is wrong.

## Admin `/admin/login` on staging

- **`ADMIN_HOST`** / **`ENABLE_ADMIN_HOST_ROUTING`** on **Production only** is normal — staging admin is **`https://staging.beautonomi.com/admin/login`** via **`ADMIN_SPA_ROUTING=spa`** (All Environments).
- **`GET /api/admin/bootstrap` → 401** before sign-in is expected (no admin session cookie).
- **`POST /api/auth/sign-in` → 401** usually means wrong password or the user does **not** exist on **staging** Supabase (`byfzhyqvtbasxptxdupf`), not production.
- **“Invalid path specified in request URL”** (Supabase Auth): confirm staging Auth **Site URL** is `https://staging.beautonomi.com` and redirect allow-list includes `https://staging.beautonomi.com/**` (`supabase config push --project-ref byfzhyqvtbasxptxdupf`). Ensure **`NEXT_PUBLIC_SUPABASE_*`** on Preview match staging and you **rebuilt** after changing them.

CSP lines in the console are **report-only** and do not block scripts.

## Troubleshooting: “Tenant not configured” on staging home

The homepage shell loads but sections show **Unable to load providers / Tenant not configured** when **`GET /api/public/home`** returns **503** `TENANT_UNAVAILABLE`. The staging **database** is usually fine; the **Vercel Preview runtime** is misconfigured.

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Tenant not configured (logged into Vercel SSO) | Missing **`SUPABASE_SERVICE_ROLE_KEY`** on Preview with **`STRICT_TENANT_HOST_RESOLUTION=true`** | Add staging service role to Preview env; redeploy |
| Same | **`TENANT_DOMAIN_ENV=production`** (or unset while forcing production map) | Set **`TENANT_DOMAIN_ENV=preview`** |
| Same | Preview uses **production** `NEXT_PUBLIC_SUPABASE_URL` without matching keys | Use **staging** URL + keys (table above) |
| Vercel login redirect | Deployment Protection | Log into Vercel team or use **`VERCEL_AUTOMATION_BYPASS_SECRET`** for CI |

Verify locally:

```powershell
pnpm verify:staging:preview
# With bypass (GitHub secret value):
$env:VERCEL_AUTOMATION_BYPASS_SECRET = "..."
pnpm verify:staging:preview
```

Provider cards on staging will **not** match production until you run **`pnpm staging:db:e2e`** (config sync + seeds); staging intentionally uses its own data.
