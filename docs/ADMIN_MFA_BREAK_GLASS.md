# Admin MFA — Enforcement & Break-Glass Recovery

This runbook explains how admin two-factor authentication (2FA / TOTP) is enforced
and how to recover an admin who is locked out.

## How enforcement works

Admin MFA is governed **solely** by the platform security policy stored in the
database, in `platform_settings.settings.security.two_factor`:

```json
{ "enabled": true, "required_for_admins": true }
```

- `enabled` — admins are allowed to enroll an authenticator.
- `required_for_admins` — admins **must** present a verified TOTP factor (session
  at AAL2) before any `/api/admin/*` route or admin page will load.

The gate lives in `requireAdminMfaIfRequired` (`apps/web/src/lib/supabase/api-helpers.ts`),
which every admin API request passes through via `requireRoleInApi`. There is **no
environment override** — the DB toggle is authoritative in every environment,
including production. This is intentional so superadmins control it from
**Admin → Operations → Security** (which writes via `PATCH /api/admin/security`).

When the policy requires MFA and the caller's session is not AAL2 (or they have no
authenticator), the request is rejected with HTTP `403` / code `MFA_REQUIRED`, and a
high-risk `admin.access.mfa_denied` audit entry is written.

## Turning enforcement on/off (normal path)

1. Sign in to the admin portal as a superadmin.
2. Go to **Operations → Security → Two-factor authentication**.
3. Toggle **Require 2FA for admins** and **Save changes**.

> ⚠️ Before turning it **on**, confirm at least one superadmin has a verified
> authenticator enrolled (see below). The change takes effect immediately on save.

## Enrolling an authenticator (admin self-service)

1. After login, the portal routes un-enrolled admins to the MFA enrollment page
   (`/mfa/enroll`, backed by `MfaEnrollPage.tsx`).
2. Scan the QR code (or enter the secret) into an authenticator app
   (Google Authenticator, 1Password, Authy, etc.).
3. Enter the 6-digit code and confirm. Supabase verifies the factor and elevates the
   session to AAL2.

Under the hood this uses Supabase Auth MFA: `auth.mfa.enroll({ factorType: 'totp' })`
→ `challenge` → `verify`.

## Break-glass: recovering a locked-out admin

If **all** admins are locked out (e.g. enforcement was enabled before anyone
enrolled, or a device was lost), use the Supabase **service role** to remove the
stale/missing TOTP factor so the admin can sign in and re-enroll.

You need: Supabase project access (Dashboard or service-role key). The service role
bypasses RLS — restrict this to on-call operators.

### Option A — Supabase Dashboard

1. Open the Supabase project → **Authentication → Users**.
2. Find the locked-out admin by email.
3. Open the user and remove their MFA / TOTP factor(s).
4. Tell the admin to sign in again; they will be prompted to re-enroll.

### Option B — SQL (service role / SQL editor)

Inspect factors:

```sql
select id, user_id, factor_type, status, friendly_name, created_at
from auth.mfa_factors
where user_id = '<USER_UUID>';
```

Delete the factor(s) so the user can re-enroll on next login:

```sql
delete from auth.mfa_factors
where user_id = '<USER_UUID>';
```

> Deleting the factor does not delete the user. On next login the user has no
> verified TOTP factor; if the policy still requires MFA they are routed straight to
> enrollment.

### Option C — Temporarily relax the policy (last resort)

If no operator can reach Supabase Auth but you do have DB access, you can disable
enforcement directly, sign in, fix enrollment, then re-enable:

```sql
update public.platform_settings
set settings = jsonb_set(
      settings,
      '{security,two_factor}',
      jsonb_build_object('enabled', true, 'required_for_admins', false),
      true
    ),
    updated_at = now()
where is_active = true;
```

Re-enable afterwards by setting `required_for_admins` back to `true` (or via the
Security page). Both the change and the subsequent denials are captured in the audit
log.

## Verification after recovery

- Locked-out admin can sign in and reach an admin page.
- A fresh `admin.access.mfa_denied` entry is **not** produced for the recovered admin.
- Re-enable enforcement (if you used Option C) and confirm the policy reads
  `{ enabled: true, required_for_admins: true }` on the Security page.
