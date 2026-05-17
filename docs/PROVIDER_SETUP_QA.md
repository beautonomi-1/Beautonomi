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
| `payment-methods` | accepts cash / card / online flags | `/(app)/(tabs)/more/settings/payments` | yes | |
| `payout` | at least one payout-account row | `/(app)/(tabs)/more/settings/payout-accounts` | yes | |
| `gallery` | at least one gallery image | `/(app)/(tabs)/more/gallery` | optional | |
| `identity-verification` | `users.identity_verified` | `/(app)/(tabs)/more/settings/verification` | optional | marketplace trust badge |

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

---

## 4. API tests

| Suite | Path | What it covers |
|---|---|---|
| `setup-status/__tests__/native-route-map.test.ts` | apps/web | Every documented step ID is in `NATIVE_ROUTE_BY_ID`; every value starts with `/(app)/(tabs)/more/`; no web `/provider/...` paths leak. |

Run:

```bash
pnpm --filter @beautonomi/web vitest run src/app/api/provider/setup-status
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
- Canonical API: `apps/web/src/app/api/provider/setup-status/route.ts`
- Deprecated alias: `apps/web/src/app/api/provider/profile-completion/route.ts`
- Dashboard card: `apps/provider/src/components/setup/DashboardSetupCard.tsx`
- Celebration overlay: `apps/provider/src/components/setup/SetupCompleteCelebration.tsx`
- Personal profile screen: `apps/provider/app/(app)/(tabs)/more/settings/personal-profile.tsx`
