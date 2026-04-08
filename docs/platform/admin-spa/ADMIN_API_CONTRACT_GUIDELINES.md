# Admin API contract guidelines (`/api/admin/*`)

**Audience:** Backend/API engineers, admin SPA consumers, QA.  
**Scope:** Next.js route handlers under `apps/web/src/app/api/admin/**/route.ts` (and `route.tsx` if present).  
**Inventory:** Regenerate `docs/admin-api-route-taxonomy.csv` with `node docs/scripts/generate-admin-route-taxonomy.mjs`; CI also enforces that every on-disk admin route appears in that CSV (`apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs`).

---

## 1. Audit snapshot (baseline)

### 1.1 Scale

- **~240+** discrete admin HTTP handlers (same order of magnitude as taxonomy rows; exact count drifts with merges).
- **Mixed maturity:** newer routes use shared helpers; many legacy routes return ad-hoc JSON.

### 1.2 Inconsistent response shapes (priority fix)

| Pattern | Where it shows up | Consumer impact |
|--------|-------------------|-----------------|
| **Envelope** `{ "data": T, "error": null }` via `successResponse` / `errorResponse` | Bootstrap, bookings list, many settings/control-plane routes, `GET /api/admin/users` | `@beautonomi/admin-api-client` and modern SPA code expect this. |
| **Raw JSON** — root keys like `{ tickets, total, limit, offset }`, `{ error: string }`, `{ success: true }`, resource wrappers `{ ticket }`, `{ template }` | Support tickets, SMS/email templates, payouts mutations, parts of users, verifications | Clients need one-off parsers; errors sometimes **not** `{ data, error }`. |
| **Double nesting** — e.g. envelope `data` containing `{ data: rows, meta: {...} }` | Some list endpoints (e.g. users) | Easy to mis-type in Zod; confusing vs flat `items` + `meta`. |

**Target:** All **new** and **touched** admin JSON responses use the standard envelope (§3). Legacy routes migrate opportunistically (see §7).

### 1.3 Pagination and filtering (weak / inconsistent)

| Issue | Examples / notes |
|-------|------------------|
| **Two pagination dialects** | `page` + `limit` (often with `getPaginationParams`) vs `offset` + `limit` (support tickets, explore posts, user reports, ranking scores). |
| **Inconsistent list payload** | Some return `items`, some `data`, domain keys (`tickets`, `users` implied), or nested `{ data, meta }` inside envelope `data`. |
| **Meta shape drift** | `total`, `has_more`, sometimes `totalPages` implied but not returned; default `limit` varies (20, 25, 50, 100). |
| **Filter naming** | Mix of `q`, `search`, status enums, `assigned_to` vs `assignee`; no shared query-parameter registry. |
| **Unbounded lists** | e.g. `GET /api/admin/bookings` loads all rows for tenant after filters (no server-side pagination) — risk for large tenants. |

**Target:** Standard list contract (§4) + shared helpers; cap limits; add pagination to high-volume lists when editing those files.

### 1.4 Role and section inconsistencies

| Issue | Detail |
|-------|--------|
| **`requireRoleInApi` vs `requireAdminSection`** | Some resources use a **role array** (e.g. support ticket staff roles) while siblings use **section** constants. Both can be correct, but the **matrix** must document which applies; mismatches vs sidebar section confuse FE guards. |
| **Superadmin-only** | Implemented ad hoc (`requireAdminSection` + `role === "superadmin"`, or dedicated checks). Easy to drift from nav `superadminOnly`. |
| **`nav-counts`** | Gated with `ADMIN_SECTION_PLATFORM_CONFIG` while badges reflect cross-section work queues — **product/API alignment** tracked in parity matrix. |
| **Proxy vs API** | Edge proxy allows any `ALL_ADMIN_ROLES` into `/admin`; **fine-grained AuthZ is on each API** — never rely on UI alone. |

**Target:** Every route documents **section** and **extra role constraints** in `ADMIN_API_PARITY_MATRIX.md`; implement with `requireAdminSection` unless a narrow role list is intentional and documented.

