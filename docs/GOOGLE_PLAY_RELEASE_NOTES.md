# Google Play release dashboard – recommended actions

When you see **recommendations** (not blocking errors) on the release dashboard for the customer or provider app, here’s what they mean and what to do.

---

## 1. Edge-to-edge may not display for all users / deprecated APIs

**Message:** “Your app uses deprecated APIs or parameters for edge-to-edge.”

**Cause:** The app uses `edgeToEdgeEnabled: true` and some underlying APIs (e.g. status bar / navigation bar color) are deprecated in Android 15+. React Native and libraries like `react-native-screens` are updating to the new APIs.

**What to do:**

- **No config change required.** Keep `edgeToEdgeEnabled: true` in `app.json` (needed for Android 16+).
- **Update and rebuild:** Use the latest Expo SDK 54 patch and compatible dependencies, then create a **new** production build and submit that build. Newer Expo/RN versions use less deprecated edge-to-edge APIs.
- From the app directory:
  ```bash
  cd apps/customer   # or apps/provider
  npx expo install --fix
  ```
  Then push to `main` (or run `eas build --profile production --platform android`) and submit the new AAB. The warning may clear after the next review.

---

## 2. Recompile your app with 16 KB native library alignment

**Message:** “Recompile your app with 16 KB native library alignment.”

**Cause:** Google Play expects native libraries (`.so` files) to support 16 KB memory page size (Android 15+). Older builds may have been compiled with 4 KB alignment.

**What to do:**

- You’re already on **Expo SDK 54** and **React Native 0.81**, which support 16 KB alignment when built with a current EAS image.
- Ensure the **next** build uses up-to-date dependencies and the **latest** EAS build image (your `eas.json` already has `"image": "latest"` for production Android).
- Update Expo and deps, then **rebuild** (don’t resubmit an old AAB):
  ```bash
  cd apps/customer   # or apps/provider
  npx expo install --fix
  ```
  Push to `main` to trigger a new EAS build, or run `eas build --profile production --platform android`. Submit the **new** build to Play; the 16 KB recommendation should clear once the new AAB is processed.

---

## 3. Technical quality (generic)

**Message:** “Technical quality” with no extra detail.

**What to do:** Open the recommendation in Play Console for the exact wording. Often it’s the same as (1) or (2), or a different policy (e.g. permissions, privacy). Address the specific point shown there; updating and rebuilding as above often resolves technical-quality notes related to edge-to-edge or 16 KB.

---

## Summary

| Recommendation              | Action |
|----------------------------|--------|
| Edge-to-edge deprecated    | Keep `edgeToEdgeEnabled: true`. Run `npx expo install --fix`, trigger a new production build, submit that build. |
| 16 KB native library       | You’re on Expo 54 / RN 0.81. Run `npx expo install --fix`, trigger a **new** production build (don’t resubmit old AAB), submit the new build. |
| Technical quality          | Check the exact message in Play Console; usually addressed by the same update + rebuild + new submit. |

These are **recommendations**, not hard blocks. You can still ship; fixing them improves compatibility and future-proofs the app. After updating, rebuilding, and submitting a new release, recheck the release dashboard to see if the items clear.
