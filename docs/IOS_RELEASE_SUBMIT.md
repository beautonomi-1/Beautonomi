# Submitting a new release (Customer & Provider, iOS & Android)

Use this when you want to ship new builds to TestFlight / App Store and Google Play. **GitHub already runs production builds** when you push to `main`.

## iOS version support & App Store expectations

- **Minimum iOS:** **15.1+** (required by [Expo SDK 54](https://docs.expo.dev/versions/latest/); enforced via `expo-build-properties` → `deploymentTarget` in both apps). Older iOS releases cannot run these binaries; Apple also stops supporting very old OS versions for *new submissions* over time—check [Apple’s current requirements](https://developer.apple.com/news/upcoming-requirements/).
- **Xcode / SDK:** Build with the **Xcode version EAS “latest”** expects for SDK 54 (see Expo’s compatibility table).
- **Encryption export:** `ITSAppUsesNonExemptEncryption` is **false** (standard HTTPS only). Answer App Store Connect’s export-compliance questions to match.
- **Privacy:** Usage descriptions are set for location, photos, camera, tracking (ATT), push background mode, and **Face ID / Touch ID** (`expo-local-authentication`). Complete **Privacy Nutrition Labels** and any **Privacy Manifest** follow-ups in App Store Connect when Apple prompts.
- **Age rating:** Before each submission, confirm answers against [APP_STORE_AGE_RATING.md](./APP_STORE_AGE_RATING.md) (parental controls, age assurance, UGC, social, messaging, medical/wellness frequency, and the public **Age Suitability URL** `https://www.beautonomi.com/age-suitability`). Social enforcement defaults to audit-only (`log` mode) until flipped in Admin feature flags — see the rollout section in that doc.
- **After native changes:** Run a fresh **EAS production iOS build** so `prebuild` picks up plugin changes (`npx expo prebuild` locally is optional for verification).

## App Review notes (paste into App Store Connect)

### Customer app (`com.beautonomi`)

- **Guest browse (5.1.1(v)):** Home, Search, Shop, Explore, partner profiles, and product pages work without an account. Book, checkout, cart, messages, and account settings require sign-in. Login and sign-up include **Browse without an account**.
- **App Tracking Transparency (2.1):** On first launch after install, the ATT prompt appears after the splash screen, before Singular initializes. To record: delete the app, reinstall from TestFlight, open once, and screen-record the system **Allow Beautonomi to track your activity across other companies' apps and websites?** dialog.
- **Parental controls / age rating:** Profile tab → **Safety hub** → **Content & safety controls**, or **Account settings** → **Content & safety controls**. Restricted mode, social feed, messaging, and related toggles are there; device auth can gate changes.
- **Sign in with Apple:** Available on login/sign-up; Apple identity skips redundant name/email collection in onboarding.

### Provider app (`com.beautonomi.partner`)

- **Demo login (2.1(a)):** Email `buntulink@gmail.com`, phone `+27790624995`, OTP **`246810`** (fixed app-review code via `/api/auth/app-review/verify-otp`).
- **App Tracking Transparency:** Same ATT-before-Singular flow as the customer app on iOS.
- **Camera permission CTAs:** QR/barcode scanners auto-request camera access when opened; pre-grant UI uses **Continue**, not custom “Allow” copy.

See also [APP_STORE_AGE_RATING.md](./APP_STORE_AGE_RATING.md) for age-rating declarations and expanded customer review notes.

---

After builds have finished on [expo.dev](https://expo.dev), from the **repo root** run:

```bash
pnpm run submit:all
```

This runs, in order:

1. **Customer** → iOS (`--latest`) then Android (`--latest`)
2. **Provider** → iOS (`--latest`) then Android (`--latest`)

When prompted, choose the **new** build for each (not one already submitted).

- **iOS (`submit.production`):** Uploads to **App Store Connect**; the build shows in **TestFlight** for testing (same flow as before). Requires `appleId`, `ascAppId`, and `appleTeamId` in `eas.json` (both apps have these).
- **Android (`submit.production`):** Uses `submit.production.android` — **`track: beta`**, **`releaseStatus: completed`**. That maps to Play Console **Testing → Open testing** (public beta): the same Google Play API **`beta`** track used when “Open testing” is enabled for that track. **Internal-only** uploads use `pnpm run submit:*:android:internal` (`submit.internal` → **`track: internal`**, draft). **Phased rollout** on a track is done in Play Console or via EAS `releaseStatus: inProgress` + `rollout` (see [Expo `eas.json` Android submit](https://docs.expo.dev/eas/json/#android-specific-options-1)).

**Android “Version code X has already been used”:** You’re submitting an **old** AAB (built before the latest `versionCode` in `app.json`). Fix: trigger a **new** production build (push to `main` or run `eas build --profile production --platform android` from the app dir), wait for it to finish, then submit **that** build. Don’t pick an older build from the list.

**Other options (from repo root):**

| Command | What it does |
|---------|----------------|
| `pnpm run submit:all` | Customer (iOS + Android) then Provider (iOS + Android) |
| `pnpm run submit:customer` | Customer app: iOS then Android |
| `pnpm run submit:provider` | Provider app: iOS then Android |
| `pnpm run submit:customer:ios` | Customer → **App Store Connect / TestFlight** |
| `pnpm run submit:customer:android` | Customer → Play **open testing** / **beta** track (`submit.production`; public beta when Open testing is on in Play Console) |
| `pnpm run submit:provider:ios` | Provider → **App Store Connect / TestFlight** |
| `pnpm run submit:provider:android` | Provider → Play **open testing** / **beta** track (`submit.production`) |
| `pnpm run submit:customer:android:open` | Customer → same as `submit:customer:android` (`openTesting` profile; Android block matches `submit.production`) |
| `pnpm run submit:provider:android:open` | Provider → same (`openTesting` profile) |
| `pnpm run submit:android:open` | Both apps → Android open testing (beta track) |
| `pnpm run submit:android:internal` | Both apps → Play **internal** testing (`submit.internal`) |
| `pnpm run submit:customer:android:internal` | Customer → internal track only |
| `pnpm run submit:provider:android:internal` | Provider → internal track only |

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
