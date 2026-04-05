# Multi-tenant / multi-region platform audit — gap matrix

**Audit date:** 2026-03-22  
**Last completion pass:** 2026-03-22 (+ Amplitude identify `active_tenant_id` / `preferred_home_tenant_id`, recurring-booking cron explicit `tenant_id`, admin scope script `feature_flags`/`product_orders`, root `pnpm audit:multi-tenant`)  
**Spec:** [INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md](./INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md)

**Severity:** P0 = cross-tenant or money-integrity risk; P1 = wrong market for commerce/config; P2 = UX/SEO/international polish; P3 = docs/ops debt.

---

## 1. Methodology (what was run)

| Step | Result |
|------|--------|
| `node docs/scripts/check-admin-tenant-scope.mjs` | **Pass** — all sensitive `apps/web/src/app/api/admin/**/route.ts` files that touch listed tables include `resolveAdminApiTenantId` or `@admin-global`. |
| `pnpm audit:tenant-api-hints` / **`pnpm audit:tenant-api-hints:strict`** (`check-non-admin-api-tenant-hints.mjs`) | **Pass (0 flagged)** — strict mode fails CI on new violations. Recognizes v2 hints (`requirePublicTenant`, `validatePortalToken`, `verifyCronRequest`, `getProviderIdForUser`, `verifyPaystackWebhook`, `provider_id` / `user_id` / `purchaser_user_id` / customer checks, `@tenant-hint`). Re-run when adding service-role routes. |
| Appendix C | **Regenerated** from repo: `docs/_admin_api_routes_snapshot.txt` + `node docs/scripts/insert-appendix-c-admin-routes.mjs` — see spec **§C.1** for current **Total** route count. |
| Mobile tenant Host | **`webApiTenantHeaders()`** merged into `getDefaultHeaders` in [`apps/customer/src/lib/api-client.ts`](../apps/customer/src/lib/api-client.ts) and [`apps/provider/src/lib/api-client.ts`](../apps/provider/src/lib/api-client.ts); **`withWebApiTenantHeaders()`** applied to raw `fetch` calls to the Next.js app (config bundle, third-party config, Mapbox geocode, maintenance, force-update, calendar ICS, upload, ringtone URL, etc.). Set **`EXPO_PUBLIC_WEB_API_TENANT_HOST`** per market build. |
| Mobile ripgrep | `ZAR`, `za`, `+27`, `South Africa` across customer/provider — see matrix **P2** rows. |
| Supabase | Wave migrations **331–349** for `tenant_id`; **§6.6** NOT NULL end-state still pending for many tables. |

---

## 2. Phase 2 — Critical journeys (manual checklist)

For each step, confirm **booking tenant** vs **active tenant** vs **preferred home** per **§0 / §7.3.1**.

| Journey | Web | Customer | Provider | Notes |
|---------|-----|----------|----------|--------|
| Signup / login | Yes | Yes | Yes | Auth global; admin uses `user_tenant_roles`. |
| Search / discovery | Yes | Yes | Yes | Web: Host; mobile: API client sends `x-forwarded-host` when env set + `X-Active-Market-Country` hint. |
| Book / pay | Yes | Yes | Partial | Booking `tenant_id` must win at checkout (server validation). |
| Wallet / top-up / gift | Yes | Yes | — | `wallet_topups.tenant_id`; referral credits tagged with **booking** `tenant_id` on `wallet_transactions`. |
| Admin / ops | Yes | — | — | Admin script pass; nav refunds include orphan pending rows. |
| Notifications / deep links | Cross-cutting | Yes | Yes | Validate `redirect_to` allowlist **§7.5** per environment. |

---

## 3. Gap matrix

