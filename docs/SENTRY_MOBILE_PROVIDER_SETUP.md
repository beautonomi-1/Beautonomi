# Sentry – Provider Mobile App (mobile-provider)

Error reporting for the provider Expo app (org: **beautonomi**, project: **mobile-provider**).

## Automatic configuration (optional)

From the **provider app directory** you can run the Sentry wizard:

```bash
cd apps/provider
npx @sentry/wizard@latest -i reactNative --saas --org beautonomi --project mobile-provider
```

The repo is already manually configured; the wizard can add source maps / debug symbols upload if you want.

## Manual configuration (already done)

- **SDK:** `@sentry/react-native` in `apps/provider/package.json`
- **Init:** `apps/provider/src/lib/sentry.ts` (called from `app/_layout.tsx`, root wrapped with `Sentry.wrap`)
- **DSN:** Set in `apps/provider/.env.local` as `EXPO_PUBLIC_SENTRY_DSN`
- **Expo:** `app.config.js` passes `EXPO_PUBLIC_SENTRY_DSN` via `extra` so the app gets the DSN at runtime

### Client key (DSN)

```
https://a7e3a18afec25e88e4f4fdaf3b7b6664@o4510953897852928.ingest.de.sentry.io/4510963963265104
```

### Set the DSN locally

1. Ensure `apps/provider/.env.local` exists (e.g. `pnpm env:init` from provider app or copy from `.env.example`).
2. Add or set:

   ```env
   EXPO_PUBLIC_SENTRY_DSN=https://a7e3a18afec25e88e4f4fdaf3b7b6664@o4510953897852928.ingest.de.sentry.io/4510963963265104
   ```

3. Restart the Expo dev server so `app.config.js` picks up the new value.

### Behaviour

- Sentry is **disabled in development** (`enabled: !__DEV__` in `src/lib/sentry.ts`). To test in dev, temporarily set `enabled: true` or build a release and trigger an error.
- Production builds (EAS or local release) will send errors to Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set in the environment used for the build.

## Verify

1. Create a **production** or **release** build (e.g. `eas build` or `expo run --configuration Release`).
2. Trigger an error in the app (e.g. call a function that throws).
3. Open [Sentry → Issues](https://sentry.io/organizations/beautonomi/issues/?project=4510963963265104) for project **mobile-provider**.

## Optional: React Navigation / Expo Router

- **Expo Router:** The root layout is already wrapped with `Sentry.wrap(RootLayout)` in `app/_layout.tsx`.
- For more automatic instrumentation, see [Sentry – Expo Router](https://docs.sentry.io/platforms/react-native/manual-setup/expo-router/).

## Reference

- [Sentry for React Native](https://docs.sentry.io/platforms/react-native/)
- [Sentry – Expo](https://docs.sentry.io/platforms/react-native/manual-setup/expo/)
