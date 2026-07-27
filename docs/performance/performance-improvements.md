# Performance program — post-implementation notes

Re-measure after deploy using Vercel Observability / `api_route_completed` logs (same sources as [performance-baseline.md](./performance-baseline.md)).

## Expected improvements (by phase)

| Phase | Surface | Expected change |
|-------|---------|-----------------|
| 1a | Provider bookings tab | First page renders immediately; remaining pages append in background |
| 1b | Provider dashboard | Base cards paint first; insights cards skeleton then fill |
| 1c–1d | Provider daily tabs | Cached-first + skeletons; tab prefetch removes blank state |
| 1e | Booking status / notifications | Optimistic UI + cache invalidation; realtime reconciles |
| 2 | Customer partner profile | Hero + services first; contact/membership/wishlist deferred after first paint |
| 3a | `/api/provider/finance` | RPC shadow-compare behind `PROVIDER_FINANCE_SUMMARY_RPC` flag (flip when parity clean) |
| 3b | Transactions / sales history | Summary cards first; load-more detail (50→200 cap) |
| 4a | `/api/public/home` | Top-rated section reads MV on cache miss; live visibility filter preserved |
| 4b | Search suggestions | `pg_trgm` GIN indexes on ILIKE columns |
| 4c | Home provider cards | Storage list thumbnails via `withStorageListThumbnail` |

## How to verify

1. **Bookings progressive** — Open bookings on a high-volume account: list appears after page 1 (<1s); row count grows without full-screen spinner.
2. **Dashboard split** — Insights section shows skeleton briefly while base metrics are already visible.
3. **Money freshness** — Re-enter Transactions/Payouts/Finance/Sales without pull-to-refresh; new ledger rows appear within ~1s (focus revalidate).
4. **Finance RPC** — Enable `PROVIDER_FINANCE_SUMMARY_RPC` in staging; confirm zero shadow mismatches in logs for a week before production flip.
5. **Home MV** — Cold cache miss on `/api/public/home`: top-rated section served from `public_home_top_rated`; suspended providers still filtered at request time.
6. **Search** — `EXPLAIN` on suggestion queries shows GIN trigram index usage.

## p95 comparison template

| Route | Baseline p95 | Post-program p95 | Delta |
|-------|--------------|------------------|-------|
| `GET /api/provider/dashboard` | — | — | — |
| `GET /api/provider/bookings` | — | — | — |
| `GET /api/provider/finance` | — | — | — |
| `GET /api/provider/transactions` | — | — | — |
| `GET /api/me/bookings` | — | — | — |
| `GET /api/public/home` | — | — | — |

Fill p95 values from Vercel after each phase deploy.

## QA findings and fixes

Issues found while verifying the implementation, all fixed:

| Area | Issue | Fix |
|------|-------|-----|
| `/api/public/home` MV path | `providerFields` omits `status`/`deleted_at`, and `isProviderPubliclyVisible` treats a missing status as not-public — so every MV row was dropped and the fast path never returned data | Select `status, deleted_at` and apply `applyPublicProviderVisibility` in the MV query |
| `/api/public/home` MV path | SEO filter result was computed then discarded (latent only: the home-page filter is currently a passthrough) | Filter visibility on top of the SEO-filtered rows |
| `provider_finance_summary` RPC | Postgres grants `EXECUTE` to `PUBLIC` by default, so any authenticated user could read another provider's revenue from this `SECURITY DEFINER` function | `REVOKE ALL ... FROM PUBLIC, anon, authenticated` before granting to `service_role` |
| `/api/provider/finance` | Shadow-compare issued an extra RPC round trip on every production request to the route being optimized | Shadow-compare only off-production; in production the RPC runs solely when the flag is on |
| Search indexes | `global_service_categories.name` is ILIKE-scanned by the suggestions route but had no trigram index | Added `idx_global_service_categories_name_trgm` |
| Image thumbnails | Search list endpoints returned full-size storage URLs | `withStorageListThumbnail` applied on `/api/public/home`, `/api/public/search`, and `/api/public/search/suggestions` provider cards |
| Provider dashboard | New insights hook shadowed the existing `insightsLoading`, breaking the build | Renamed to `insightsFetchLoading`; section skeletons now also wait on the insights fetch |
| `fetch-paged-provider-bookings` | `ApiError \| null` was not narrowed at the throw helper | Helper takes `ApiError` directly |
| RPC parity test | Expected values were hardcoded, so SQL drift could not fail the test | Test now parses migration 823 and compares the refund-component exclusion list against `NON_PROVIDER_REFUND_COMPONENTS`, and checks six fixture sets against `computeProviderRevenueBreakdown` |

