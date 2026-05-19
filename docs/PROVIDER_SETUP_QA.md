# Provider "complete setup" — QA matrix

> §provider-setup-seamless-ux 2026-05 — end-to-end QA pass for the overhauled
> provider onboarding-to-launch UX.

This document is the test plan for the work in
[`provider-setup-seamless-ux`](.cursor/plans/provider-setup-seamless-ux.plan.md).
It covers every surface that consumes the setup checklist:

- Provider mobile app — `apps/provider`
  - Dashboard hero card (`DashboardSetupCard`)
  - Onboarding hub (`/onboarding`)
  - Onboarding wizard (`/onboarding/wizard`)
  - Setup checklist screen (`/more/settings/setup-status`)
  - More-tab completion card (`/(tabs)/more`)
  - Settings hub (`/more/settings/index.tsx`)
  - Settings account hub (`/more/settings-account-hub.tsx`)
  - Auth/login chrome
  - Role gate blocked states
- Backend
  - `GET /api/provider/setup-status` (canonical)
  - `GET /api/provider/profile-completion` (deprecated, must still return)
  - `PATCH /api/me/profile` (now writes `user_profiles.about`)

---

## 1. Architecture invariants

These should never break. Verify before shipping.

| # | Invariant | Where to check |
|---|---|---|
| A | Same `% complete` shown on dashboard hero card, onboarding hub, setup checklist, and More-tab card. | All four surfaces poll `/api/provider/setup-status` via the same `useApi` cache key. |
| B | `native_route` is returned by `/api/provider/setup-status` for every step ID listed in `NATIVE_ROUTE_BY_ID`. | `apps/web/.../setup-status/__tests__/native-route-map.test.ts` |
| C | Mobile checklist UI never depends on a client-side route map. | Search `apps/provider/**/*.tsx` for `WEB_PATH_TO_NATIVE` / `PROFILE_COMPLETION_ROUTE_MAP` — should return 0 matches. |
| D | `/api/provider/profile-completion` still answers, marked `@deprecated`, and allows `provider_onboarding`. | `apps/web/.../profile-completion/route.ts` |
| E | `PATCH /api/me/profile` accepts `{ about, biography_title }` and writes them to `user_profiles`. | `apps/web/.../me/profile/route.ts` |
| F | Celebration overlay fires once per provider per device. | `provider:setup_celebration_shown_v1:<userId>` in `AsyncStorage` |

---

## 2. Per-step coverage (11 steps)

Each row should be exercised on iOS + Android. For each step:

1. **Trigger pending**: leave the gating field blank, view the checklist.
2. **Open from checklist**: tap the row → expect to land on the listed
   native route, NOT the wizard.
3. **Open from dashboard card**: tap the chip → same destination.
4. **Open from onboarding hub**: tap "Still needed" entry → same destination.
5. **Open from More tab card**: tap the row → same destination.
6. **Fix the field, save**: confirm the row flips to ✓ on next focus
   (no manual pull-to-refresh required — `useFocusEffect` rerun).
7. **All-done state**: complete all required → expect celebration overlay
   once, never again.

| Step ID | Gating field | Native route | Required? | Notes |
|---|---|---|---|---|
| `profile-details` | `providers.business_name` + `providers.description` + (phone OR email) | `/(app)/(tabs)/more/settings/business` | yes | label is "Business Details" for salons, "Business Profile" for freelancers |
| `personal-profile` | `user_profiles.about` (or 2+ supporting fields) | `/(app)/(tabs)/more/settings/personal-profile` | freelancer only | New screen in Phase 4 |
| `service-address` | `provider_locations.address_line1` (or salon location row) | `/(app)/(tabs)/more/locations` | yes | salon-vs-freelancer label diverges |
| `profile-photo` | `providers.avatar_url` or `thumbnail_url` | `/(app)/(tabs)/more/gallery` | yes | shares route with `gallery` step |
| `services` | at least one `provider_services` row | `/(app)/(tabs)/more/catalogue` | yes | |
| `availability` | at least one operating-hours row | `/(app)/(tabs)/more/settings/hours` | yes | |
| `payment` | Yoco connection state | `/(app)/(tabs)/more/settings/yoco-devices` | optional | |
| `payment-methods` | at least one of `providers.accept_cash`, `accept_card`, `accept_online` explicitly **true** (or tenant-default gift cards) | `/(app)/(tabs)/more/settings/payments` | yes | §provider-setup-2026-05: no longer auto-completes from defaults — provider must explicitly opt in |
| `payout` | at least one payout-account row | `/(app)/(tabs)/more/settings/payout-accounts` | yes | |
| `gallery` | at least one gallery image | `/(app)/(tabs)/more/gallery` | optional | |
| `identity-verification` | `users.identity_verified` **OR** `provider_verification_status.status = approved` **OR** `providers.is_verified` | `/(app)/(tabs)/more/settings/verification` | optional | §provider-verification-sync 2026-05: any of three signals satisfies the step. Sumsub `GREEN` now lifts identity + public verified badge automatically |