### 1.5 Duplicated logic

- **Tenant scoping:** `resolveAdminApiTenantId` + query `.eq("tenant_id", …)` patterns repeated across handlers.
- **CRUD families:** `content/*`, `catalog/*`, `iso-codes/*` follow similar shapes but different response/error details.
- **Pagination math:** Reimplemented per route instead of `getPaginationParams` / `createPaginatedResponse`.

**Target:** Prefer small shared helpers (tenant scope, pagination, envelope) over copy-paste; extract only when touching a cluster of routes to avoid mega-refactors.

---

## 2. Standard response format

### 2.1 JSON envelope (mandatory for new/changed handlers)

All successful JSON responses:

```json
{
  "data": <payload>,
  "error": null
}
```

All error responses (4xx/5xx) with a JSON body:

```json
{
  "data": null,
  "error": {
    "message": "Human-readable message",
    "code": "STABLE_MACHINE_CODE",
    "details": { }
  }
}
```

- **`code`:** Stable string for clients (e.g. `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `INSERT_ERROR`). Use `errorResponse()` from `@/lib/supabase/api-helpers`.
- **`details`:** Optional; validation issues, field-level hints; keep PII out.

Use `successResponse(data, status?)`, `errorResponse(...)`, `forbiddenResponse`, `notFoundResponse`, `unauthorizedResponse` from `apps/web/src/lib/supabase/api-helpers.ts`.

### 2.2 Non-JSON responses

- **CSV/PDF/file streams:** No envelope; use appropriate `Content-Type` and status. Document in parity matrix row.
- **204 No Content:** Acceptable without body for idempotent deletes when already standard for that resource.

### 2.3 Bootstrap nuance

- Unauthenticated `GET /api/admin/bootstrap` returns **401** with the standard envelope where applicable (see route + matrix). Global `handleApiError` may map some auth messages to **403** elsewhere — when changing auth flows, keep SPA and matrix aligned.

---

## 3. Standard error format

| HTTP status | Typical `error.code` | When |
|-------------|---------------------|------|
| 400 | `VALIDATION_ERROR` | Bad body/query |
| 401 | `UNAUTHENTICATED` / `UNAUTHORIZED` | No or invalid session |
| 403 | `FORBIDDEN` | Authenticated but not allowed |
| 404 | `NOT_FOUND` | Missing resource |
| 409 | `CONFLICT` | Unique constraint / state conflict |
| 422 | `UNPROCESSABLE_ENTITY` | Semantic validation |
| 500 | `INTERNAL_ERROR` / domain-specific | Unexpected server failure |

- Prefer **`handleApiError`** for unknown thrown errors; use explicit `errorResponse` for expected failures.
- **Do not** return `{ "error": "string only" }` on new endpoints.

---

## 4. Pagination and list `data` shape

### 4.1 Query parameters (standard)

| Param | Meaning |
|-------|---------|
| `page` | 1-based page index (default **1**) |
| `limit` | Page size, clamped **1–100** (default **25** for new lists unless product dictates otherwise) |

**Compatibility:** For existing consumers using `offset` + `limit`, support both during migration: if `offset` is present, derive page as `floor(offset/limit)+1` or document deprecation.

### 4.2 List payload inside `data`

```json
{
  "data": {
    "items": [ … ],
    "meta": {
      "page": 1,
      "limit": 25,
      "total": 133,
      "has_more": true
    }
  },
  "error": null
}
```

- Use **`items`** (not nested `data.items` inside `data` — avoid `data.data`).
- **`meta.total`:** total row count before pagination.
- Optional later: `meta.total_pages` (derived) if useful for FE.

Helper: `createPaginatedResponse` in `api-helpers.ts` — extend or wrap with `successResponse` so the outer envelope stays consistent.

### 4.3 Cursor pagination (optional, future)

Reserve for live feeds or very large tables. If introduced: `cursor` + `limit`, `meta.next_cursor`, document in matrix; do not mix with `page` in the same handler without clear rules.

---

## 5. Filtering and search (patterns)

- **Full-text / fuzzy:** Prefer single param name per surface — **`q`** for global admin search; **`search`** for scoped directory lists — document the chosen name in the matrix row.
- **Sanitization:** Strip `%`, `_`, `\` and filter DSL metacharacters before passing to `.or()` / `ilike` (see support tickets implementation).
- **Enums:** Reject unknown values with **400** + `VALIDATION_ERROR` rather than silent ignore, unless legacy behavior is explicitly preserved.
- **Tenant:** Implicit from session + `resolveAdminApiTenantId`; superadmin scope via query/header as already used by `fetcher` / SPA — document per route.

---

## 6. Authorization pattern

1. **Default:** `requireAdminSection(ADMIN_SECTION_* , request)` for tenant-scoped admin work.
2. **Narrow role lists:** Only when product requires a subset (e.g. support agents); document in matrix and inline comment.
3. **Superadmin-only:** Explicit check after section or dedicated helper; align with `AdminShell` `superadminOnly` nav.
4. **Never** trust `tenant_id` from client body for authorization — derive from server session + resolver.

---

## 7. Versioning strategy

**Decision:** **No URL prefix version** (`/api/v2/admin/...`) for the current generation. Reasons:

- Surface is large; renaming paths would break the SPA and legacy admin simultaneously.
- Contract discipline is enforced by **envelope + Zod + CI**, not by path version.

**Instead:**

| Mechanism | Use |
|-----------|-----|
| **Additive JSON** | New optional fields in `data` — OK without version bump. |
| **Breaking field renames/removals** | Prefer new route suffix or feature flag; or single coordinated release with SPA + matrix + client schema. |
| **Deprecation** | Comment in route + row in parity matrix `Deprecated`; remove only after consumer count is zero. |

If a future **public** or **partner** admin API is split out, introduce **`/api/admin/v2/...`** only for that net-new surface.

---

## 8. Contract testing approach

### 8.1 Layers (combine all that apply)

| Layer | What it proves | Where |
|-------|----------------|--------|
| **A. Taxonomy presence** | Every `route.ts` registered in `docs/admin-api-route-taxonomy.csv` | CI script (see regression guardrails) |
| **B. Zod schemas** | Response (and critical query/body) shapes for SPA-used endpoints | `packages/admin-api-client/src/schemas/*` + unit tests with fixtures |
| **C. Route unit tests** | Auth + status codes + snapshot of JSON shape | Colocated `__tests__` (e.g. bootstrap) |
| **D. Staging smoke** | Real DB + session; optional Schemathesis against OpenAPI **if** spec is maintained |

### 8.2 PR expectations

- Any **change** to response shape of an endpoint used by SPA → update **Zod** schema + **parity matrix** row + note in changelog.
- New admin route → **taxonomy row** + matrix row + default to **envelope** (§2).

### 8.3 OpenAPI (optional)

Generating OpenAPI from Zod or hand-maintained spec is valuable for **staging contract tests**; it is **not** required for every route on day one. Prioritize high-risk domains: **auth, payouts, users, bookings, finance exports**.

---

## 9. Migration checklist (per route touch)

- [ ] Response uses `successResponse` / `errorResponse` (or streaming exception documented).
- [ ] Lists use `items` + `meta` (§4); pagination params documented.
- [ ] Auth uses `requireAdminSection` or documented role exception.
- [ ] Tenant scoping server-side only.
- [ ] Parity matrix row updated; taxonomy CSV row present.
- [ ] SPA schema updated if applicable.

---

## 10. Related documents

- [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md) — UI ↔ API ↔ AuthZ mapping.
- [`ADMIN_REGRESSION_GUARDRAILS.md`](./ADMIN_REGRESSION_GUARDRAILS.md) — CI and SPA regression tests.
- `docs/admin-api-route-taxonomy.csv` — route inventory.
- `apps/web/src/lib/supabase/api-helpers.ts` — envelope helpers.
