# Staging matrix prep (booking auth & flows)

Use this checklist before manual QA rows **A1–E2**, **D1–D3**, and **F1–F5** on `https://staging.beautonomi.com`.

## Seeded providers (`scripts/e2e/seed-staging.mjs`)

| Slug | Offering ID (verify script) | Matrix rows | Notes |
|------|-----------------------------|-------------|--------|
| `e2e-test-provider-beautonomi` | `00000000-e2e0-4000-d000-000000000001` | A*, C*, D*, E1 | Salon-only, `require_auth_step=checkout` |
| `e2e-test-provider-auth-before-time` | `00000000-e2e0-4000-d000-000000000002` | B1, B2 | `require_auth_step=before_time_selection` |
| `e2e-test-provider-at-home` | `00000000-e2e0-4000-d000-000000000003` | E2 | At-home offering + E2E 50 km zone (+ national SA zone) |

Apply seed to **staging Supabase** (service role):

```bash
SUPABASE_URL=https://byfzhyqvtbasxptxdupf.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<staging service role> \
node scripts/e2e/seed-staging.mjs
```

Or from repo root with Supabase CLI logged in:

```bash
node --input-type=module -e "
import { spawnSync } from 'node:child_process';
import { PROJECTS, serviceRoleKey } from './tooling/audit/supabase-env.mjs';
spawnSync('node', ['scripts/e2e/seed-staging.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SUPABASE_URL: PROJECTS.staging.url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(PROJECTS.staging.ref),
  },
});
"
```

Disable extra fixtures with `E2E_MATRIX_FIXTURES=0` when you only need the default slug.

## Superadmin / platform (record in audit)

| Setting | Where | Staging must |
|---------|--------|--------------|
| Mapbox | `/admin/mapbox` | `is_enabled`, public token; server token in `platform_secrets` or Vercel `MAPBOX_ACCESS_TOKEN` |
| Paystack (test) | Admin → Integrations + `pnpm sync:paystack:staging` | Test keys; card redirect works on payment step |
| Auth policy | `platform_settings.settings.auth` | Email/phone OTP lengths match gate copy |
| Social OAuth | `settings.social_auth` | Google/Apple enabled for gate buttons |
| Turnstile | Vercel env only | If set, gate OTP shows Turnstile when send returns `captcha_required` |

Optional: `node tooling/audit/sync-staging-config-from-production.mjs --apply` copies **`mapbox_config`** (non-secret rows) from production.

## Supabase project

- Redirect URLs include `https://staging.beautonomi.com/auth/callback` (and production co.za when promoting).
- **Magic Link** template shows `{{ .Token }}` for gate email OTP.
- **Confirm signup** for password `/signup` and LoginModal.
- SMS + Google/Apple providers enabled for A3–A5.

## Provider portal (non-seed providers)

For one-off tests: set **Guest booking off** → `before_time_selection` in online booking settings; for at-home, enable mobile services, at-home offering, and active platform zone selections.

## Commands

```bash
node scripts/e2e/seed-staging.mjs
pnpm verify:booking:e2e-chain   # or project script for verify-booking-e2e-chain
```

See also [BOOKING_ROUTING.md](../BOOKING_ROUTING.md) (auth/resume matrix) and [MAPBOX_AND_ADDRESS_ALIGNMENT.md](../MAPBOX_AND_ADDRESS_ALIGNMENT.md).
