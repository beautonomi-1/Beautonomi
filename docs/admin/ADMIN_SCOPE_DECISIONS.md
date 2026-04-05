# Admin Scope Decisions

Date: 2026-03-22

## Chosen model

- Decision: `B) global default + optional per-country overrides`.
- Scope selector semantics:
  - `global`: default row (`tenant_id IS NULL`)
  - `tenant`: market-specific row (`tenant_id = <tenant id>`)

## Read precedence contract

1. Load tenant-specific row for current request host tenant.
2. If not found, load global default row (`tenant_id IS NULL`).
3. If still missing, keep existing hardcoded defaults where routes already use them.

## Write semantics

- Superadmin can write to both global and tenant scopes.
- Non-superadmin can only write within assigned tenant membership (already enforced in `requireAdminSection` and extended in route guards).
- Reset-to-global behavior is implemented by deleting tenant override row (or nulling override fields in merged tables where deletion is unsafe).

## Out-of-scope modules (remain global)

- ISO code registries.
- System health and low-level operational controls.
- Core infra control-plane health utilities that are not market-facing customization.

## Safety requirements

- Do not change API response contract shape during migration.
- Do not remove existing global rows until post-canary verification.
- Ensure cache keys include host/tenant context when caching scoped reads.
