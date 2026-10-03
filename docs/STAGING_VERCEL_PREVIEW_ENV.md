# Staging Supabase + Vercel Preview (copy into Vercel)

Project: **beautonomi-staging** (`byfzhyqvtbasxptxdupf`, Frankfurt).

Set these on the **web** Vercel project under **Settings → Environment Variables**, scope **Preview** only (not Production).

| Variable | Value / notes |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://byfzhyqvtbasxptxdupf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Project Settings → API → anon (legacy JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → service_role (**Sensitive**) |
| `NEXT_PUBLIC_APP_URL` | `https://staging.beautonomi.com` |
| `CRON_SECRET` | Generate a long random string (Preview + Production can differ) |
| `CSRF_SECRET` | Generate a long random string |
| Paystack | **Test** keys for Preview |
| `TENANT_DOMAIN_ENV` | **`preview`** (must match migration **970** `tenant_domains.environment`) |
| `TENANT_DOMAIN_FALLBACK_TO_PRODUCTION` | **`false`** (Preview hosts must not inherit prod hostname map) |
| `STRICT_TENANT_HOST_RESOLUTION` | **`true`** only if **`SUPABASE_SERVICE_ROLE_KEY`** is set; otherwise tenant APIs return **503 Tenant not configured** |

**Do not** point Preview at production Supabase (`ifybcfafrwcpptckznpm`) unless you intentionally test against prod data. Staging DB is `byfzhyqvtbasxptxdupf`.

Keys can also be listed locally (when logged into Supabase CLI):

```powershell
supabase projects api-keys --project-ref byfzhyqvtbasxptxdupf
```

## Redeploy Preview

After env changes:

1. **Vercel** → Deployments → latest **Preview** → **Redeploy**, or  
2. Push to `develop` (triggers [`.github/workflows/vercel-deploy.yml`](../.github/workflows/vercel-deploy.yml) if `VERCEL_DEPLOY_HOOK_DEVELOP` is set).

## Already applied on staging DB

- Migrations through **970** (includes `staging.beautonomi.com` / `staging.beautonomi.co.za` in `tenant_domains` with `environment = preview`).
- Auth **Site URL** and redirect allow-list include `https://staging.beautonomi.com/**`.

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
