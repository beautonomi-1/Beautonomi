# F12 — One Admin UI migration plan

> We have two admin UIs today. This playbook tracks the migration toward the
> single `apps/admin-web` Vite SPA and the retirement of `apps/web/src/app/admin/**`.

## Current state (2026-04-17)

| Location                          | Framework | Routes                                   |
| --------------------------------- | --------- | ---------------------------------------- |
| `apps/admin-web`                  | Vite SPA  | Active — already hosts the new shell      |
| `apps/web/src/app/admin/**`       | Next App  | ~40 directories (dashboard, finance, bookings, etc.) still live |
| `apps/web/src/components/AdminShell.*` | Next    | Wrapper for the Next admin routes         |

Duplication means every new admin feature is at risk of being built in the
wrong place, and RBAC gaps slip in when the two shells diverge.

## Target state

- `/admin/*` is served exclusively by the Vite SPA (via Vercel rewrites or a
  Next `rewrites()` entry once the SPA is pinned to a subdomain).
- `AdminShell` + `apps/web/src/app/admin/**` are deleted.
- API calls the admin makes (`/api/admin/**`) remain in Next — only the UI is
  moved.

## Rewrite plan (enabled by env flag)

Once the SPA has every page listed below, flip the flag:

```
ADMIN_UI_SOURCE=spa
```

`apps/web/next.config.mjs` (added in this migration) reads the flag and adds
a rewrite:

```ts
async rewrites() {
  if (process.env.ADMIN_UI_SOURCE !== "spa") return [];
  return [
    { source: "/admin", destination: process.env.ADMIN_SPA_URL! },
    { source: "/admin/:path*", destination: `${process.env.ADMIN_SPA_URL!}/:path*` },
  ];
}
```

When `ADMIN_UI_SOURCE=spa`:
- `apps/web/src/app/admin/**` stops being served (rewrite catches everything).
- Existing Next admin pages can be deleted incrementally.

## Page-by-page inventory

Each row needs a SPA equivalent before we can flip the flag.

- [ ] `/admin/dashboard`
- [ ] `/admin/analytics`
- [ ] `/admin/bookings`
- [ ] `/admin/finance` (+ subpages)
- [ ] `/admin/finance/period-close`  ← F22 already ported; keep SPA as canonical.
- [ ] `/admin/providers`
- [ ] `/admin/customers`
- [ ] `/admin/ecommerce`
- [ ] `/admin/content`
- [ ] `/admin/ads`
- [ ] `/admin/promotions`
- [ ] `/admin/email-templates`
- [ ] `/admin/broadcast`
- [ ] `/admin/disputes`
- [ ] `/admin/billing`
- [ ] `/admin/notifications`
- [ ] `/admin/audit-logs`
- [ ] `/admin/roles`
- [ ] `/admin/settings`
- [ ] `/admin/automations`
- [ ] `/admin/fees`
- [ ] `/admin/explore`
- [ ] `/admin/custom-fields`
- [ ] `/admin/control-plane`
- [ ] `/admin/catalog`
- [ ] `/admin/addons`
- [ ] `/admin/api-keys`
- [ ] `/admin/staffing`
- [ ] `/admin/team`
- [ ] `/admin/localization`
- [ ] `/admin/reports`
- [ ] `/admin/subscriptions`

## Deletion checklist

When every row above is ported:

1. Confirm SPA parity via Playwright visual diffs.
2. Ship behind `ADMIN_UI_SOURCE=spa` in **preview** for 1 week.
3. Enable in production. Monitor Sentry + support channel.
4. Remove:
   - `apps/web/src/app/admin/**`
   - `apps/web/src/components/AdminShell.*`
   - Orphaned admin-only components under `apps/web/src/components/admin-portal/**`
5. Update this doc with the completion date.
