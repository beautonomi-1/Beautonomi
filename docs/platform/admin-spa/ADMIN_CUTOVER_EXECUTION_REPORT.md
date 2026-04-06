# Admin SPA — cutover execution report

**Date:** 2026-04-07  
**Inputs:** [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md), [`ADMIN_CUTOVER_READINESS_REPORT.md`](./ADMIN_CUTOVER_READINESS_REPORT.md), [`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`](./ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md).

---

## 1. What was switched (implemented in repo)

| Item | Detail |
|------|--------|
| **Static artifact (Option A)** | [`apps/web/scripts/sync-admin-spa.mjs`](../../apps/web/scripts/sync-admin-spa.mjs) copies `apps/admin-web/dist` → `apps/web/public/admin/` during [`apps/web/scripts/next-build.mjs`](../../apps/web/scripts/next-build.mjs) (before `next build`). Opt out: `SKIP_ADMIN_SPA_SYNC=1`. |
| **Cutover mechanism (Tier B)** | Env var **`ADMIN_SPA_ROUTING`**: `spa` \| `legacy` (default **legacy** if unset). Implemented in [`apps/web/src/proxy.ts`](../../apps/web/src/proxy.ts) (Next.js 16 **proxy** — `middleware.ts` is **not** used; a draft `middleware.ts` was removed to satisfy the framework constraint). |
| **Routing behavior in `spa` mode** | Any `/admin` or `/admin/*` that is **not** a bundled asset → **`NextResponse.rewrite`** to `/admin/index.html`. **`/admin/assets/*`** and paths ending in common static extensions → **`NextResponse.next()`** (no edge admin-role gate — fixes R21-style chunk load loops). |
| **Cache / robots headers** | [`apps/web/next.config.mjs`](../../apps/web/next.config.mjs): `/admin/assets/:path*` immutable; other `/admin/:path*` `no-store` + `X-Robots-Tag: noindex, nofollow` (assets rule listed **first** so hashed chunks keep long TTL). |
| **CI** | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`build-web`**: build **admin-web** then **web**; `VITE_WEB_ORIGIN` empty for same-origin artifact. Removed standalone **`build-admin-web`** job (redundant). |
| **Turbo / lockfile** | **`admin-web`** added as **`devDependency`** of **`web`** so `turbo run build --filter=web` runs **`^build`** for the SPA first; `pnpm-lock.yaml` updated. |
| **Gitignore** | [`apps/web/.gitignore`](../../apps/web/.gitignore): ignore generated `public/admin/`. |
| **`turbo.json`** | Pass-through env: `ADMIN_SPA_ROUTING`, `SKIP_ADMIN_SPA_SYNC`. |

**Not done in this PR (operational):** Setting **`ADMIN_SPA_ROUTING=spa`** on any live Vercel environment — that remains a **human / Platform** flip after staging validation.

---

## 2. What was verified (automated / local)

| Check | Result |
|-------|--------|
| **Admin SPA build** | `pnpm exec turbo run build --filter=admin-web` succeeds; `dist` contains `index.html` + `assets/*` under `/admin/` base. |
| **Sync script** | Runs during `next build` preamble; logs `synced apps/admin-web/dist → apps/web/public/admin`. |
| **Next.js 16 proxy-only** | Adding `src/middleware.ts` **fails** build (“use proxy only”); routing logic lives solely in **`proxy.ts`**. |
| **Full `web` production build** | **Not reliably verified** in the agent environment: one run hit **Turbopack + Vite type friction** when `VERCEL`/`GITHUB_ACTIONS` steered Turbopack; another **webpack** run aborted with **exit 134** (likely **OOM** on Windows). **CI Linux** with existing heap flags remains the source of truth for green builds. |

---

## 3. Auth / session / RBAC in cutover state (design verification)

| Topic | Expected behavior (`spa` mode) |
|-------|--------------------------------|
| **Edge** | No Supabase session check for HTML navigations; **chunks** load without admin cookie. |
| **SPA** | Cookie session + `GET /api/admin/bootstrap` (same origin); 401 → `/admin/login`; 403 → permission UI; aligns with [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md) for browser-first admin. |
| **CSRF** | Unchanged for **`/api/*`** via existing `proxy.ts` branches. |
| **Legacy Next `RoleGuard`** | Not applied to document requests that are rewritten to the static shell. |

