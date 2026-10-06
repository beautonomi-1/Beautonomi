# Mobile release 1.0.98 (Expo SDK 57)

Staged rollout: **EAS production builds → TestFlight + Play beta/internal → device matrices → store promotion**. Hold **`eas update`** until store binaries show **1.0.98** (`runtimeVersion` policy: `appVersion`).

## Version table (repo)

| App | Marketing | iOS build | Android versionCode | Bundle ID |
|-----|-----------|-----------|---------------------|-----------|
| Customer | 1.0.98 | 292 | 292 | `com.beautonomi` |
| Provider | 1.0.98 | 292 | 292 | `com.beautonomi.partner` |

**Before submit:** Confirm Play Console max `versionCode` and App Store Connect last build for each app. If **292** is already consumed on either app, bump **only that app** in its `app.config.js` (keep iOS `buildNumber` and Android `versionCode` in sync per app).

## Repo gates (run on merged `main`)

From repo root:

```powershell
pnpm run audit:deps
pnpm run audit:expo-doctor
pnpm run audit:mobile-gradle-resilience
pnpm run release:check:mobile
pnpm exec turbo run typecheck lint --filter=web --filter=admin-web
pnpm run go-live:check:offline
# Full platform (long):
pnpm run go-live:check:full
```

Record exit codes in the sign-off table below.

## EAS build & submit (manual)

- **Build:** `pnpm run build:customer:ios`, `build:customer:android`, `build:provider:ios`, `build:provider:android` (or `eas build --profile production` from each app dir).
- **Secrets / credentials:** [DEPLOYMENT_EAS.md](../DEPLOYMENT_EAS.md), [apps/provider/IOS_CREDENTIALS_SETUP.md](../../apps/provider/IOS_CREDENTIALS_SETUP.md), [mobile/PUSH_NOTIFICATIONS_CHECKLIST.md](../mobile/PUSH_NOTIFICATIONS_CHECKLIST.md).
- **Submit (after new builds):** `pnpm run submit:all` or per-app scripts — see [IOS_RELEASE_SUBMIT.md](../IOS_RELEASE_SUBMIT.md). Android production profile uses track **beta** in `eas.json`.

## Device QA (required before store promotion)

| Area | Doc |
|------|-----|
| SDK 57 UI (video, audio, theme, nav) | This release + explore/announcements video smoke |
| Payments (beta min: S1–S3 on C1,C3,C5,C7,P1) | [PAYMENTS_MOBILE_QA_MATRIX.md](../PAYMENTS_MOBILE_QA_MATRIX.md) |
| Payment-ready (full promotion) | Same matrix — all flows + S4–S6 per doc acceptance |
| Push | [mobile/PUSH_NOTIFICATIONS_CHECKLIST.md](../mobile/PUSH_NOTIFICATIONS_CHECKLIST.md) |
| Permissions | [MOBILE_PERMISSIONS_QA.md](../MOBILE_PERMISSIONS_QA.md) |
| Receipts / invoices / PDF | [qa/receipt-downloads-and-stale-pending-qa-checklist.md](../qa/receipt-downloads-and-stale-pending-qa-checklist.md) |
| PayCloud (provider hardware) | [PAYCLOUD_SANDBOX_QA.md](../PAYCLOUD_SANDBOX_QA.md) |
| Customer route parity (32) | `pnpm run parity:check` |

## Web sync

Deploy web from `main` after gates pass. Confirm [native-app-versions.generated.json](../../apps/web/src/lib/store/native-app-versions.generated.json) shows **1.0.98** for customer and provider after build/deploy.

## Automated preflight (2026-10-06)

| Check | Result |
|-------|--------|
| `release:check:mobile` | Pass |
| `audit:deps` | Pass |
| `repo.audit_expo_doctor` (go-live) | Pass |
| `verify:mobile-store-versions` | Pass (repo aligned; consoles still manual) |
| `release:eas-preflight` | Pass (`eas whoami` OK, both `expo config`) |
| Paystack Jest (customer + provider) | Pass |
| `sync-native-app-versions.mjs` | Pass → **1.0.98** in generated JSON |

Device PDF/receipt UX and payment matrix **S1–S3** still require TestFlight/Play beta binaries.

## Sign-off

| Step | Owner | Date | Pass |
|------|-------|------|------|
| Repo gates on `main` | | | |
| Store console 292 verified | | | |
| Customer EAS production build | | | |
| Provider EAS production build | | | |
| TestFlight + Play beta submit | | | |
| Device matrices (payments min + receipts checklist) | | | |
| Web production deploy + version JSON | | | |
| Store promotion | | | |

## Post-release

- Re-run `pnpm run go-live:check` on production SHA.
- Monitor Sentry mobile projects; Paystack webhooks.
- **No production OTA** until App Store / Play show **1.0.98** to users.