| Area | Spec reference | Current state | Gap / risk | Severity | Owner surface | Suggested fix |
|------|----------------|--------------|------------|----------|---------------|---------------|
| Admin API tenant guard | §11.3.1, §8.6 | `pnpm audit:tenant-admin` passes; `SENSITIVE` includes `feature_flags`, `product_orders` (feature-flag routes tagged `@admin-global`) | Extend `SENSITIVE` regex as new tables ship | P3 | web | Edit `docs/scripts/check-admin-tenant-scope.mjs` |
| Appendix C inventory | Appendix C, §11.3.2 | Regenerated in spec from snapshot | Re-run PowerShell + `insert-appendix-c-admin-routes.mjs` when admin routes change | P3 | ops / web | Same as spec **Appendix C** header |
| Mobile → web API Host trust | §7.1, §12.0 | **Done:** `webApiTenantHeaders` on `api` client + `withWebApiTenantHeaders` on raw fetches | Ensure **every** new `fetch(APP_URL/...)` uses helper or `api.*`; EAS **`EXPO_PUBLIC_WEB_API_TENANT_HOST`** set per branded build | P2 | customer, provider | Code review + env checklist |
| Mobile market hint | §7.3.1 | `X-Active-Market-Country` on API client | Must remain non-authoritative for privileged writes | P2 | customer, provider | Server-side validation only |
| Currency / copy defaults | §7.3.1, §5.2 | Many literal `ZAR` / South Africa in UI | International polish | P2 | customer, provider | Bind to API `currency` / tenant |
| Phone defaults | Cross-border UX | `+27` defaults | Tenant-driven default dial optional | P2 | customer, provider | Config from tenant or prefs |
| §6.6 NOT NULL `tenant_id` | §6.6 | Nullable transition columns | End-state not met | P1 | db | Backfill + NOT NULL per table |
| `wallet_transactions` referral scope | §5.2, §10 | **Done:** `wallet_transactions.tenant_id` + `wallet_credit_admin(..., p_tenant_id)`; referral track uses **booking** `tenant_id`; admin finance summary filters referrals by `tenant_id`; backfill from `user_referrals`→`bookings` | Legacy rows may have `tenant_id` null until backfill / re-credit | P3 | db, ops | Re-run backfill or accept NULL in summaries |
| Admin nav refunds badge | §11.3.1 | **Done:** pending count = booking-inner **+** tenant-scoped orphan pending ([`nav-counts/route.ts`](../apps/web/src/app/api/admin/nav-counts/route.ts)) | None for badge parity with list | — | web | — |
| Non-admin `/api` tenant audit | §7.4, §8 | **Done:** script v2 + fixes: [`portal-token`](../apps/web/src/app/api/public/bookings/[id]/portal-token/route.ts) / [`portal/request-link`](../apps/web/src/app/api/portal/request-link/route.ts) scoped with **`requirePublicTenant`**; [`waitlist/.../quick-book`](../apps/web/src/app/api/provider/waitlist/[id]/quick-book/route.ts) sets **`bookings.tenant_id`** from provider | `@tenant-hint` on [`me/on-demand/requests/[id]`](../apps/web/src/app/api/me/on-demand/requests/[id]/route.ts) documents RLS-first + service-role follow-up | P3 | web | Prefer real tenant filters over comments when adding admin writes |
| RLS + service role | §6.6.5, §8 | RLS on many tables; admin uses service role | Every write path must filter `tenant_id` | P1 | db, web | Pair RLS with route audits |
| `feature_flags` tenancy | §6.8 W4, §20.1 | **Done:** migration **348** (`tenant_id` + partial uniques); global + tenant merge in config bundle, provider flags, `/api/feature-flags/check`, admin preview (`tenant_id` body), server helpers (`getSupabaseAdmin`), payment/gift gates pass market tenant | Admin UI still lists all rows (global + overrides); create override via POST `tenant_id` | P3 | web | Optional: filter/group admin list by tenant |
| Analytics tenant props | §14.7 | **Done (web identify):** `POST /api/me/analytics/identify` merges Host-resolved `active_tenant_id` / `active_tenant_slug` and DB `preferred_home_tenant_id` into Amplitude user props ([`identify/route.ts`](../apps/web/src/app/api/me/analytics/identify/route.ts), [`identify.ts`](../apps/web/src/lib/analytics/amplitude/identify.ts)) | Populate `booking_tenant_id` on commerce/booking events in clients where needed | P2 | web, customer, provider | Event audit + tests |
| Vercel / preview hosts | §9.7.1 | **Done (superadmin UI):** [`/admin/settings/tenant-domains`](../apps/web/src/app/admin/settings/tenant-domains/page.tsx) + [`/api/admin/tenant-domains`](../apps/web/src/app/api/admin/tenant-domains/route.ts) manage `tenant_domains`; optional **New tenant** creates `tenants` + empty settings/secrets ([`/api/admin/tenants`](../apps/web/src/app/api/admin/tenants/route.ts)). | Preview URLs still need an explicit hostname row if you want Host resolution (not `za` fallback). | P2 | ops, web | Map preview host in UI or use staged custom domain |

---

## 4. P0 backlog

**None** from automation + targeted review. Re-triage after major API or RLS changes.

---

## 5. Automation commands (Phase 4)

| Command | Purpose |
|---------|---------|
| `pnpm audit:tenant-admin` | Admin routes vs sensitive tables |
| `pnpm audit:tenant-api-hints` | Non-admin routes heuristic (non-blocking) |
| `pnpm audit:multi-tenant` | Runs `audit:tenant-admin` then `audit:tenant-api-hints` |
| `npx tsc --noEmit` (per app) | Type safety after tenant/header changes |

---

## 6. Spec checklist mapping

| Spec slice | Used for |
|------------|----------|
| NN + §7.1 | Trust model, Host / forwarded-host |
| §6.6–6.8 | `tenant_id` end state, waves |
| §7.3.1–7.3.2 | Active vs booking vs home tenant |
| §10–12 | Payments, mobile |
| §11.3 / Appendix C | Admin inventory |
| §14.7 | Analytics |
| §20.1 | Feature flags |
| §21 / §21.1 | Residual risk acceptance |

---

## 7. Completion criteria (audit plan)

| Criterion | Status |
|-----------|--------|
| Matrix covers web + customer + provider + db + ops | **Yes** |
| Phase 2 journey checklist documented | **Yes** (§2) |
| P0/P1 rows link to path or concrete command | **Yes** |
| Optional CI / scripts | **Yes** — root `package.json` + `docs/scripts/check-non-admin-api-tenant-hints.mjs` |
| Appendix C in sync with repo | **Yes** (regenerate when routes change) |

Further **product** fixes (ZAR copy, referral `tenant_id`) remain **implementation** work tracked in §3 above.
