# Submitting a new iOS release (Customer & Provider)

Use this when you want to ship a new iOS build to TestFlight / App Store and **GitHub already runs production builds** when you push to `main`.

## How builds are triggered

- **Customer:** Pushing to `main` with changes under `apps/customer/**` triggers a production iOS (and Android) build via [EAS](https://expo.dev).
- **Provider:** Pushing to `main` with changes under `apps/provider/**` triggers a production iOS (and Android) build.

Workflows: `apps/customer/.eas/workflows/build-production.yml` and `apps/provider/.eas/workflows/build-production.yml`.

## What to do every time you want to submit a new iOS release

### 1. Have a build ready

- Merge your changes to `main` (so the app you care about has changes under `apps/customer/**` or `apps/provider/**`).
- Wait for the EAS production build to finish: [expo.dev](https://expo.dev) → your account → project **customer** or **provider** → Builds.

### 2. Submit Customer app (Beautonomi) to iOS

```bash
cd apps/customer
eas submit --profile production --platform ios --latest
```

- If prompted, choose the **new** build you want to submit (not one already submitted).
- Build numbers auto-increment (`eas.json` has `autoIncrement: true`). Each new build gets a new build number.

### 3. Submit Provider app (Beautonomi Provider) to iOS

```bash
cd apps/provider
eas submit --profile production --platform ios --latest
```

- Again, select the **new** build. Don’t re-submit a build that was already sent (Apple rejects “You've already submitted this build”).

### 4. Optional: submit both in one go

From repo root you can do:

```bash
cd apps/customer && eas submit --profile production --platform ios --latest
cd ../provider && eas submit --profile production --platform ios --latest
```

---

## If you see “You've already submitted this build”

Apple identifies builds by **CFBundleVersion** (build number). That build was already sent. Fix:

1. Trigger a **new** production build (push a new commit to `main` that touches the app, or run `eas build --profile production --platform ios` from the app directory).
2. Submit that **new** build with `eas submit --profile production --platform ios --latest` (or pick it in the list).

---

## First-time / credentials

- **iOS credentials** (distribution certificate, provisioning profiles) must be set up once per app. See [DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md) and, for provider, [apps/provider/IOS_CREDENTIALS_SETUP.md](../apps/provider/IOS_CREDENTIALS_SETUP.md).
- **Submit config** (Apple ID, ASC App ID, team) is in each app’s `eas.json` under `submit.production.ios`.

## Android

Same idea: builds run on push to `main`. When ready to ship Android, from each app dir run:

```bash
eas submit --profile production --platform android --latest
```

See [DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md) for Android keystore and Play Store setup.
