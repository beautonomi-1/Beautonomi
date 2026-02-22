# Mobile (EAS) build steps

Build customer and provider Expo apps without Turbo. Use EAS Build for production binaries.

## Prerequisites

- Node and pnpm installed; repo deps installed (`pnpm install` at root).
- EAS CLI: `npm i -g eas-cli` and `eas login`.
- `eas.json` configured per app (see `apps/customer` and `apps/provider`).

## Per-app build readiness

From repo root:

```bash
# Customer
pnpm --filter customer install
pnpm --filter customer typecheck
pnpm --filter customer lint

# Provider
pnpm --filter provider install
pnpm --filter provider typecheck
pnpm --filter provider lint
```

## EAS build (production)

```bash
# Customer — all platforms
cd apps/customer
eas build --platform all --profile production

# Provider — all platforms
cd apps/provider
eas build --platform all --profile production
```

Use `--profile preview` or a custom profile from `eas.json` for staging.

## OTA updates (expo-updates)

Provider app uses `expo-updates`. Configure EAS Update and channel in `app.config.js` / `eas.json` so OTA updates point to the correct channel (e.g. production vs staging).

## Fallback (no EAS)

For local or CI builds without EAS:

```bash
cd apps/customer   # or apps/provider
npx expo prebuild
npx expo run:android   # or run:ios
```

Production store submissions should use EAS Build for consistent signing and credentials.
