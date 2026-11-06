# Platform MFA, step-up and device verification — rollout

Ship with provider switches **off** (`security.provider_protection.step_up` and `device_verification` on the Security Policy page).

## Order

1. Apply migrations `10118`–`10123` (Supabase), then deploy web (Vercel), admin-web and the provider app (EAS). The provider app and web need the rebuilt `@beautonomi/auth-security` package; the root `postinstall` (`build:packages`) builds it.
2. Security Policy: confirm the admin grace banner and `two_factor.enforce_all_from`.
3. Set `step_up` and `device_verification` to **monitor** for one week. Review `provider.security.would_block` audit entries (includes `device_too_new:*`).
4. Set `step_up` to **enforce**. The payout hold stays at 48h unless changed in General Settings → payouts (`new_account_cooling_off_hours`).
5. Set `device_verification` to **enforce**. `rollout_started_at` is stamped the first time device verification leaves **off** (so in step 3) and is never overwritten; sessions that signed in before it are treated as already verified.
6. Admin all-role MFA enforcement begins at `two_factor.enforce_all_from`.

Rollback: set the switches to **off** on Security Policy (no redeploy). Server checks fail open if the session-security RPC errors.

## What users see

- **Providers, new device**: sign-in on an unrecognised device asks for a 6-digit email code (phone-only accounts re-confirm by SMS sign-in). OAuth, magic link and aal2 sessions are trusted automatically. The device is then remembered for `trusted_device_days`.
- **Providers with an authenticator**: aal1 sessions are sent to the verify screen for the code; recovery codes (10, single use) turn MFA off so the user can re-enrol.
- **Step-up** (payout accounts, Stripe Connect onboarding, password change, team changes): a dialog offers authenticator, email code or password. Changes are blocked for `limited_trust_hours` on a device trusted only by SMS sign-in.
- **New payout account**: held for the cooling-off period; owner and actor are alerted; finance admins can release the hold with a reason.

## Superadmin controls

- Security Policy page: provider switches, trusted-device days, limited-trust hours, step-up window, admin MFA enforcement date.
- User detail: Reset 2FA (superadmin, reason required) and Sign out everywhere.
- Provider finance tab: Release payout hold (reason required).
- Notification templates: `security_*` templates are protected (email/push only; required placeholders validated).

## Operations

- Cron `/api/cron/auth-security-cleanup` runs hourly: expires challenges, grants and impersonation links; prunes old security events; sends "payout account ready" when a hold ends.
- No extra env vars are required beyond the existing Supabase, Resend and `CRON_SECRET` configuration.

## Known limits

- Email and phone changes go directly from the client to Supabase Auth, so server step-up cannot gate them. Supabase requires aal2 for these when MFA is enrolled, and owners get an alert after any change.
- Metrics to watch: challenge completion rate, step-up abandonment, hold releases, security-tagged support tickets.
