# Admin Waves 2–5 progress report

**Date:** 2026-04-05  
**Scope:** `apps/admin-web` routes and docs updates following Wave 1 foundation (`adminQueryKeys`, RBAC hooks, shared UI primitives).

---

## Executive summary

Waves 2–5 are **not fully complete** as 96-route parity: this pass **ships SPA routes** for every **high-confidence list/read** surface where the backend route and section constant were clear, plus **redirects** for legacy alias URLs. **Heavy UI** (rich charts, map-based M4, multi-step CRUD, content hub) remains on **`WavePlaceholderPage` → legacy** until dedicated SPA work lands.

**2026-04-06 completion sweep:** W1 **providers** (list + JSON detail), **staff**, **reviews**, **user-reports**, **refunds**, **support-ticket** JSON detail, **user** JSON detail; W3 **content** hub + **learning / explore / catalog** lists + **addons**; W4 **loyalty**, **gamification**, **notifications** (config JSON), **broadcast history** (same nav path as legacy compose — SPA is history-only), **automations**, **notification-templates**, **mapbox**, **iso-codes** (tabbed), **service-zones** list; W5 **control-plane** deep paths via titled **legacy bridge**; **payouts** extended with **reject, mark-paid, mark-failed, initiate-transfer** + reason modals.

**Cutover readiness:** **Not production-ready as full replacement** — shell + finance/users/integrations/marketing read surfaces are testable; matrix AuthZ mismatches (notably **reports vs nav**) and **public product catalog** usage must be resolved before flag flip.

---

## Pages completed (SPA route + API wired)

| Legacy area | SPA path(s) | Notes |
|-------------|-------------|--------|
| Finance summary | `/finance` | `GET /api/admin/finance/summary`, optional `start_date` / `end_date` in URL |
| Payouts | `/payouts` | `getRawJson` for `{ data, meta }`, filters in URL, **Approve** for `pending` |
| Fee configs | `/fees` | `GET /api/admin/fees/configs` |
| Billing / invoices | `/billing` | `GET /api/admin/invoices` |
| Taxes | `/taxes` | `GET /api/admin/taxes` |
| Platform fees | `/settings/platform-fees` | **API gates `platform_config`**, not finance (nav is Finance; documented) |
| Provider subscriptions | `/provider-subscriptions` | `GET /api/admin/provider-subscriptions` |
| Subscription revenue | `/subscription-revenue` | `GET /api/admin/subscription-metrics` |
| Plans | `/plans` | `GET /api/admin/plans` |
| Reports (6) | `/reports/:reportKey` | `revenue`, `bookings`, `providers`, `customers`, `gift-cards`, `yoco-reconciliation` — **API uses `overview` section** |
| Reports hub | `/reports` | Links into SPA + legacy |
| Users | `/users` | `GET /api/admin/users` nested `{ data, meta }` |
| Verifications | `/verifications` | `GET /api/admin/verifications` |
| Audit logs | `/audit-logs` | `getRawJson` + export button → `GET /api/admin/export/audit-logs` |
| Product orders | `/ecommerce/orders` | `GET /api/admin/product-orders` |
| Product returns | `/ecommerce/returns` | `GET /api/admin/product-returns` |
| Product catalog | `/ecommerce/products` | **`GET /api/public/products`** (legacy used same; not admin-scoped) |
| Webhooks | `/webhooks` | `GET /api/admin/webhooks/endpoints` |
| API keys | `/api-keys` | `GET /api/admin/api-keys` (non-envelope body) |
| Amplitude | `/integrations/amplitude` | `GET /api/admin/integrations/amplitude` |
| Promotions | `/promotions` | `GET /api/admin/promotions` |
| Gift cards | `/gift-cards` | `GET /api/admin/gift-cards` |
| System health | `/system-health` | `GET /api/admin/system-health` |
| Monitoring | `/monitoring` | `GET /api/admin/monitoring/health` |
| Security | `/security` | `GET /api/admin/security` |
| Settings | `/settings` | `GET /api/admin/settings` (summary + collapsible raw JSON) |
| App version | `/settings/app-version` | `GET /api/admin/app-version` |
| Feature flags | `/settings/feature-flags` | `GET /api/admin/feature-flags` |
| Custom fields | `/settings/custom-fields` | `GET /api/admin/custom-fields` |
| Referrals | `/settings/referrals` | `GET /api/admin/referrals` |
| Tenant domains | `/settings/tenant-domains` | **Superadmin** + `GET /api/admin/tenant-domains` |
| Team permissions | `/settings/team-permissions` | **Superadmin nav**; read-only matrix from `GET /api/admin/settings/section-permissions` |
| Control plane hub | `/control-plane`, `/control-plane/overview` | Nested routes; index redirects to `overview`; deep links → legacy |

