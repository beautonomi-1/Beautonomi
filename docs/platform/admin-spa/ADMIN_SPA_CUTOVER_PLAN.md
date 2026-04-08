# ADMIN_SPA_CUTOVER_PLAN

**Purpose:** Operational runbook for **moving production traffic** from Next embedded admin to SPA with **measurable success** and **fast rollback**.

**Owner:** DevOps / EM (executes); Platform (approves infra); Support lead (comms).

**Aligned with:** `ADMIN_SPA_MIGRATION_PLAN_V2.md` §4 decision **6** (flag tiers).

---

## 1. Cutover model (recommended)

**Type:** **Single-flag cohort → full cutover** (not path-by-path dual implementations in production).

| Stage | Environment | Behavior |
|-------|-------------|----------|
| **A** | Local | Vite proxy to Next API; dev auth per `ADMIN_SPA_AUTH_DECISION.md` |
| **B** | Staging | SPA **default**; legacy Next admin pages **removed or unreachable** |
| **C** | Production pre-flight | Flag **off**; smoke synthetic `/admin` |
| **D** | Production cutover | Flag **on**; `/admin/*` serves SPA |
| **E** | Hypercare | 48–72h elevated monitoring |
| **F** | Cleanup | Remove legacy page components **after** sign-off (milestone +2 weeks suggested) |

---

## 1a. Feature-flag mechanism (binding)

Pick **one** primary mechanism before staging cutover; document the **exact** name and where it is read (edge middleware, load balancer, k8s ConfigMap, etc.).

| Tier | Mechanism | Rollback action | Allowed as **sole** prod kill switch? |
|------|-----------|-----------------|--------------------------------------|
| **A** | Runtime flag (Edge Config, Redis, LaunchDarkly, etc.) | Toggle off; traffic serves fallback within minutes | **Yes** |
| **B** | Redeploy previous container/image with `ADMIN_SPA_ROUTING=legacy` | Roll deployment to N-1 | **Yes** (RTO = deploy pipeline time) |
| **C** | `NEXT_PUBLIC_*` build-time only | Rebuild + redeploy | **No** — use only **with** A or B |

**Production cutover requirement:** **Tier A or B** must be operational; Tier C alone is **not** approved.

---

## 1b. Rollback matrix (mandatory)

| State of legacy `app/admin/**` | Rollback procedure | RTO expectation |
|-------------------------------|-------------------|-----------------|
| **Legacy routes still in deploy artifact** (thin host or full pages) | Toggle Tier **A** off **or** set Tier **B** env → legacy serves `/admin/*` | ≤15 min (A) or pipeline SLA (B) |
| **Legacy React pages removed from main** | Redeploy **last-known-good** release artifact that still contains legacy UI **or** emergency branch deploy | Pipeline SLA + **pre-identified** image tag |
| **CDN caches stale SPA** | Purge CDN path `/admin/*` **or** rely on hashed asset filenames + short HTML TTL | Per CDN docs |

**Drill:** Execute rollback row **1** and **2** on **staging** at least once before production cutover.

---

## 1c. Operational timeline (wall-clock)

| Time | Actions |
|------|---------|
| **T-24h** | Confirm flag tier healthy; synthetic green; support macro drafted; on-call named |
| **T-1h** | Freeze unrelated production deploys (optional); verify error dashboards baseline |
| **T0** | Flip flag (or enable routing); watch Sentry + API 5xx + bootstrap 401/403 ratio |
| **T+15m** | Go/no-go: if error budget exceeded, **execute rollback matrix** |
| **T+24h** | Review metrics; close war room or extend hypercare |

---

## 2. Routing / asset behavior

| Path | After cutover |
|------|----------------|
| `/admin` | SPA `index.html` |
| `/admin/*` (non-file) | SPA fallback |
| `/admin/assets/*` or `/assets/*` (Vite) | Long-cache static |
| `/api/admin/*` | Next.js (unchanged) |
| `/admin/login` | SPA login route |

**Legacy Next `app/admin/**`:** Either deleted **before** cutover (staging validated) or replaced by **single** catch-all that serves SPA bootstrap — **record choice** in PR and in **rollback matrix** row.

---

## 2a. Caching and deploy hygiene

- **Static assets:** Vite/Webpack hashed filenames — long `Cache-Control` OK.  
- **HTML entry** (`/admin`, `/admin/index.html`): **short TTL** (e.g. ≤5 min) or **no-cache** until post-cutover stable.  
- **Post-deploy:** If HTML cached wrongly, run **CDN purge** per provider runbook.

---

## 3. Rollback procedure (RTO target: **≤ 15 minutes** for Tier A)

1. Execute **rollback matrix** row matching current deploy state.  
2. **Verify** synthetic: agreed path (e.g. `/admin/dashboard`) returns **200** and **critical API** smoke passes.  
3. **Communicate** in #incidents or ops channel.  
4. **Post-mortem** if user-visible degradation > **15 minutes**.

**Prerequisite:** **N-1** production artifact tag **recorded** before every cutover attempt; registry retention ≥ **F milestone + 30 days**.

---

## 4. Rollout order

1. Internal **superadmin** dogfood on staging (week)  
2. Staging **full RBAC** QA  
3. Production **flag on** during **low-traffic window** (timezone in runbook)  
4. **Support** notified **before** flip

---

## 5. Success criteria (production, first 24h)

| Metric | Threshold |
|--------|-----------|
| `/api/admin/*` **5xx** rate | ≤ baseline + **0.2%** |
| SPA bootstrap failures (Sentry) | **0** critical; < **N** degraded (set N) |
| Auth **401 spike** | No sustained 2× baseline |
| Support tickets tagged `admin-regression` | **≤ agreed cap** |

---

## 6. Monitoring during cutover

- On-call: **FE + Platform**  
- Dashboards: API errors, Sentry new issues tagged `admin-spa`, synthetic `/admin`  
- **Slack** war room optional for first hour

---

## 7. Stakeholder sign-off (checklist)

- [ ] EM  
- [ ] Platform / Security (auth unchanged or re-approved)  
- [ ] QA lead (pre-cutover regression green)  
- [ ] Product Ops / Support lead  

**Cutover date / time (UTC):** _______________________

---

## 8. Post-cutover cleanup

| Item | Timing |
|------|--------|
| Delete `apps/web/src/app/admin/**` implementation files | **≥ 2 weeks** stable + sign-off |
| Remove dead `AdminShell` if fully unused | Same milestone |
| Archive legacy screenshots in Confluence/Notion | Optional |

---

## 9. Changelog

| Date | Change |
|------|--------|
| | Initial |
| 2026-04-06 | V2.1: flag tiers A/B/C, rollback matrix, T-24h/T0 timeline, cache/HTML TTL, staging rollback drills |
