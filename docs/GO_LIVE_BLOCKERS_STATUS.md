# Go-live proposed fixes — implementation status (facts)

Last verified: **2026-10-03** (final QA — live prod green; staging API behind Vercel Auth).

| Proposed fix | Status | Facts |
|--------------|--------|--------|
| **Paystack data fix (production)** | **Partial — DB cleaned; Vercel env still required** | ZA **`region_secrets` test override removed**; invalid **`platform_secrets`** Paystack fields cleared. No valid **`sk_*`** left in DB until you run `pnpm sync:paystack:production` or save keys in Admin (global). **Live payments use `PAYSTACK_SECRET_KEY` on Vercel** once deployed. |
| **Paystack (Preview / staging DB)** | **Open** | Staging DB had no Paystack rows; Preview **Vercel test env** is enough for server secret until `pnpm sync:paystack:staging`. |
| **Paystack tooling & admin sync** | **Done in repo** | [`sync-paystack-za-region.ts`](../apps/web/src/lib/payments/sync-paystack-za-region.ts), [`sync-paystack-region-keys.mjs`](../tooling/audit/sync-paystack-region-keys.mjs), Admin Paystack PATCH syncs ZA region, config bundle **env public fallback**, [PAYSTACK_VERCEL_AND_REGION.md](./PAYSTACK_VERCEL_AND_REGION.md). |
| **Health probe (env + DB)** | **Done in repo (needs deploy)** | [`/api/health`](../apps/web/src/app/api/health/route.ts) uses `PAYSTACK_SECRET_KEY` then **`getPaystackSecretKey` for tenant `za`**. **Not live until next Vercel production deploy.** |
| **Commit / push** | **Done (2026-10-03)** | `develop` + **`main`** at **`0a4efdea`** pushed to `origin` (go-live bundle + test/sync tooling). |
| **Deploy production** | **Done (2026-10-03)** | `main`/`develop` @ **`0a4efdea`** on GitHub. Live **`GET /api/health`** → **200**, `status: ok`, Paystack **ok** (`.com` + `.co.za`). |
| **Staging domain** | **Partial — Deployment Protection** | Option **B** wired in Playwright (`VERCEL_AUTOMATION_BYPASS_SECRET` header). Set GitHub secret + rotate if exposed in chat. DNS/Vercel for **`staging-uk.beautonomi.com`** still required for tenant-isolation E2E. |
| **Staging E2E provider seed** | **Done on remote (2026-10-03)** | Migrations **972/973** + fixed `seed-staging.mjs`; provider slug **`e2e-test-provider-beautonomi`** seeded on staging. |
| **CI migration / deps audit** | **Done in repo** | `check-migrations.mjs` split-prefix fix; `audit:deps` overrides + expiring allowlist for `braces` / `http-cache-semantics`. |
| **Supabase staging schema** | **Done on remote** | Migrations through **973** on staging ref `byfzhyqvtbasxptxdupf`; `uk` tenant + `staging-uk.beautonomi.com` domain row. |

## Your ordered checklist

1. **Vercel Production:** `PAYSTACK_SECRET_KEY=sk_live_…`, public key env (`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` or `PAYSTACK_PUBLIC_KEY`), redeploy.
2. **Optional DB align:** `apps/web/.env.paystack.sync.local` → `pnpm sync:paystack:production`.
3. **Git:** commit & push go-live bundle (migrations, web, docs, tooling); merge to branch Vercel deploys.
4. **Staging:** Vercel Preview env + **turn off SSO wall** (or use bypass) on `staging.beautonomi.com`; `pnpm sync:paystack:staging` with test keys.
5. **Verify:** `curl https://www.beautonomi.com/api/health` → **200**; smoke `/api/public/home`, `/signup`.

## Final QA (2026-10-03, pre-commit)

| Gate | Result |
|------|--------|
| `pnpm readiness:supabase:check` | Pass |
| `pnpm compare:supabase` | `gaps: []` |
| `pnpm run release:check:mobile` | Pass (parity 32/32) |
| `turbo typecheck --filter=web` | Pass |
| Health probe unit tests | 6/6 pass |
| Live `GET /api/public/home` (prod, ZA host) | **200** |
| Live `GET /api/health` (prod, **current deploy**) | **503** paystack — env missing on deployment until **redeploy** after Vercel `PAYSTACK_SECRET_KEY` + this commit’s health probe |
| Staging host | **302 Vercel SSO** — not public E2E yet |

## Commands

```powershell
pnpm readiness:supabase:check
pnpm sync:paystack:production   # after .env.paystack.sync.local
pnpm sync:paystack:staging
pnpm exec vitest run apps/web/src/lib/health/__tests__/deep-checks.test.ts
```
