# Platform domain alignment — provider portal vs admin portal

**Role:** Platform integration architecture.  
**Scope:** Shared business domains, authorization, API patterns, and consistency expectations between **provider** surfaces (`apps/provider` → `apps/web` `/api/provider/*`, `/api/me/*`) and **admin** surfaces (`apps/admin-web` + legacy `apps/web` `/admin/*` → `/api/admin/*`).  
**Related:** [`AUTH_ROLE_ROUTING_AUDIT.md`](../AUTH_ROLE_ROUTING_AUDIT.md), [`admin-spa/ADMIN_API_CONTRACT_GUIDELINES.md`](./admin-spa/ADMIN_API_CONTRACT_GUIDELINES.md), [`admin-spa/ADMIN_API_PARITY_MATRIX.md`](./admin-spa/ADMIN_API_PARITY_MATRIX.md).

---

## 1. Shared entities (how each portal sees them)

### 1.1 Bookings

| Aspect | Provider | Admin |
|--------|----------|--------|
| **API** | `GET/PATCH /api/provider/bookings`, date-range filters, branch checks (`assertProviderUserCanAccessBookingBranch`), optional read cache | `GET /api/admin/bookings`, `PATCH`, cancel/refund/dispute under `.../bookings/[id]/*` |
| **Scope** | Single `provider_id` resolved from session (`getProviderIdForUser`) | Tenant-wide: `tenant_id` via `resolveAdminApiTenantId`; **not** “all tenants” unless superadmin scope UX supplies tenant |
| **Data access** | Comments in code justify **admin Supabase client** for reads to avoid RLS visibility gaps | **Admin client**, tenant filter on `bookings.tenant_id` |
| **Volume** | Calendar uses high `limit` (e.g. 500) for a window | List can return **unbounded** rows for tenant after filters (pagination gap — see contract guidelines) |
| **Status UX** | `mapStatusToProvider` / `mapStatusFromProvider` in `@/lib/utils/booking-status` | Uses DB-oriented statuses in ops UIs |

**Consistency expectation:** One `bookings` row in Postgres; lifecycle transitions should be observable in both portals within seconds (no second source of truth). Provider sees a **subset** (one provider); admin sees **tenant aggregate**.

### 1.2 Users (customers, directory, staff)

| Concept | Provider | Admin |
|---------|----------|--------|
| **End customers** | Embedded in bookings/conversations; not a full “user directory” API on provider | `GET /api/admin/users`, trust/search, impersonation, exports |
| **Staff** | `provider_staff`, `provider_staff_locations`, permissions via `hasPermission` / `requirePermission` | `GET /api/admin/staff` — platform ops view of staff across providers (tenant-scoped) |
| **Roles** | `provider_owner`, `provider_staff` (+ `superadmin` in some paths) | Section roles (`admin_*`, `support_agent`) + `superadmin` |

**Consistency expectation:** `users.role` and provider linkage (`providers.user_id`, `provider_staff`) are the **authoritative** identity model; portals must not infer permissions from UI alone.

### 1.3 Services (catalog / offerings)

| Aspect | Provider | Admin |
|--------|----------|--------|
| **API** | `GET/POST/PATCH /api/provider/services` — `offerings` for **this** provider, joins `provider_categories` | `GET/POST/PATCH /api/admin/catalog/services` (and categories) — catalog ops, some routes global vs tenant-tagged per taxonomy |
| **Shape** | `OfferingCard[]` in success envelope | Admin responses vary (envelope migration in progress) |

**Consistency expectation:** Same underlying `offerings` / catalog tables; provider edits show in admin catalog views for that tenant; admin global catalog changes propagate per product rules (tenant vs global rows — see CSV taxonomy notes).

### 1.4 Payouts

| Aspect | Provider | Admin |
|--------|----------|--------|
| **API** | `GET/POST /api/provider/payouts` — list + **request** payout (`requirePermission('process_payments', …)` for POST) | `GET /api/admin/payouts` — queue, filters, pagination; approve/reject/mark-paid/transfer routes |
| **Scope** | `.eq('provider_id', providerId)` | `.eq('providers.tenant_id', tenantId)` with enriched `provider`, `bank_account` |
| **Response** | `successResponse` + display mapping (`requested_at` from `created_at`, notes merge) | **Custom JSON**: top-level `{ data, error, meta }` (not the same as `successResponse`’s nested-only `data`/`error`) |

**Consistency expectation:** Single `payouts` pipeline — provider **requests**, admin **fulfills**; status transitions are the contract between sides.

---

## 2. Role and permission logic

### 2.1 Provider

