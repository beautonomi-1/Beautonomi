# Push notifications — native/backend diagnostic checklist

Use this after the JS-layer reliability fixes ship. Items marked **(you)** require EAS dashboard, Firebase, or OneSignal console access.

## Build environment (both apps)

- [ ] **Production builds** use `eas build --profile production` (`APP_ENV=production`).
- [ ] **Preview/TestFlight builds** use `eas build --profile preview` (`APP_ENV=preview`). Both profiles now bake **production APNs + OneSignal production mode** (see `app.config.js` `pushUsesProduction`).
- [ ] **Development builds** (`APP_ENV=development`) are for local/dev clients only — sandbox APNs, not for store/TestFlight.
- [ ] EAS build logs show `[Beautonomi customer push-env]` or `[Beautonomi provider push-env]` with `oneSignalMode: "production"` and `apsEnvironment: "production"` for preview/production profiles.

## OneSignal app ID **(you)**

- [ ] `EXPO_PUBLIC_ONESIGNAL_APP_ID` is set as an **EAS project secret** for customer and provider (fallback when `/api/public/third-party-config` is unavailable).
- [ ] Superadmin **third-party config** returns the correct OneSignal app id per app (`customer` vs `provider`).
- [ ] OneSignal dashboard → each app → **Subscribed Users** shows test devices after login + granting permission.

## iOS APNs **(you)**

- [ ] OneSignal dashboard → Settings → Apple iOS → **APNs Auth Key** (or cert) uploaded and set to **Production**.
- [ ] App bundle ids match: `com.beautonomi` (customer), `com.beautonomi.partner` (provider).
- [ ] TestFlight build was produced with `--profile production` or `--profile preview` (both use production push entitlements after this change).

## Android FCM **(you)**

- [ ] `google-services.json` for each app is supplied at **EAS build time** (gitignored locally; not referenced in `app.config.js` today).
- [ ] Firebase project package names match: `com.beautonomi`, `com.beautonomi.partner`.
- [ ] OneSignal dashboard → Settings → Google Android → **FCM v1** service account configured for the same Firebase project.

## Backend **(you)**

- [ ] After login + permission grant, `POST /api/me/devices` (customer) or `POST /api/provider/devices` (provider) creates/updates a row in `user_devices`.
- [ ] OneSignal dashboard shows **External User Id** = Supabase user id (`OneSignal.login(userId)`).
- [ ] Send test push from OneSignal using **External User Id** alias targeting.
- [ ] Silent `badge_sync` pushes update iOS badge after mark-read (check `sync-push-badge-count.ts`).

## Android launcher badges (expectation)

- Numeric Android home-screen badges are **OEM/launcher-dependent**; many devices show **notification dots** only.
- App configures `showBadge: true` on Android channels: `default`, `bookings`, `messages`, `payments` (see `push-notifications-setup.ts`). Marketing channel uses `showBadge: false`.

## Quick device test

1. Fresh install → complete permission onboarding → grant notifications.
2. Confirm device row in DB / OneSignal subscribed.
3. Send test push → notification appears (foreground + background).
4. Tap push → correct screen opens.
5. Read a message → in-app badge decrements; iOS app icon badge resyncs on foreground.