**Manual QA still required:** Sign-in, bootstrap, superadmin scope, and a **finance vs overview** user on reports (parity notes in matrix).

---

## 4. Preview vs production assumptions

| Assumption | Note |
|------------|------|
| **Same host** | SPA `fetch(..., { credentials: 'include' })` targets `/api` on the **same** deployment host — correct for Vercel **web** project. |
| **`VITE_*` at build time** | Admin bundle embeds Supabase client env. **Preview** and **Production** should use the **intended** Supabase project keys for that environment (mirror `NEXT_PUBLIC_*` policy). |
| **`VITE_WEB_ORIGIN`** | **Empty** in CI web job for same-origin deep links to legacy; use non-empty only for split-origin dev. |
| **Per-env cutover** | Set **`ADMIN_SPA_ROUTING=spa`** on **Preview** first, then Production, per Vercel environment settings. |

---

## 5. Observability, alerts, error tracking

| Layer | Status |
|-------|--------|
| **Next / API** | Existing Sentry + server logs unchanged. |
| **Admin SPA** | Optional **`VITE_SENTRY_DSN`** in admin-web build — set in Vercel for **staging/prod** when ready; tag releases per R12. |
| **Synthetic checks** | **Not configured** in repo; cutover plan §6 still recommends `/admin/dashboard` (or login) checks post-flip. |

---

## 6. Rollback path

| Action | Effect |
|--------|--------|
| Set **`ADMIN_SPA_ROUTING=legacy`** (or remove) on the Vercel **web** project for the affected environment. | **Redeploy** (or promote previous deployment) — Tier **B** per cutover plan §1a. |
| **Emergency** | Redeploy last deployment that had `legacy` + green CI. **Legacy `app/admin/**` remains** in the repo and artifact — matches rollback matrix row 1. |

**Rollback status:** **Valid** — no deletion of legacy admin pages in this change set.

---

## 7. Deviations from the cutover plan

| Plan item | Deviation |
|-----------|-----------|
| **Tier A** (Edge Config / LD / Redis) | **Not implemented.** Only **Tier B** env + redeploy documented. |
| **Drills** | Staging rollback drill **not executed** in this engineering pass (documented as follow-up). |
| **Stakeholder sign-off** | EM / QA / Support checklist items **not** collected in this pass. |
| **Synthetic + war room** | Not instantiated. |
| **`middleware.ts`** | Plan text referenced “middleware” generically; **Next 16 uses `proxy.ts`** — behavior implemented there instead. |

---

## 8. Issues encountered

1. **Next 16** rejects coexisting **`middleware.ts`** and **`proxy.ts`** — SPA routing was integrated into **`proxy.ts`** only.  
2. **Parallel Turbo** could run `web` before `admin-web` — mitigated by **workspace `devDependency`** + **sequential steps** in CI `build-web`.  
3. **Local full `web` build** unstable in the agent session (Turbopack/Vite typing + OOM) — treat **CI** as canonical until local parity is confirmed.  
4. **`pnpm-lock.yaml`** required **`pnpm install --no-frozen-lockfile`** after adding **`admin-web`** to **`web`**.

---

## 9. Final cutover recommendation

**Ready to enable in staging only, subject to manual QA.**

- Merge this wiring; keep **Production** on **`legacy`** until: (1) staging has **`ADMIN_SPA_ROUTING=spa`**, (2) smoke auth + RBAC + critical flows pass, (3) optional Sentry DSN on the admin bundle, (4) rollback drill executed once.  
- **Not** a declaration of production cutover complete — that requires the operational steps above + sign-off from the cutover plan §7.

---

## 10. Related

- Legacy **embedded** admin tree (`app/admin/**`) is **not** removed in the same change set — see [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md) for rollback-safe decommissioning.

---

## 11. Changelog

| Date | Change |
|------|--------|
| 2026-04-07 | Initial cutover execution report and implementation. |
| 2026-04-07 | Cross-link to **ADMIN_LEGACY_DECOMMISSION_REPORT** (rollback vs delete). |