---

## 3. Edge cases

| # | Case | Expected behaviour |
|---|---|---|
| 1 | New provider with no provider row yet | `setup-status` returns `{ steps: [], completionPercentage: 0 }`. Dashboard card hidden. More-tab card hidden. |
| 2 | Provider on `provider_onboarding` role visits any of the consumers | No 403. Setup-status returns the 11-step shape. `profile-completion` still answers (legacy 8 items). `me/profile` PATCH supports `about`. |
| 3 | Provider completes setup mid-session | On next focus of any screen mounted under `(app)/_layout.tsx`, celebration appears once. Re-launching the app does not re-trigger it. |
| 4 | Provider re-installs the app (AsyncStorage cleared) | Celebration may fire again. Acceptable; the storage key is per-device. |
| 5 | Network down on setup-status fetch | Dashboard card hidden (no flicker). More-tab card shows non-blocking error banner with Retry. |
| 6 | Tapping a "Still needed" row in onboarding hub when `native_route` is null | Falls back to `/(app)/onboarding/wizard`. Should be unreachable in normal operation. |
| 7 | Pulling to refresh on the checklist | API re-fetches and rows update. |
| 8 | RoleGate "no provider role" block | Wrapped in `ScreenContainer` with `EmptyState`. Single "Sign out" CTA. |
| 9 | RoleGate "can't reach server" block | `ScreenContainer` + `EmptyState` with Retry primary and Sign out secondary. |
| 10 | Login screen on a notched device | Brand-consistent chrome (`ScreenContainer`), logo not clipped by the status bar, keyboard avoids input fields. |
| 11 | Sumsub `GREEN` webhook for a provider | `provider_verification_status.status=approved`, `users.identity_verified=true`, `providers.is_verified=true`. The setup checklist's `identity-verification` step ticks on next focus without an extra admin action. |
| 12 | Sumsub `RED` webhook after a previously approved badge | `is_verified` flips to `false`, `identity_verified` flips to `false`, KYC row reflects `rejected`. Slack ops alert fires. |
| 13 | Admin reset on a previously verified provider | `is_verified=false`, `identity_verified=false`, KYC row marked `reset`. Provider sees "Not started" on the verification screen and can resubmit. |
| 14 | Provider opens More tab with `payment-methods` still on defaults | Step shows as incomplete in the More card and the setup checklist until they pick at least one method. |
| 15 | Provider taps a checklist step whose `native_route` is null | Falls through to `/(app)/onboarding/wizard?focus=<id>` (matches dashboard / checklist screens). |

---

## 4. API tests