- **Coarse gate:** `requireRoleInApi(['provider_owner','provider_staff',…])`.
- **Fine gate:** `requirePermission(permissionKey)` checks `provider_staff` capabilities via `hasPermission`; owners/superadmin short-circuit.
- **Branch / location:** `assertProviderUserCanAccessBookingBranch` for booking operations (owner/manager vs location-assigned staff).
- **403 shape:** `requirePermission` can return **non-envelope** JSON (`{ error, message, permission }`) — diverges from admin contract guidelines.

### 2.2 Admin

- **Primary gate:** `requireAdminSection(ADMIN_SECTION_*)` mapping to section roles + superadmin.
- **Exceptions:** Narrow role lists (e.g. support tickets), or `requireRoleInApi(ALL_ADMIN_ROLES)` for bootstrap-like endpoints.
- **No** provider-style permission matrix — capability is **section** (and sometimes explicit superadmin-only routes).

### 2.3 Cross-portal tension

| Issue | Detail |
|-------|--------|
| **Different auth vocabularies** | Provider: permission keys + staff roles. Admin: section constants. Cross-mapping is implicit (e.g. finance admin sees payouts; provider sees only own payouts). |
| **Superadmin** | Can appear in provider APIs; admin APIs use section + explicit checks. Risk: behavior drift if one side assumes superadmin and the other does not. |
| **Staff vs admin_staff** | Provider “staff” rows are not the same as platform `support_agent` / `admin_*` users — naming collision in product copy only; data model is distinct. |

---

## 3. API usage patterns

| Pattern | Provider (Expo + web API) | Admin (SPA + legacy web) |
|---------|---------------------------|---------------------------|
| **Base** | `/api/provider/*`, `/api/me/*` for shared “current user” | `/api/admin/*` |
| **Client** | `useApi`, `api.get/post` in `apps/provider` | `@beautonomi/admin-api-client`, legacy `fetcher.ts` with tenant scope query params |
| **Envelope** | Predominantly `successResponse` / `handleApiError` | Mixed: many routes use helpers; others raw `NextResponse.json` or triple `{ data, error, meta }` |
| **Pagination** | Query-param per route (`limit`, date ranges) | Inconsistent (`page`/`limit`, `offset`/`limit`, unbounded lists) |
| **Tenant** | `resolveTenantIdWithZaFallback` on many routes | `resolveAdminApiTenantId` + superadmin tenant picker for scoped admin |

---

## 4. Data consistency expectations

1. **Single source of truth:** Postgres tables (`bookings`, `payouts`, `offerings`, `users`, …) — no duplicate “shadow” stores for the same entity between portals.
2. **Eventual consistency:** Read replicas or caches (e.g. provider bookings list cache) should be **short TTL** and invalidated on writes (pattern already used on provider bookings).
3. **Currency / region:** Both sides use `getTenantRegionConfig` + `LAST_RESORT_CURRENCY` patterns on many routes — good alignment; keep changes in shared libs.
4. **Audit:** Admin actions often write `audit` / config logs; provider actions should remain traceable (booking version fields, etc.) — verify critical mutations on both sides log actor identity.

---

## 5. Identified mismatches

| # | Area | Mismatch |
|---|------|----------|
| M1 | **Admin bookings comment vs behavior** | Comment suggests “superadmin sees all bookings”; `GET` still filters by **resolved admin tenant**, not cross-tenant unless product adds that explicitly. |
| M2 | **List scale** | Provider calendar caps with `limit` + dates; admin bookings can load full tenant list — performance and UX risk. |
| M3 | **JSON contracts** | Admin payouts (and others) use `{ data, error, meta }` at **root**; standard envelope is `{ data, error }` with `meta` **inside** `data` for lists — SPA/client must special-case. |
| M4 | **Permission errors** | Provider `requirePermission` 403 body shape ≠ admin `errorResponse` shape — mobile/web error handling duplicated. |
| M5 | **Bootstrap / role** | Provider uses `/api/provider/profile` + `/api/me/role`; admin uses `/api/admin/bootstrap` — different fields; acceptable if documented, but “who am I” is not one DTO. |
| M6 | **Booking status labels** | Customer/provider mapped labels vs admin raw DB statuses — correct by design; risk if admin UI reimplements mapping differently from `booking-status.ts`. |
| M7 | **Payout workflow** | Provider POST creates request; admin mutates status — alignment depends on strict status machine; gaps cause “requested in app, invisible in queue” if tenant/provider filter wrong. |

---

## 6. Duplicated logic (candidates to consolidate)

