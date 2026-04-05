# Admin Portal — Role Model

> Current model for admin UI/API access, section roles, and superadmin-only actions.

## Admin roles

The admin portal supports section-based roles in addition to `superadmin`.

- `superadmin`
- `admin_support`
- `admin_finance`
- `admin_trust`
- `admin_content`
- `admin_ecommerce`
- `admin_marketing`
- `admin_integrations`
- `admin_operations`
- `admin_platform_config`

## Access model

### 1) UI access (`/admin/**`)

- `apps/web/src/app/admin/layout.tsx` uses `RoleGuard` with `ALL_ADMIN_ROLES`.
- Section visibility in sidebar is controlled by `admin_section_roles` (defaulted from `ADMIN_SECTION_ROLES`, optionally overridden in `platform_settings`).
- Some pages remain intentionally `superadmin` only via page-level `RoleGuard`.

### 2) API access (`/api/admin/**`)

- Admin APIs must use:
  - `requireAdminSection(ADMIN_SECTION_...)` for section-scoped routes, or
  - `requireRoleInApi(["superadmin"], request)` for superadmin-only routes.
- Legacy `requireRole(...)` is not permitted in `/api/admin/**`.
- Provider roles (`provider_owner`, `provider_staff`) are not allowed in `/api/admin/**`; provider access must go through `/api/provider/**`.

### 3) Superadmin-only sensitive actions

The following remain superadmin-only by API guard:

- user creation (`POST /api/admin/users`)
- role changes (`PUT /api/admin/users/[id]/role`)
- impersonation (`POST /api/admin/users/[id]/impersonate`)

### 4) Data and audit

- Admin APIs primarily use server Supabase clients and can use service role only when required (cross-tenant admin operations, audit writes).
- Sensitive writes are audit logged with `writeAuditLog`.

## Boundary rule (important)

- `/api/admin/**` = admin operations.
- `/api/provider/**` = provider operations.
- If a provider portal feature needs data currently in an admin endpoint, create/extend a provider-scoped endpoint instead of widening `/api/admin/**`.
