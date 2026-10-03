# Go-live readiness — status

**Source of truth:** run `pnpm go-live:check` (or `pnpm go-live:check:full` before a major release). The latest automated report lives under [`docs/go-live/`](./go-live/).

| Report | Verdict |
|--------|---------|
| [GO_LIVE_REPORT_2026-10-03.md](./go-live/GO_LIVE_REPORT_2026-10-03.md) | **Go** @ `007eae77` — automated gates green; **manual ops checklist signed off** (2026-10-03); finance drift success |

## What the check covers

- **Repo / CI:** clean git on `main`, migrations, deps audit, typecheck/lint, multi-tenant strict, cron schedule, observability gates, GitHub Actions CI on HEAD (E2E + finance drift as warnings).
- **Supabase:** readiness + compare, production `handle_new_user` `search_path`, `za` tenant/domains, Paystack `sk_test` scan, staging signup + seed.
- **Live HTTP:** production health, public tenant APIs, secret scan, security headers, cron auth, TLS redirect; staging E2E hosts when `VERCEL_AUTOMATION_BYPASS_SECRET` is set.
- **Mobile:** release check + Expo config (warnings).

Manual items (Vercel env, PITR, Paystack webhook, DNS, bypass rotation, on-call) are listed in each generated report and marked complete in the 2026-10-03 sign-off.

## Ops notes

- **Finance drift nightly:** **Green** (2026-10-03) — production audit OK after BO-10067 ledger backfill; `SUPABASE_PRODUCTION_SERVICE_ROLE_KEY` on GitHub Actions.
- **Paystack:** runtime uses Vercel `PAYSTACK_SECRET_KEY`; DB must not contain `sk_test` overrides in production.

## Commands

```powershell
pnpm go-live:check
pnpm go-live:check:full
pnpm go-live:check:offline
```
