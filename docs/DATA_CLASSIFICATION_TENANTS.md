# Data classification and regions (tenant-aware)

**Spec:** `docs/INTERNATIONAL_MULTI_TENANT_IMPLEMENTATION_SPEC.md` §21 (data classification / retention).

**Purpose:** Internal alignment for what is **tenant-scoped business data**, **region-bound payment metadata**, and **global reference** data—so retention, export, and incident response stay consistent across markets.

| Class | Examples (non-exhaustive) | Boundary |
|--------|---------------------------|----------|
| **Tenant business** | Bookings, payments, provider catalog, customer PII tied to a market | `tenant_id` required; RLS and API filters use tenant context. |
| **Region / rail config** | Gateway allowlists, PSP keys via `region_secrets`, tax defaults | Scoped by `region_id` / tenant region; not copied across tenants without a product decision. |
| **Global reference** | ISO currencies, country lists, static copy | No `tenant_id`; safe to cache globally. |

**Retention:** Prefer tenant lifecycle (`tenants.lifecycle`) and domain disable (`tenant_domains`) before destructive deletes. High-value tables should use **RESTRICT** FKs (see spec §6.9).

**Updates:** When adding new payment or PII tables, record whether they are tenant-bound and update this table row if the pattern is new.
