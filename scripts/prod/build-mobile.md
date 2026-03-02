# Mobile (EAS) build steps

Build customer and provider Expo apps without Turbo. Use EAS Build for production binaries.

## Prerequisites

- Node and pnpm installed; repo deps installed (`pnpm install` at root).
- EAS CLI: `npm i -g eas-cli` and `eas login`.
- `eas.json` configured per app (see `apps/customer` and `apps/provider`).

## Monorepo: EAS Build and install

- **Git at repo root:** EAS must see the full monorepo (so it finds `pnpm-lock.yaml` and runs `pnpm install` from the repo root). Ensure `.git` is at the repository root, not inside `apps/customer` or `apps/provider`.
- **Postinstall:** Both apps have a `postinstall` script that runs `pnpm run build:packages` from the repo root so `@beautonomi/*` workspace packages are built after install. Required for EAS Build.

**Metro resolution (monorepo):** Both apps have a `metro.config.js` that sets `projectRoot = __dirname` and `watchFolders` / `nodeModulesPaths` for the monorepo so EAS Build resolves `@/` (e.g. `@/lib/supabase/client`) from the app directory, not the repo root.

If the build fails at **Install dependencies**, open the build log on expo.dev (link shown in the terminal), expand the "Install dependencies" step, and check for lockfile/registry or script errors. Fixes: ensure you run `eas build` from the app directory (e.g. `apps/provider`) with the repo root above it, and that the root has `pnpm-lock.yaml` and `packageManager` in `package.json`.

## One-time: Provider EAS project ID (already done if configured)

Customer app has its EAS project ID in `apps/customer/app.json`. **Provider** project ID is in `apps/provider/app.json` (`expo.extra.eas.projectId` and `expo.updates.url`). If you ever need to reconfigure provider:

```bash
cd apps/provider
eas build:configure
```

When prompted, choose to create a new EAS project. EAS cannot auto-write the project ID; copy the UUID it prints, then in `apps/provider/app.json` replace `REPLACE_WITH_PROVIDER_PROJECT_ID` in `expo.updates.url` with that UUID (e.g. `https://u.expo.dev/abcd1234-0597-4d93-9c09-ff7b9e11b149`). Also set `expo.extra.eas.projectId` to the same UUID.

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

Use `--profile preview` or `--profile development` from `eas.json` as needed.

## GitHub → Expo (Build from GitHub)

1. **Expo dashboard:** Install the [Expo GitHub App](https://github.com/apps/expo-github-app) and link it to your account.
2. **Link repo per project:** In [expo.dev](https://expo.dev) → Customer project → Project settings → GitHub → link this repo with **Base directory** `apps/customer`. Repeat for Provider with **Base directory** `apps/provider`.
3. **Auto-builds:** Workflows in `.eas/workflows/` trigger builds on push:
   - Push to `main` (and changes under the app folder) → production build.
   - Push to `development` (and changes under the app folder) → development build.
4. **Manual:** You can also use “Build from GitHub” on the project’s Builds page and pick branch/profile.

## EAS Secrets (env for builds)

Set production/development env for EAS builds (e.g. Supabase URL, anon key, app URL):

```bash
cd apps/customer   # or apps/provider
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://....supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..." --scope project
eas secret:create --name EXPO_PUBLIC_APP_URL --value "https://beautonomi.com" --type string --scope project
```

Use EAS Environment Variables in the dashboard to attach different values to `development` vs `production` profiles if needed.

## OTA updates (expo-updates)

Both apps use EAS Update. `app.json` has `updates.url` and `runtimeVersion.policy: appVersion`. Channels are set in `eas.json` per profile (development, preview, production).

## Fallback (no EAS)

For local or CI builds without EAS:

```bash
cd apps/customer   # or apps/provider
npx expo prebuild
npx expo run:android   # or run:ios
```

Production store submissions should use EAS Build for consistent signing and credentials.

---

## Next steps (after first successful build)

1. **Customer app – first Android build**  
   From `apps/customer` run `eas build --platform android --profile production`. The first time, EAS will prompt to generate an Android keystore; accept so credentials are stored on EAS.

2. **EAS Secrets**  
   In [expo.dev](https://expo.dev) → each project → Secrets (or run `eas secret:create` from the app dir). Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL` so production builds talk to your real backend.

3. **GitHub → Expo**  
   Install the [Expo GitHub App](https://github.com/apps/expo-github-app), then in each project’s GitHub settings link this repo with **Base directory** `apps/customer` or `apps/provider`. After that you can use “Build from GitHub” or rely on the workflows in `.eas/workflows/`.

4. **iOS**  
   When ready, run `eas build --platform ios --profile production` from each app dir (Apple Developer account required for device builds).
