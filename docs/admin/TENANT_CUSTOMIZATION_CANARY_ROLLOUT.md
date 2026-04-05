# Tenant Customization Canary Rollout

Date: 2026-03-22

## Modules

- `settings`: admin settings + public branding fallback.
- `content`: admin CMS content routes (pages/faqs/resources/footer/about-us/profile/preference/featured cities).
- `templates`: notification/email/sms templates with global default + tenant override.

## Rollout sequence

1. Internal host only (admin team validation).
2. One market host (`beautonomi.co.za`) with tenant override edits.
3. Two-market validation with different host routing.
4. Full rollout to launched market host set.

## Canary checks

- `pnpm --filter web typecheck`
- `pnpm audit:multi-tenant`
- `node scripts/prod/provider-canary-check.mjs` (if available in deployment workflow)
- Manual admin smoke:
  - create tenant override from scoped admin flow
  - confirm public host resolves override
  - confirm fallback to global where no override exists

## Rollback criteria

Rollback immediately if any of the following occur:

- Cross-tenant content/settings bleed confirmed.
- Admin from tenant A can mutate tenant B (or global default) without superadmin.
- Public branding/settings endpoint returns secrets or malformed payload.
- Error rate spikes on any module endpoints after scope enablement.

## Rollback actions

- Switch scope mode to `global` in admin control (superadmin).
- Disable module group via deployment gate/flag for `settings`, `content`, or `templates`.
- Keep migrations intact (additive), but stop writing tenant overrides.
- Re-run smoke tests on global default read path.
