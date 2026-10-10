# Provider onboarding + subscription — E2E smoke (manual)

Auth entry paths are documented in [AUTH.md](./AUTH.md). After auth, subscription behavior follows platform rules in `docs/PAYMENTS_MOBILE_COMPLIANCE.md`.

## Web

1. Logged out: `/provider/onboarding` → `/become-a-partner` → sign up or log in (provider context).
2. Complete wizard; **free plan** → `/provider/get-started` with active free subscription.
3. **Paid plan** → `/provider/subscription-checkout` → hosted checkout (Paystack or Stripe per region) → active paid row.

## Mobile

1. Sign up / log in (OTP, email, or OAuth) → root index → onboarding wizard.
2. **Free plan** → setup hub, no payment.
3. **Paid iOS** → App Store only; cancel shows “Payment cancelled” with Settings / Continue.
4. **Paid Android** → upgrade + initialize-payment → in-app hosted checkout.

## Superadmin (web smoke)

- Signed-in **superadmin** can open `/provider/onboarding` (RoleGuard allows `superadmin`; POST onboarding + suggest-zones allow it; draft uses any authed user).
- **Login modal** with `redirectContext=provider` sends superadmin to `/provider/onboarding` (not `/admin/dashboard`).
- **ProviderPortalGate** allows `portal=admin` only on routes in `onboarding-route-allowlist` (get-started, subscription, checkout, setup settings, etc.) — not the full partner shell.
- **get-started** and **/provider/subscription** use the same setup RoleGuard as onboarding (includes `superadmin`).
- OAuth with `next=/provider/onboarding` is allowed in `/auth/callback` and is **not** rewritten away for the admin portal.
- Completing onboarding creates a **provider owned by that user**. `persistJoinedProviderRole` **does not demote** superadmin (role stays `superadmin`).
- Subscription/checkout APIs resolve the business via `getProviderIdForUser` (owner row or `x-provider-id` hint). A superadmin with **no** provider row gets 404 until onboarding completes or a hint is set — not automatic cross-tenant access.
- **Native Partner app:** `RoleGate` still excludes superadmin; use **web** for superadmin onboarding QA.

## Stripe manage billing (Settings → Subscription)

- Paid row with `billing_provider: stripe` and `stripe_customer_id` set → **Manage billing** opens Stripe Customer Portal (`GET /api/provider/subscription/manage-link`).
- Paystack recurring → same button opens Paystack manage link (unchanged).
- Apple → App Store management only (no web manage link).

## Regression checks

- Tenant pricing on web step 15 matches `GET /api/public/pricing/plans`.
- Checkout total matches selected billing period (monthly vs yearly).
- Stripe regions: upgrade returns `requires_payment` without Paystack customer errors.
