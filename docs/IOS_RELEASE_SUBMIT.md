# Submitting a new release (Customer & Provider, iOS & Android)

Use this when you want to ship new builds to TestFlight / App Store and Google Play. **GitHub already runs production builds** when you push to `main`.

## Submit both apps, both platforms (iOS + Android)

After builds have finished on [expo.dev](https://expo.dev), from the **repo root** run:

```bash
pnpm run submit:all
```

This runs, in order:

1. **Customer** → iOS (`--latest`) then Android (`--latest`)
2. **Provider** → iOS (`--latest`) then Android (`--latest`)

When prompted, choose the **new** build for each (not one already submitted). Android uploads go to **Internal testing** as a **draft**; roll them out in Play Console when ready.

**Android “Version code X has already been used”:** You’re submitting an **old** AAB (built before the latest `versionCode` in `app.json`). Fix: trigger a **new** production build (push to `main` or run `eas build --profile production --platform android` from the app dir), wait for it to finish, then submit **that** build. Don’t pick an older build from the list.

**Other options (from repo root):**

| Command | What it does |
|---------|----------------|
| `pnpm run submit:all` | Customer (iOS + Android) then Provider (iOS + Android) |
| `pnpm run submit:customer` | Customer app: iOS then Android |
| `pnpm run submit:provider` | Provider app: iOS then Android |
| `pnpm run submit:customer:ios` | Customer → TestFlight only |
| `pnpm run submit:customer:android` | Customer → Play Internal testing only |
| `pnpm run submit:provider:ios` | Provider → TestFlight only |
| `pnpm run submit:provider:android` | Provider → Play Internal testing only |

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

## If you see “Something went wrong when submitting to Apple App Store Connect”

The submission was scheduled but failed while EAS was waiting. Do this:

1. **Check the submission details**  
   Open the link EAS printed (e.g. `https://expo.dev/accounts/.../submissions/...`). It often shows the real error (e.g. “You’ve already submitted this build”, export compliance, or an App Store Connect issue).

2. **Run again with verbose output** (from the app dir):
   ```bash
   cd apps/customer
   eas submit --profile production --platform ios --latest --verbose
   ```
   The logs may show the exact Apple/EAS error.

3. **Common causes**
   - **Build already submitted** → Use a newer build (trigger a new build, then submit that one).
   - **Export compliance** → In App Store Connect, open the build → provide export compliance (e.g. “No” for encryption if you use only standard HTTPS). Your `app.json` already has `ITSAppUsesNonExemptEncryption: false`.
   - **App Store Connect / API** → Confirm the app is in a valid state (e.g. no missing agreements or tax/banking). Ensure the App Store Connect API key has **App Manager** or **Admin** role.

After fixing, run `pnpm run submit:customer:ios` again (or `submit:all`). You can submit **Android** in the meantime: `pnpm run submit:customer:android` (it doesn’t depend on the iOS submission).

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