### Second QA pass

| Area | Issue | Fix |
|------|-------|-----|
| `usePagedProviderBookings` | Progressive mode published page 1 on *silent* refreshes too, so every realtime event shrank an already-loaded schedule from N rows to 1000 before regrowing — and a mid-walk failure left a truncated list looking complete | Silent refreshes over existing data accumulate in the background and swap once the walk finishes; initial loads still render page 1 immediately. Regression test added |
| Money-screen freshness | `revalidateOnFocus` listened to `beautonomi:app:focus` (app foreground), not screen focus, so re-entering transactions after a payout served the cached rows — the exact scenario the plan lists as a verification step | Added `useFocusRevalidate` (screen `useFocusEffect` → silent refresh, skipping the mount focus) on finance, transactions, payouts and sales history. Kept out of `useApi` because `useApi` also runs in app-level providers above the navigator, where focus hooks have no route context |
| Payment-screen caching | The freshness contract excluded payment paths from *prefetch* only; `useApi` still cached those GETs for the full stale window, so a settled charge could render as unpaid | `useApi` (both apps) now bypasses cache reads and writes for payment paths. In-flight dedupe still applies |
| Cache blocklists | Reusing the prefetch blocklist to disable caching would also have killed caching on `/api/provider/sales*` and `group-bookings`, regressing the money screens just made cached-first | Split into a narrow `isNeverCachePath` (payments/paystack/checkout/terminal) separate from the broader `isPrefetchBlockedPath`. Locked in by test |
| Tab prefetch | `/api/provider/bookings?limit=50&offset=0` could never hit: `usePagedProviderBookings` calls `api.get` directly (bypassing the `useApi` cache) and the screen's URLs are date-filtered with a 1000-row page size. It was a wasted cold-start request competing with the dashboard fetch | Removed. Dashboard and conversations prefetches were verified to match their screens' paths exactly |
| `/api/public/home` hottest | The most expensive section still scanned up to 5000 booking rows per cache miss and counted them in Node | Added a `public_home_hottest` materialized view (trailing 30 days, ranked per tenant) refreshed with the others; used only when no category filter is active, with live visibility re-checked on read and all existing fallbacks intact |
| Customer lists | `announcements` was the only remaining customer `FlatList` without the perf preset | Applied `verticalFlatListPerf` |
| Customer skeletons | Of the four screens the plan names, booking detail still showed a full-screen spinner on initial load | Replaced with a `Skeleton` layout. Bookings tab, partner profile and messages already had skeletons |

## Verified green

| Gate | Result |
|------|--------|
| `pnpm --filter provider test` | 75 suites, 372 tests passed |
| `pnpm --filter customer test` | 33 suites, 227 tests passed |
| `pnpm --filter web test` | 471 files, 2472 tests passed |
| `pnpm --filter provider typecheck` | clean |
| `pnpm --filter customer typecheck` | clean |
| `pnpm --filter web typecheck` | clean |

## Deliberate deviations from the plan

| Plan item | What was done instead | Why |
|-----------|----------------------|-----|
| `provider_finance_summary(..., p_location_id uuid default null)` | Function takes three arguments; the route calls it only for the org-wide case and falls back to the existing JS path when `location_id` is set | Location scoping in this route is not a column filter — it resolves through booking and product-order locations and drops provider-wide rows (gift cards, memberships). Replicating that in SQL risks silently different money numbers, which the plan makes a hard constraint. The org-wide case is the common one |
| MVs for "upcoming" and "browse by city" | Not precomputed | `upcoming` is already an indexed `order by created_at desc limit 12`, so a view adds refresh cost and drift surface for no measurable gain. `browseByCity` is dead: the route unconditionally overwrites it with `[]` (feature removed from the UI) |

Not verifiable locally (requires a deployed environment): actual p50/p95 numbers, MV refresh timing, `EXPLAIN` index usage, and two-device realtime checks.

## Test gates (local)

```bash
pnpm --filter provider test
pnpm --filter customer test
pnpm --filter web test
pnpm --filter provider typecheck
pnpm --filter customer typecheck
pnpm --filter web typecheck
```

Key new/updated tests:

- `apps/provider/__tests__/hooks/usePagedProviderBookings.test.tsx` — progressive pagination + refresh-during-walk
- `apps/web/src/lib/reports/__tests__/provider-finance-summary-rpc.test.ts` — RPC parity gate
