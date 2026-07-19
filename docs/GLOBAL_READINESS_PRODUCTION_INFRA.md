# Production infrastructure checklist (Global Readiness Phase 0)

Use before enabling `STRICT_TENANT_HOST_RESOLUTION=true` in production and before multi-country launch.

## Vercel

- [ ] **Plan: Pro** (Hobby forbids commercial use; sub-hourly crons require Pro — see `apps/web/vercel.json`, 43 scheduled jobs).
- [ ] **Functions region: `fra1`** (Frankfurt) — co-located with Supabase `eu-central-1`.
- [ ] **Env:** `STRICT_TENANT_HOST_RESOLUTION=true` after migration **789** applied and every customer host is in `tenant_domains`.
- [ ] **Env:** `LOG_TENANT_RESOLUTION_FALLBACK=true` during rollout; alert on `metric: tenant_resolution_fallback`.

## Supabase

- [ ] **Plan: Pro** with **Small compute** (or higher per load).
- [ ] **PITR add-on** enabled (point-in-time recovery).
- [ ] **Region:** `eu-central-1` (Frankfurt) — EU/UK data-at-rest residency for single-project launch.
- [ ] Apply migrations **787–789** (gift card RLS, private message attachments, production host map).

## Restore drill (quarterly)

1. Note current row counts for `bookings`, `finance_transactions`, `gift_cards`, `users`.
2. From Supabase Dashboard → Database → Backups, restore to a **staging branch** or clone project (never overwrite prod).
3. Run: `node tooling/dr/verify-restore-row-counts.mjs` against the restored project URL + service role.
4. Record results in your ops log; file a ticket if counts diverge >0.1% from pre-drill snapshot.

## RLS integration tests

```bash
# Optional in CI when secrets are configured
SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... \
  node scripts/security/run-rls-integration-tests.mjs
```

Local/static checks always run via Vitest: `pnpm --filter web test src/lib/security/__tests__/rls-harness.test.ts`.

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Ops | | |
