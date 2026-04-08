# Redline summary: migration blueprint V2.0 → V2.1

**Purpose:** Record what was strengthened after critical review so reviewers can diff intent without reading full files.

---

## Critical review findings (what was weak)

| Category | Issue |
|----------|--------|
| **Assumptions** | Multi-market hosts, cookie scope per origin, CI/workspace integration, and “single source of truth” for `canAccessSection` were implicit. |
| **Recommendations** | Runtime feature flag named but no **concrete mechanism**; rollback assumed “legacy still exists” without a **branching rollback matrix**. |
| **Rollout** | No **T-minus** checklist; no **cache / CDN** behavior; weak link between **flag off** and **artifact** (redeploy vs edge toggle). |
| **Hidden risks** | Shell parity (e.g. notifications), CSP for new assets, crawler/noindex, key-person throughput, **90-day vs 96-page** realism. |
| **Sequencing** | Wave 0 overloaded (shell + dashboard + search + nav counts); matrix “W0+W1 complete in 30d” collided with shell build. |
| **Decisions** | Duplicate RBAC logic between Next and SPA risked drift; subdomain exception lacked a **decision tree**. |

---

## Redline: substantive changes (V2.1)

1. **New §2a Assumptions & constraints** — Multi-tenant origins, admin on same hosts as `apps/web`, SPA build in `pnpm` CI, legal/PII unchanged, `robots`/noindex for `/admin`.
2. **New §2b Critical path & throughput guardrail** — Explicit **minimum parallel roles**; **trigger** to slip 90→120-day program if matrix/shell slips >1 week; **W0 split** into **Track A (platform)** vs **Track B (matrix)** with merge gate.
3. **Architecture §3** — Require **`@beautonomi/admin-access`** (or equivalent) as **only** copy of section matrix logic (import from shared package; Next re-exports or migrates off duplicate).
4. **§4 Key decisions** — **Force-pick** primary feature-flag implementation tier (runtime edge config vs redeploy); **subdomain decision tree** (same-origin default; subdomain only if…).
5. **§8 Waves** — Wave 0 decomposed; **spill** clarified; Wave 1–5 note **parallel page work** only after shell **merge gate**.
6. **§12 Cutover** — Pointer to **expanded** `ADMIN_SPA_CUTOVER_PLAN.md`: T-24h/T-1h/T0/T+1h, rollback matrix, cache bust, “legacy deleted” rollback = **redeploy previous release**.
7. **§13 Observability** — CSP/SRI note; bootstrap **ratio** alert; **version** in Sentry release for SPA.
8. **§14 Team** — Minimum staffing band; **if below**, scope reduction path (waves merge or date slip).
9. **§15 Risks** — New rows: RBAC drift, CSP, cache stickiness, throughput, shell feature parity.
10. **§17 30/60/90** — **Re-sequenced**: matrix shell rows + bootstrap API week 1–2; W0 sign-off before W1 “in progress”; optional **120-day** line for full parity.
11. **Document control** — Version **V2.1**, changelog entry.

## Companion doc redlines

| File | Changes |
|------|---------|
| `ADMIN_SPA_AUTH_DECISION.md` | **§8 Implementation Delta** (execution notes); **§9 Approval block** — implementation binding: named flag strategies; **multi-origin** login (per market host); **CSP** action; **noindex** on `/admin`. |
| `ADMIN_SPA_CUTOVER_PLAN.md` | **§2 Flag mechanism** (tier A/B); **§3 Rollback matrix**; **§4 Timeline** T-24h/T0/T+1h; **§5 Cache**; **§6** when legacy removed. |
| `ADMIN_SPA_RISK_REGISTER.md` | New risks R13–R17; closed criteria. |
| `README.md` | Link redline + V2.1 note. |

---

## What was intentionally not changed

- Backend-of-record remains `/api/admin/*`.  
- Same-origin **default** for session (still recommended).  
- Parity matrix remains a **hard gate** before page implementation.
