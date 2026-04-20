# Sentry – Customer Mobile App (mobile-customer)

Error reporting for the customer Expo app (org: **beautonomi**, project: **mobile-customer**, project ID **4510963925385296**).

## Why events might be missing

The SDK only initializes when **`EXPO_PUBLIC_SENTRY_DSN`** is present at **build time** (embedded into the bundle via `app.config.js` → `extra`). That is separate from the Sentry Gradle/Xcode upload steps.

1. **EAS Build:** In [expo.dev](https://expo.dev) → your **customer** project → **Environment variables** (or EAS Secrets), set **`EXPO_PUBLIC_SENTRY_DSN`** for the `production` / `preview` profiles you use to ship. Use the **customer** project DSN, not the provider app DSN (each Sentry project has its own client key).
2. **Local:** Add the same variable to `apps/customer/.env.local` (never commit secrets you care about; the DSN is a public client key).

If provider works but customer does not, the usual cause is the **customer** EAS environment missing **`EXPO_PUBLIC_SENTRY_DSN`**, or only the provider `.env.local` was configured locally.

## Automatic configuration (optional)

From the **customer app directory**:

```bash
cd apps/customer
npx @sentry/wizard@latest -i reactNative --saas --org beautonomi --project mobile-customer
```

The repo is already wired for `@sentry/react-native` + Expo; the wizard mainly helps with auth token / symbol upload. After the wizard, still copy the **Client Keys (DSN)** from Sentry into EAS and `.env.local` as above.

## Manual configuration (already in repo)

- **SDK:** `@sentry/react-native` in `apps/customer/package.json`
- **Init:** `apps/customer/src/lib/sentry.ts` (called from `app/_layout.tsx`; root wrapped with `Sentry.wrap`)
- **DSN:** `EXPO_PUBLIC_SENTRY_DSN` in `.env.local` and/or EAS; exposed via `app.config.js` → `extra`
- **Expo plugin:** `@sentry/react-native/expo` in `app.config.js` (`organization: beautonomi`, `project: mobile-customer`)
- **Metro:** `metro.config.js` uses `getSentryExpoConfig`

### Get the DSN

In [Sentry](https://sentry.io) → **Settings** → **Projects** → **mobile-customer** → **Client Keys (DSN)**. The DSN URL path ends with the numeric project id (e.g. `.../4510963925385296`).

### Set the DSN locally

1. Ensure `apps/customer/.env.local` exists (e.g. `pnpm env:init` from the customer app or copy from `.env.example`).
2. Add:

   ```env
   EXPO_PUBLIC_SENTRY_DSN=https://<your-public-key>@o<org>.ingest.<de.sentry.io|sentry.io>/4510963925385296
   ```

3. Restart the Expo dev server so `app.config.js` reloads.

### Optional: Sentry in development

```env
EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=1
```

Otherwise Sentry stays disabled when `__DEV__` is true (same pattern as the provider app).

### Behaviour

- Production/preview builds send errors when **`EXPO_PUBLIC_SENTRY_DSN`** was present at build time.
- **Release** / **dist** are set from Expo config (`slug@version` and native build number) so issues group correctly next to source maps.

## Verify

1. Build a **release** binary (e.g. `eas build --profile production` or `expo run --configuration Release`).
2. Ensure **`EXPO_PUBLIC_SENTRY_DSN`** was in the EAS env for that build.
3. Trigger a test error (e.g. a dev-only button calling `Sentry.captureMessage` with `EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=1`, or a thrown error in a release build).
4. Open Sentry → **Issues** for project **mobile-customer** (project id **4510963925385296**).

## Reference

- [Sentry for React Native](https://docs.sentry.io/platforms/react-native/)
- [Sentry – Expo](https://docs.sentry.io/platforms/react-native/manual-setup/expo/)
- Provider app doc: `docs/SENTRY_MOBILE_PROVIDER_SETUP.md`