## Redirects implemented

| Path | Target |
|------|--------|
| `/pricing-plans`, `/subscription-plans` | `../plans` |
| `/custom-fields` | `../settings/custom-fields` |
| `/sms-templates`, `/email-templates` | `../notification-templates` |
| `/settings/integrations/analytics` | `../../../integrations/amplitude` |

---

## Pages blocked or still placeholder (`*` catch-all)

**Still `WavePlaceholderPage`:** providers, staff, reviews, user-reports, refunds, support-ticket detail, full provider detail, **content** tree, catalog (admin), explore, addons, **loyalty**, **gamification**, **notifications**, **broadcast**, **automations**, **notification-templates**, **mapbox**, **ISO codes**, **service-zones** (M4), **control-plane** children (flags preview, integrations CRUD, modules, maintenance, audit-log, etc.).

**Blockers / gaps**

1. **Reports AuthZ mismatch:** `GET /api/admin/reports/*` uses **`ADMIN_SECTION_OVERVIEW`**; nav puts reports under **Overview** but finance users may expect finance-only reports — **matrix + product decision required**.  
2. **Platform fees path vs section:** UI lives under Finance in nav; API is **`platform_config`**. SPA gates with **platform_config** to avoid 403.  
3. **Product catalog:** No `GET /api/admin/ecommerce/products`; legacy used **`/api/public/products`**. SPA mirrors that — **RBAC and contract differ from matrix row 47 intent**.  
4. **Export parity:** Report “Export CSV” uses **`/api/admin/export/analytics`** (rate-limited, not report-specific in handler). Legacy revenue page passed `report_type=revenue` but server currently ignores it — **contract gap**.  
5. **Payout actions:** Only **Approve** wired; reject / mark-paid / transfer remain **legacy-only**.  
6. **Matrix `Reviewed` status:** Rows were **not** all re-signed as Reviewed in this PR — **process gate** still applies per `ADMIN_API_PARITY_MATRIX.md`.

---

## New shared building blocks

| Item | Location |
|------|-----------|
| `getRawJson` (preserve `{ data, meta }` envelopes) | `packages/admin-api-client` `createAdminApiClient` |
| Extended `adminQueryKeys` | `apps/admin-web/src/lib/adminQueryKeys.ts` |
| `downloadAdminBlob` | `apps/admin-web/src/lib/adminCsvDownload.ts` |
| **No** new generic page framework — each route follows existing **list/detail + AdminDataTable + hooks** pattern |

---

## Tests

- Extended **`adminQueryKeys.test.ts`** for finance/report/payout keys.  
- **No** new per-page component tests (risk accepted for this batch; follow `ADMIN_SPA_TEST_STRATEGY.md` §2.7 for future key/query changes).

---

## Risks introduced

- **Role confusion** on reports and platform-fees (403 for wrong section).  
- **Relative `Navigate` targets** — verified compile-time; runtime QA should click every redirect.  
- **JSON-heavy** ops pages (system health, monitoring, security) — fast to ship but weaker UX than legacy charts.

## Risks retired

- **Silent loss of pagination meta** on payouts/audit logs mitigated via **`getRawJson`**.

---

## Readiness for cutover

| Criterion | Status |
|-----------|--------|
| Nav targets resolve (no dead SPA links for shipped routes) | **Partial** — placeholder remains for many nav items |
| RBAC matches API for shipped routes | **Partial** — see mismatches above |
| Test strategy gates | **Not met** for full wave sign-off (matrix Reviewed, E2E, smoke) |
| Legacy fallback | **Yes** — placeholder + hub links |

---

## CI verification (local)

- **`pnpm exec turbo run typecheck test --filter=admin-web --filter=@beautonomi/admin-api-client`** — **pass** (Vitest: `adminQueryKeys`, client scope tests, etc.).

---

## References

- [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md)  
- [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md)  
- [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md) §14  
- [`ADMIN_FOUNDATION_HARDENING_REPORT.md`](./ADMIN_FOUNDATION_HARDENING_REPORT.md)
