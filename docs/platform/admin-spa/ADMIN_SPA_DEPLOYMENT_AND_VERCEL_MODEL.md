# ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL

**Purpose:** Bind **current** deploy topology to the admin SPA migration so local dev, preview, and production cutover stay consistent with [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) and [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md).

**Owner:** Platform / DevOps (maintains); FE (implements app wiring).

---

## Implementation Delta

| Date | Change | Why |
|------|--------|-----|
| 2026-04-06 | **Document created** (file was missing from repo). | Execution plan required a single place for Vercel + routing model; content derived from [`apps/web/vercel.json`](../../apps/web/vercel.json), monorepo layout, and cutover doc. |
| 2026-04-06 | **Strict review:** Vite dev proxy documents **`/auth`** in addition to **`/api`** (OAuth callback parity). | Matches [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md) §2 local-dev wording. |
| 2026-04-07 | **Env parity:** `apps/admin-web/vite.config.ts` merges `apps/web` + `apps/admin-web` `.env*` and maps **`NEXT_PUBLIC_*` → injected `VITE_*`** so Vercel/web CI matches Next public config without duplicating keys. See `src/config/publicEnv.ts`, `docs/ENVIRONMENT_MATRIX.md` § Admin SPA. | |
| 2026-04-07 | **Cutover wiring (Option A):** `next build` runs [`sync-admin-spa.mjs`](../../apps/web/scripts/sync-admin-spa.mjs) → `apps/web/public/admin/**`. [`proxy.ts`](../../apps/web/src/proxy.ts) **`ADMIN_SPA_ROUTING=spa`** rewrites HTML navigations to `/admin/index.html` and bypasses auth for `/admin/assets/*`. | Tier **B** kill switch; same host as cutover plan §2. See [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md). |
| 2026-04-07 | **Legacy Next admin** (`app/admin/**`) retained for **`legacy`** rollback until milestone §8. Decommission inventory: [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md). | |

---

## 1. Current state (today)

| Item | Reality |
|------|---------|
| **Vercel project** | Primary production/staging deploy is **`apps/web`** (Next.js). [`apps/web/vercel.json`](../../apps/web/vercel.json) defines build env hints and crons — **no extra** `/admin` rewrites required when using embedded `public/admin` + `proxy.ts`. |
| **Admin UI (default)** | **`ADMIN_SPA_ROUTING` unset or `legacy`:** Next App Router `apps/web/src/app/admin/**`. |
| **Admin UI (cutover)** | **`ADMIN_SPA_ROUTING=spa`:** Vite SPA from `public/admin` via `proxy.ts` rewrite; legacy `app/admin/**` not hit for document navigations. |
| **Admin APIs** | Next route handlers: `apps/web/src/app/api/admin/**` → `/api/admin/*` (unchanged). |
| **Auth at edge** | **`legacy` mode:** [`proxy.ts`](../../apps/web/src/proxy.ts) enforces session + `ALL_ADMIN_ROLES` for `/admin/*` except `/admin/login`. **`spa` mode:** HTML shell is unauthenticated at edge; SPA + `/api/admin/bootstrap` enforce auth (see auth decision). |
| **`apps/admin-web`** | Built in CI **before** `web` build; artifact copied into **`apps/web/public/admin`**. Still devable standalone on `:5173` with Vite proxy. |

---

## 2. Local development model (Wave 0)

| Process | Port | Notes |
|---------|------|--------|
| **Next (`web`)** | `3000` | Source of truth for `/api/*`, `/api/auth/sign-in`, CSRF cookies, Supabase session cookies. |
| **Admin SPA (`admin-web`)** | `5173` (default Vite) | `vite.config` proxies **`/api`** and **`/auth`** → `http://localhost:3000`. Browser uses **one origin** (`localhost:5173`) for HTML/JS and proxied API/auth paths — matches auth decision intent (avoid naked cross-origin API calls). |
| **Env** | | SPA: `VITE_*` mirrors `NEXT_PUBLIC_*` for Supabase browser client. |

---

## 3. Target production model (post–cutover)

Aligned with **same-origin** default in the migration plan:

1. **Static SPA assets** under `/admin/` (Vite `base: '/admin/'`, hashed filenames).
2. **Fallback** for `/admin/*` non-file paths → SPA `index.html`.
3. **`/api/admin/*`** and **`/api/auth/*`** remain on **Next** on the **same host**.

**Tier A/B (cutover):** Runtime or redeploy flag decides whether `/admin/*` serves SPA shell vs legacy Next pages — see [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) §1a.

**Monorepo build (implemented — Option A):**

- **`apps/web` `next build`** invokes `scripts/sync-admin-spa.mjs` (skip with `SKIP_ADMIN_SPA_SYNC=1`). CI runs **`turbo run build --filter=admin-web`** before **`--filter=web`** so `dist` exists.
- **`apps/web`** lists **`admin-web`** as a **workspace `devDependency`** so Turbo orders package builds when using `turbo run build --filter=web` with `dependsOn: ["^build"]`.

**Option B** (separate CDN origin) remains available if Platform moves static hosting later.

**Default production** remains **`legacy`** until **`ADMIN_SPA_ROUTING=spa`** is set on the Vercel **web** project (Preview / Production per environment).

---

## 4. CI expectations

| Gate | Intent |
|------|--------|
| `turbo run typecheck --filter=admin-web` | SPA + packages typecheck. |
| `turbo run build --filter=admin-web` | Vite production build (placeholder or real `VITE_*`). |
| **`build-web` job** | Builds **admin-web** then **web** so `public/admin` is populated. |
| **Vercel** | Set **`ADMIN_SPA_ROUTING`** per environment. **`admin-web` build** merges `apps/web` `.env*` and maps **`NEXT_PUBLIC_*` → `VITE_*`** in `vite.config.ts`, so the same Vercel env as Next is enough; optional `VITE_*` overrides in `apps/admin-web` if needed. |

---

## 5. Checklist before first staging SPA-default

- [x] Flag tier **B** documented: env var **`ADMIN_SPA_ROUTING`** = `spa` \| `legacy` (default `legacy`), owner Platform — see [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md).
- [x] Rollback matrix row: **legacy still in artifact** — flip env to `legacy` and redeploy (Tier B).
- [x] `/admin` HTML cache policy — `next.config.mjs` headers: assets immutable; other `/admin/:path*` short TTL + `X-Robots-Tag`.
- [ ] `curl -I` verification on target host after enabling `spa` (staging).

---

## 6. References

- [`ADMIN_SPA_MIGRATION_PLAN_V2.md`](./ADMIN_SPA_MIGRATION_PLAN_V2.md) — architecture §3.7, same-origin default.
- [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) — routing table, rollback, flags.
- [`apps/admin-web/README.md`](../../apps/admin-web/README.md) — dev/proxy/env.