| Suite | Path | What it covers |
|---|---|---|
| `setup-status/__tests__/native-route-map.test.ts` | apps/web | Every documented step ID is in `NATIVE_ROUTE_BY_ID`; every value starts with `/(app)/(tabs)/more/`; no web `/provider/...` paths leak. |
| `setup-status/__tests__/route.test.ts` | apps/web | Payment-methods does not auto-complete; Sumsub approved KYC and public verified badge each satisfy `identity-verification`; personal-profile is freelancer-only; every step has a `native_route`. |
| `verification/__tests__/sync-provider-verification.test.ts` | apps/web | `syncProviderVerificationState` writes consistent state across `provider_verification_status`, `users`, and `providers` on approve / reject / reset, and reports a `badgeChanged` signal. |
| `webhooks/sumsub/__tests__/route.test.ts` | apps/web | Sumsub `GREEN` / `RED` review answers are mapped to `approved` / `rejected` and fanned through `syncProviderVerificationState`; bad HMAC is refused. |
| `public/express-link/[slug]/__tests__/route.test.ts` | apps/web | Active link resolves + increments `use_count`; expired / over-max / inactive / cross-tenant slugs return 404; junk prefill keys are dropped. |
| `cron/expire-custom-requests/__tests__/route.test.ts` | apps/web | Expires stale `pending` / `offered` requests and cascades to attached pending offers; refuses unauthenticated callers. |
| `provider/custom-requests/[id]/offers/__tests__/route.test.ts` | apps/web | Provider cannot send a new offer on a cancelled / expired request or with a past expiration; valid open requests accept the offer. |

Run:

```bash
pnpm --filter @beautonomi/web vitest run src/app/api/provider/setup-status src/lib/verification src/app/api/webhooks/sumsub src/app/api/public/express-link src/app/api/cron/expire-custom-requests src/app/api/provider/custom-requests
```

---

## 5. Manual smoke (per release)

1. Create a brand-new provider account (no business / services / payouts).
2. Sign in on the provider mobile app.
3. **Verify**: Dashboard hero card appears above StatCards, shows 0% and
   the first 2-3 required steps as chips.
4. **Verify**: More-tab completion card shows the same 0% and lists the
   same first incomplete step.
5. **Verify**: Setup checklist screen lists all 11 steps with chevrons.
6. Tap each row in turn. **Verify** it lands on the listed native route.
7. Complete each step (business details, location, services, hours,
   gallery photo, payment methods, payout account, etc.).
8. **Verify** the row flips to ✓ on tab return without manual refresh.
9. **Verify** the percentage updates across all four consumers in lock-step.
10. After the last required step, **verify** the celebration overlay fires
    once with two CTAs.
11. Dismiss → return to dashboard. **Verify** the hero card is hidden.
12. Re-launch the app. **Verify** the celebration does NOT re-appear.

---

## 6. Out of scope / follow-ups

- Full structural merge of `SETTINGS_SECTIONS` (settings/index.tsx) and
  `SETTINGS_CATEGORIES` (settings-account-hub.tsx) into one shared registry.
  This is a refactor and is intentionally deferred — both surfaces are
  label-aligned and route-consistent today, just not de-duped.
- Web parity for the celebration overlay (web `get-started` page already
  shows "You're set"; adding confetti there is cosmetic).
- Wizard step body redesign (animated step transitions, etc.).

---

## 7. References

- Plan: [`provider-setup-seamless-ux.plan.md`](../.cursor/plans/provider-setup-seamless-ux.plan.md)
- Follow-up tag: `§provider-verification-sync 2026-05` and `§custom-requests-lifecycle-2026-05` — search the codebase for the inline comments that pin the rationale.
- Canonical API: `apps/web/src/app/api/provider/setup-status/route.ts`
- Deprecated alias: `apps/web/src/app/api/provider/profile-completion/route.ts`
- Dashboard card: `apps/provider/src/components/setup/DashboardSetupCard.tsx`
- Celebration overlay: `apps/provider/src/components/setup/SetupCompleteCelebration.tsx`
- Personal profile screen: `apps/provider/app/(app)/(tabs)/more/settings/personal-profile.tsx`
- Provider verification sync helper: `apps/web/src/lib/verification/sync-provider-verification.ts`
- Sumsub webhook entry: `apps/web/src/app/api/webhooks/sumsub/route.ts`
- Admin manual review: `apps/web/src/app/api/admin/verifications/[id]/route.ts`
- Custom-request expiry cron: `apps/web/src/app/api/cron/expire-custom-requests/route.ts`
- Custom-offer finalize helper: `apps/web/src/lib/custom-offers/finalize-custom-offer-payment.ts`
