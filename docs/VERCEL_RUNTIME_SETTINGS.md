# Vercel runtime settings

Source of truth for Fluid compute, cron duration, cache, and env validation.

## Compute

- Region: `fra1` (`apps/web/vercel.json`). Align the Supabase project with this region.
- Fluid compute: enabled on the web project. Long work after the response uses `after()` / Workflows (`WORKFLOWS_ENABLED`), not hanging the request.
- Skew protection: on for the web project so waiting Workflows and long sessions stay on a compatible deployment.
- Sentry `release` is `VERCEL_GIT_COMMIT_SHA` on server, edge, and client (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`).

## `maxDuration`

| Surface | Target |
| --- | --- |
| `api/cron/*` | 300 (Fluid) |
| PDF / report routes | 60 |
| PSP webhooks | ≥ 30 (set to 60) |
| Default | 15 |

Enforced by `launch-readiness-regression.test.ts`.

## Public cache

`vercel.json` sets `s-maxage=30` on `/api/public/(.*)`. Auth-sensitive public routes must send `Cache-Control: no-store` (`withNoStore`):

- `/api/public/booking-holds/*`
- `/api/public/gift-cards/*`
- `/api/public/ads/event`

## Env validation

`apps/web/src/lib/env.ts` (`validateServerEnv`) runs from `instrumentation.ts` in production. Required names:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `CRON_SECRET`. Optional but used: `CSRF_SECRET`, `AMPLITUDE_SERVER_API_KEY`, Slack / Upstash / Sentry / agent / workflow keys.

Preview vs production key-name parity: keep the same names in both Vercel environments. CI build uses placeholders; production boot fails on missing/placeholder secrets.

## Deploy

`.github/workflows/vercel-deploy.yml` fails if `VERCEL_DEPLOY_HOOK_MAIN` / `_DEVELOP` is unset. After production hook: smoke `/api/health`, `/api/csrf`, and one cron with `CRON_SECRET`. Optional `SLACK_DEPLOY_WEBHOOK` posts `ops.deploy.completed` / `ops.deploy.failed`. Production origin: repo variable `VERCEL_PRODUCTION_URL`.
