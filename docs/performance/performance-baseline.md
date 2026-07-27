# Performance baseline (pre-program)

Captured before the snappy-daily-flows performance program. Re-measure after each phase.

## Infrastructure

| Item | Value |
|------|-------|
| Vercel function region | `fra1` (verified in `apps/web/vercel.json`) |
| Supabase region | EU Frankfurt (`eu-central-1`) |
| Metrics source | Vercel Observability + `api_route_completed` logs from `withRouteMetrics` |

## Hot routes to track (p50 / p95 ms)

Fill from Vercel dashboard or log aggregation after deploy:

| Route | p50 | p95 | Notes |
|-------|-----|-----|-------|
| `GET /api/provider/dashboard` | — | — | Includes optional `include=insights` |
| `GET /api/provider/bookings` | — | — | Up to 1000 rows/page |
| `GET /api/provider/finance` | — | — | Ledger aggregation |
| `GET /api/provider/transactions` | — | — | Full-period scan + list slice |
| `GET /api/me/bookings` | — | — | Customer list |
| `GET /api/public/home` | — | — | Cache miss path |

## Test baseline

Run before and after changes (see also [performance-improvements.md](./performance-improvements.md)):

```bash
pnpm --filter provider test
pnpm --filter web test
pnpm --filter provider typecheck
pnpm --filter customer typecheck
```

Status: run locally after deploy to confirm green suites.

## Mobile UX targets (program goals)

| Surface | Target |
|---------|--------|
| Repeat visit time-to-first-content | < 100ms (cached) |
| Daily screens time-to-fresh-data | < 1s |
| Heavy reports interactive | < 3s with progress UX |
