# Admin SPA migration — documentation index

Execution-ready blueprint and mandatory artifacts for migrating the Beautonomi **admin / superadmin** UI from embedded Next.js (`apps/web/src/app/admin`) to a **dedicated SPA** while keeping **`/api/admin/*`** stable.

**Current blueprint version:** **V2.1** (see [redline from V2.0](./ADMIN_SPA_REDLINE_V2_TO_V2.1.md)).

| Document | Description |
|----------|-------------|
| [ADMIN_SPA_MIGRATION_PLAN_V2.md](./ADMIN_SPA_MIGRATION_PLAN_V2.md) | **Master blueprint (V2.1)** — assumptions, RBAC package, flag tiers, W0 split, 120-day contingency |
| [ADMIN_SPA_REDLINE_V2_TO_V2.1.md](./ADMIN_SPA_REDLINE_V2_TO_V2.1.md) | **What changed** in critical review |
| [ADMIN_API_PARITY_MATRIX.md](./ADMIN_API_PARITY_MATRIX.md) | **Blocker** for coding: page ↔ API ↔ AuthZ ↔ contract |
| [ADMIN_SPA_AUTH_DECISION.md](./ADMIN_SPA_AUTH_DECISION.md) | Approved session, bootstrap, proxy behavior |
| [ADMIN_SPA_TEST_STRATEGY.md](./ADMIN_SPA_TEST_STRATEGY.md) | Quality gates, CI, pre-cutover regression |
| [ADMIN_SPA_UI_CONVENTIONS.md](./ADMIN_SPA_UI_CONVENTIONS.md) | Layout, tables, states, responsive classes |
| [ADMIN_SPA_CUTOVER_PLAN.md](./ADMIN_SPA_CUTOVER_PLAN.md) | Rollout, rollback, success metrics |
| [ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md](./ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md) | Current Vercel/web deploy vs SPA dev and post–cutover static `/admin` |
| [ADMIN_SPA_WAVE_TRACKER.md](./ADMIN_SPA_WAVE_TRACKER.md) | Per-page status and sign-offs |
| [ADMIN_WAVE1_EXECUTION_CHECKLIST.md](./ADMIN_WAVE1_EXECUTION_CHECKLIST.md) | **Next cycle:** W0 verification gate, W1 routes 7–18, blockers, parallelization |
| [ADMIN_SPA_RISK_REGISTER.md](./ADMIN_SPA_RISK_REGISTER.md) | Likelihood/impact/mitigation |
| [ADMIN_SPA_COMPLETION_STATUS.md](./ADMIN_SPA_COMPLETION_STATUS.md) | **Truth table:** what is implemented vs what still needs sign-off / ops |
| [ADMIN_CUTOVER_EXECUTION_REPORT.md](./ADMIN_CUTOVER_EXECUTION_REPORT.md) | Implemented cutover wiring (sync, `proxy.ts`, Tier B env) |
| [ADMIN_CUTOVER_READINESS_REPORT.md](./ADMIN_CUTOVER_READINESS_REPORT.md) | Pre-flight gaps; see changelog for post-implementation amendment |
| [ADMIN_POST_MIGRATION_REVIEW.md](./ADMIN_POST_MIGRATION_REVIEW.md) | Post-route sweep — regression themes |
| [ADMIN_PRODUCTION_STABILIZATION_REPORT.md](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md) | Stabilization fixes (session, shell, exports, Sentry) |
| [ADMIN_LEGACY_DECOMMISSION_REPORT.md](./ADMIN_LEGACY_DECOMMISSION_REPORT.md) | Legacy Next admin retention vs delete plan |
| [ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md](./ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md) | Lazy routes, chunking, cache, deferred search — post-migration |
| [ADMIN_PLATFORM_GOVERNANCE.md](./ADMIN_PLATFORM_GOVERNANCE.md) | **Steady-state platform:** ownership, review, tests, API process, release, incidents, docs |
| [ADMIN_MIGRATION_PROGRAM_CLOSURE.md](./ADMIN_MIGRATION_PROGRAM_CLOSURE.md) | **Executive closure:** what shipped, decisions, benefits, debt, final status |

**Related existing docs:** `docs/ADMIN_PORTAL_ROLE_MODEL.md`, `docs/ADMIN_PORTAL_DATA_CONTRACTS.md`, `docs/admin-api-route-taxonomy.csv`, `docs/scripts/generate-admin-route-taxonomy.mjs`.