| Logic | Locations | Recommendation |
|-------|-----------|----------------|
| **Tenant + currency** | Repeated `resolveTenantId*` + `getTenantRegionConfig` + `LAST_RESORT_CURRENCY` | Keep in shared helpers; avoid copy-paste in new routes. |
| **Provider enrichment** | Admin payouts attach `provider` + `bank_account`; provider payouts map display fields | Extract a small `formatPayoutForRole('provider' \| 'admin')` in `lib/` when next touching payouts. |
| **Pagination** | `getPaginationParams` vs ad hoc | Standardize admin lists per contract guidelines; provider can adopt same **meta** shape for new endpoints. |
| **Booking branch access** | `assertProviderUserCanAccessBookingBranch` (server) | No admin equivalent (admin bypasses) — intentional; document as security boundary. |
| **Status mapping** | `booking-status.ts` | Import from single module in any new admin/provider UI that shows booking state to humans. |

---

## 7. Inconsistent workflows

1. **Refund / cancel:** Provider may propose or customer flows; admin has explicit cancel/refund/dispute APIs — product rules must define who is authoritative when both could act.
2. **Verification:** Provider Sumsub tokens vs admin verifications queue — same user record, different entry points; align SLA messaging in UX.
3. **Messaging / attachments:** Provider uses `/api/provider/conversations` + `/api/me/messages/upload`; admin may use different support paths — ensure ticket ↔ conversation linking is one story where required.

---

## 8. Alignment improvements (prioritized)

| Priority | Action |
|----------|--------|
| P0 | **Unify list + error JSON** for admin routes consumed by SPA (see `ADMIN_API_CONTRACT_GUIDELINES.md`); add Zod for payouts/bookings used in both admin SPA and any shared tooling. |
| P0 | **Server-side pagination** for `GET /api/admin/bookings` (and similar hot lists) with the same `meta` shape as other admin lists. |
| P1 | **`requirePermission` 403** responses migrated to `{ data: null, error: { message, code, details } }` for parity with admin (mobile clients update parsers once). |
| P1 | **Clarify admin bookings scope** in API comments and parity matrix: tenant-scoped vs future cross-tenant superadmin view. |
| P2 | **Shared DTO package** (optional): `packages/domain-types` or extend existing `types/beautonomi` with `AdminBookingSummary`, `ProviderBookingSummary`, `PayoutListItem` — FE imports only types; validation stays Zod in clients. |
| P2 | **Workflow diagram** in product docs for refund/dispute/cancel ownership (provider vs customer vs admin). |
| P3 | **OpenAPI or Zod-first** generation for top 20 cross-portal entities to catch drift in CI. |

---

## 9. Where logic should live

| Concern | Frontend (portal) | API (server) |
|---------|-------------------|--------------|
| **Authorization** | Hide nav / show empty states only | **Must enforce** — `requireAdminSection`, `requireRoleInApi`, `requirePermission`, branch checks |
| **Tenant / provider scope** | Display selected tenant (admin) or location filter (provider) | **Resolve** IDs from session + DB; ignore client-supplied tenant for authz |
| **Booking status labels** | Map for display using `booking-status.ts` | Store **DB enum only**; mapping is presentation |
| **Pagination state** | Page, filters in URL/state | Clamp limits, compute `meta.total`, apply filters safely (sanitized `ilike`) |
| **Payout eligibility** | Show balance / CTA | **Compute** balance, limits, fraud rules server-side (`getAvailablePayoutBalance`, etc.) |
| **Duplicate validation** | Lightweight UX (required fields) | **Authoritative** validation + idempotency for POST/PUT |

**Rule of thumb:** If a mistake could leak **another tenant’s data** or **perform a financial action**, logic belongs **only** on the server. Portals may duplicate **read-only** derivations for UX if they are tested against the same library (e.g. status mapping).

---

## 10. Standardized shared domain models (proposal)

Use **one DB row shape** per table; **multiple view DTOs** are OK if named and versioned in code.

| Entity | Canonical store | Provider view | Admin view |
|--------|-----------------|---------------|------------|
| Booking | `bookings` | Narrow columns + provider joins + branch filter | Tenant-wide + customer/provider joins + ops actions |
| User | `users` | Self + counterparty on booking/conversation | Directory + trust + exports |
| Service | `offerings` (+ categories) | Provider catalog card | Catalog + moderation |
| Payout | `payouts` | Own provider rows + request semantics | Queue + bank enrichment + state transitions |

Introduce **stable field names** in API responses (`scheduled_at`, `status`, `provider_id`, `tenant_id`) even when inner joins differ — avoid renaming the same column per portal.

---

## 11. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-04-05 | Platform architecture | Initial report from codebase review (`api/provider`, `api/admin`, `booking-status`, `requirePermission`, payouts routes). |
