# Paystack: Vercel env + Supabase ZA region

## Resolution order (ZA tenants)

1. `region_secrets.paystack_secret_key`
2. `tenant_secrets` / tenant `platform_secrets`
3. Global `platform_secrets`
4. **`PAYSTACK_SECRET_KEY`** on Vercel

Public key for clients: **`region_settings.paystack_public_key`**, with fallback to **`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`** / **`PAYSTACK_PUBLIC_KEY`** in the config bundle when region public is unset.

## Vercel (required)

| Scope | `PAYSTACK_SECRET_KEY` | Public (recommended) |
|-------|------------------------|----------------------|
| **Production** | `sk_live_…` | `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` or `PAYSTACK_PUBLIC_KEY` = `pk_live_…` |
| **Preview** | `sk_test_…` | `pk_test_…` |

Redeploy after changing env vars. `/api/health` only validates **`PAYSTACK_SECRET_KEY`** on the server (live on production).

## Align Supabase with Vercel (one-time)

Copy the **same** keys from Vercel into a gitignored file:

```powershell
copy apps\web\.env.paystack.sync.example apps\web\.env.paystack.sync.local
# edit .env.paystack.sync.local — paste live or test keys
pnpm sync:paystack:production
pnpm sync:paystack:staging
```

Or **Admin → Integrations → Paystack** (global scope): saving keys updates **`platform_secrets`** and **ZA region** rows automatically.

## If production had test keys in `region_secrets`

`pnpm sync:paystack:production:clear-region` removes ZA region Paystack overrides so Vercel live keys apply. (Already run once during go-live setup if region showed `sk_test`.)

## Staging Preview

Staging DB had no Paystack rows; Preview **`sk_test_`** on Vercel is enough for server calls until you run `pnpm sync:paystack:staging` to populate DB for admin parity.
