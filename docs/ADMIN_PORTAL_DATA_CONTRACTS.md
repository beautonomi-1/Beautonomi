# Admin Portal — Data Contracts

> Page → API endpoints → request/response schema (summary).  
> All admin APIs require superadmin (see ADMIN_PORTAL_ROLE_MODEL.md).

## Convention

- **Response shape**: Admin APIs use `{ data: T | null, error: { message: string, code?: string } | null }`. Some legacy routes still return e.g. `{ featureFlag }` or `{ featureFlags }`; those are noted.
- **Auth**: Every request must be authenticated; role is enforced via `requireRole(["superadmin"])` or `requireRoleInApi(["superadmin"], request)`.

---

## Core pages and their APIs

### Dashboard

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/dashboard` | `/api/admin/dashboard` | GET | (none) | `{ data: { ...stats } \| null, error \| null }` |

### Users

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/users` | `/api/admin/users` | GET | Query: limit, offset, search, role, status | `{ data: { users, total } \| null, error \| null }` |
| `/admin/users/[id]` | `/api/admin/users/[id]` | GET | — | `{ data: user \| null, error \| null }` |
| | `/api/admin/users/[id]/role` | PATCH | Body: role | `{ data, error }` |
| | `/api/admin/users/[id]/password` | POST | Body: new_password | `{ data, error }` |
| | `/api/admin/users/[id]/impersonate` | POST | (none) | `{ data: { token or url }, error }` |
| | `/api/admin/users/[id]/bookings` | GET | Query: limit, offset | `{ data: { bookings, total }, error }` |

### Providers

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/providers` | `/api/admin/providers` | GET | Query: limit, offset, status, search | `{ data: { providers, total }, error }` |
| `/admin/providers/[id]` | `/api/admin/providers/[id]` | GET/PATCH | PATCH body: status, etc. | `{ data: provider, error }` |
| | `/api/admin/providers/[id]/status` | PATCH | Body: status, reason? | `{ data, error }` |
| | `/api/admin/providers/[id]/verify` | POST | Body: decision, notes? | `{ data, error }` |

### Bookings

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/bookings` | `/api/admin/bookings` | GET | Query: limit, offset, status, from, to | `{ data: { bookings, total }, error }` |
| `/admin/bookings/[id]` | `/api/admin/bookings/[id]` | GET | — | `{ data: booking, error }` |
| | `/api/admin/bookings/[id]/cancel` | POST | Body: reason | `{ data, error }` |
| | `/api/admin/bookings/[id]/refund` | POST | Body: amount?, reason | `{ data, error }` |
| | `/api/admin/bookings/[id]/dispute` | POST | Body: ... | `{ data, error }` |

### Refunds

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/refunds` | `/api/admin/refunds` | GET | Query: limit, offset, status | `{ data: { refunds, total }, error }` |
| | `/api/admin/refunds/[id]` | GET/PATCH | — | `{ data: refund, error }` |

### Payouts

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/payouts` | `/api/admin/payouts` | GET | Query: limit, offset, status | `{ data: { payouts, total }, error }` |
| | `/api/admin/payouts/[id]/approve` | POST | Body: (optional) | `{ data, error }` |
| | `/api/admin/payouts/[id]/reject` | POST | Body: reason? | `{ data, error }` |
| | `/api/admin/payouts/[id]/mark-paid` | POST | — | `{ data, error }` |
| | `/api/admin/payouts/[id]/mark-failed` | POST | Body: reason? | `{ data, error }` |

### Feature flags

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/control-plane/feature-flags`, `/admin/settings/feature-flags` | `/api/admin/feature-flags` | GET | — | `{ data: FeatureFlag[], error }` |
| | `/api/admin/feature-flags` | POST | Body: feature_key, feature_name, description, enabled, category, metadata | `{ data: FeatureFlag, error }` |
| | `/api/admin/feature-flags/[id]` | GET | — | `{ featureFlag }` (legacy) |
| | `/api/admin/feature-flags/[id]` | PATCH / DELETE | PATCH body: partial flag | `{ featureFlag }` / 204 |

### Verifications

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/verifications` | `/api/admin/verifications` | GET | Query: limit, offset, status | `{ data: { items, total }, error }` |
| | `/api/admin/verifications/[id]` | GET/PATCH | — | `{ data, error }` |

### Audit logs

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/audit-logs` | `/api/admin/audit-logs` | GET | Query: limit, offset, action, entity_type, from, to | `{ data: { logs, total }, error }` |

### Finance

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/finance` | `/api/admin/finance/summary` | GET | Query: from, to | `{ data: summary, error }` |
| | `/api/admin/finance/transactions` | GET | Query: limit, offset, from, to | `{ data: { transactions, total }, error }` |

### Broadcast

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/broadcast` | `/api/admin/broadcast/email` | POST | Body: subject, body, segment? | `{ data, error }` |
| | `/api/admin/broadcast/push` | POST | Body: title, body, segment? | `{ data, error }` |
| | `/api/admin/broadcast/sms` | POST | Body: message, segment? | `{ data, error }` |
| | `/api/admin/broadcast/history` | GET | Query: limit, offset | `{ data: { items, total }, error }` |

### API keys

| Page | Endpoint | Method | Request | Response |
|------|----------|--------|---------|----------|
| `/admin/api-keys` | `/api/admin/api-keys` | GET / POST | POST: name, scope? | `{ data: key \| list, error }` (never return raw secret twice) |
| | `/api/admin/api-keys/[id]` | GET / PATCH / DELETE | — | `{ data, error }` |

### Other admin APIs

- **Reports**: `/api/admin/reports/bookings`, `/api/admin/reports/revenue`, etc. — GET with query params; `{ data, error }`.
- **Export**: `/api/admin/export/*` (bookings, users, transactions, audit-logs, etc.) — GET with query; stream or `{ data, error }`.
- **Disputes**: `/api/admin/disputes`, `/api/admin/disputes/[id]`, `/api/admin/bookings/[id]/dispute/resolve` — GET/POST/PATCH; `{ data, error }`.
- **Support tickets**: `/api/admin/support-tickets`, `/api/admin/support-tickets/[id]`, `.../messages`, `.../notes` — standard list/detail/mutation; `{ data, error }`.
- **Config/catalog/content**: Various `/api/admin/catalog/*`, `/api/admin/content/*`, `/api/admin/notification-templates/*`, etc. — CRUD; `{ data, error }` where updated.

---

## Pagination

- List endpoints use **limit** and **offset** (or **page**) query params. Response includes **total** where applicable (e.g. `{ data: { items, total }, error }`).
- Export endpoints may use cursor or streaming for large result sets.

## Error codes (typical)

- `UNAUTHORIZED` — not logged in.
- `FORBIDDEN` — not superadmin.
- `VALIDATION_ERROR` — invalid body/params.
- `NOT_FOUND` — resource missing.
- `FETCH_ERROR`, `CREATE_ERROR`, etc. — DB/operation failure.
- `INTERNAL_ERROR` — unhandled exception (handleApiError).
