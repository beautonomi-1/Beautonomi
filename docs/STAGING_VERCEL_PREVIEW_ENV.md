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
| `TENANT_DOMAIN_ENV` | `preview` (if your app reads it for host → tenant resolution) |

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
