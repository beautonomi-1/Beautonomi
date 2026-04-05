# Secrets Bootstrap Guide

Use this guide to set the minimum variables required to pass production-scale gates and launch the global platform.

## Minimum for Scale Gates

Required:

- `NEXT_PUBLIC_SENTRY_DSN`

Recommended:

- `EXPO_PUBLIC_SENTRY_DSN`
- `SLACK_ALERT_WEBHOOK_URL`

## Production Env Vars – Global Platform (copy-paste ready)

### Web (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Scope |
|----------|-------|-------|
| `STRICT_TENANT_HOST_RESOLUTION` | `true` | Production |
| `NEXT_PUBLIC_GLOBAL_ENTRY_HOST` | `beautonomi.com` | Production, Preview |
| `NEXT_PUBLIC_DEFAULT_MARKET_HOST` | `beautonomi.co.za` | Production, Preview |
| `SUPPORTED_MARKET_COUNTRIES` | `ZA` | Production |
| `RESTRICTED_COUNTRIES` | *(empty – set per policy)* | Production |
| `TENANT_HOST_COUNTRY_MAP` | `{"beautonomi.co.za":"ZA","www.beautonomi.co.za":"ZA"}` | Production |
| `MARKET_AUTO_SWITCH_ENABLED` | `true` | Production |
| `MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES` | `ZA` | Production |
| `NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS` | `24` | Production, Preview |
| `NEXT_PUBLIC_SENTRY_DSN` | `<your-web-sentry-dsn>` | Production, Preview |
| `NEXT_PUBLIC_APP_URL` | `https://beautonomi.com` | Production |

> **Expanding markets:** When adding UK, update `SUPPORTED_MARKET_COUNTRIES=ZA,GB`, add `"beautonomi.co.uk":"GB","www.beautonomi.co.uk":"GB"` to the host map, and add `GB` to `MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES`.

### Mobile – Provider App (EAS / `eas.json` env overrides)

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_APP_URL` | `https://beautonomi.com` |
| `EXPO_PUBLIC_WEB_API_TENANT_HOST` | `beautonomi.co.za` |
| `EXPO_PUBLIC_GLOBAL_ENTRY_HOST` | `beautonomi.com` |
| `EXPO_PUBLIC_DEFAULT_MARKET_HOST` | `beautonomi.co.za` |
| `EXPO_PUBLIC_MARKET_HOST_OPTIONS` | `beautonomi.co.za\|South Africa` |
| `EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS` | `24` |
| `EXPO_PUBLIC_SENTRY_DSN` | `<your-mobile-provider-sentry-dsn>` |

### Mobile – Customer App (EAS / `eas.json` env overrides)

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_APP_URL` | `https://beautonomi.com` |
| `EXPO_PUBLIC_WEB_API_TENANT_HOST` | `beautonomi.co.za` |
| `EXPO_PUBLIC_GLOBAL_ENTRY_HOST` | `beautonomi.com` |
| `EXPO_PUBLIC_DEFAULT_MARKET_HOST` | `beautonomi.co.za` |
| `EXPO_PUBLIC_MARKET_HOST_OPTIONS` | `beautonomi.co.za\|South Africa` |
| `EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS` | `24` |
| `EXPO_PUBLIC_SENTRY_DSN` | `<your-mobile-customer-sentry-dsn>` |

## 1) Local Development

### Web

Set in `apps/web/.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN=<your-web-sentry-dsn>
```

### Mobile (customer/provider)

Set in each app `.env.local` as applicable:

```env
EXPO_PUBLIC_SENTRY_DSN=<your-mobile-sentry-dsn>
```

### Optional alert webhook

For local script checks:

```powershell
$env:SLACK_ALERT_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

## 2) GitHub Actions Secrets

Repository -> Settings -> Secrets and variables -> Actions -> New repository secret:

- `NEXT_PUBLIC_SENTRY_DSN` (required for pre-rollout gates)
- `EXPO_PUBLIC_SENTRY_DSN` (recommended)
- `SLACK_ALERT_WEBHOOK_URL` (recommended)

Used by workflows:

- `.github/workflows/pre-rollout-gates.yml`
- `.github/workflows/scale-verification.yml`

## 3) Hosting Environment (Web)

Set all variables from the **Production Env Vars** table above in your deployment provider.

If using Vercel:

- Project -> Settings -> Environment Variables
- Add per environment scope (Production / Preview)
- Copy the values exactly as shown in the table

## 4) Verify

Run:

```bash
pnpm run prod:check:observability
```

Expected:

- `Result: PASS (required observability gates satisfied).`

## Troubleshooting

- If gate fails for `NEXT_PUBLIC_SENTRY_DSN`:
  - confirm exact variable name
  - ensure env is available in the process where script runs
  - restart shell/CI job after adding env vars
- If tenant resolution returns 404 / falls back unexpectedly:
  - confirm `TENANT_HOST_COUNTRY_MAP` JSON is valid
  - confirm both bare and `www.` variants are mapped
  - confirm `STRICT_TENANT_HOST_RESOLUTION=true` is set
  - check `tenant_domains` table has matching hostnames
