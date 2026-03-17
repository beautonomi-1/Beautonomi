# Provider app: iOS credentials (do this once)

Customer iOS worked because credentials were set up for that app. **Provider is a separate app** and needs the same setup once.

## 1. Run EAS credentials (interactive)

From this directory (`apps/provider`):

```bash
cd apps/provider
eas credentials --platform ios
```

1. When prompted, choose the **production** build profile.
2. Go to **Build Credentials** and complete the flow:
   - **Set up a new Distribution Certificate** (or use existing and validate).
3. You will see **two targets** (main app + OneSignal extension). Complete credentials for **both**:
   - **Beautonomi Provider** (`com.beautonomi.partner`)
   - **OneSignalNotificationServiceExtension** (`com.beautonomi.partner.OneSignalNotificationServiceExtension`)
4. They can share the same Distribution Certificate; each needs its own Provisioning Profile.

## 2. If build fails: "Provisioning profile doesn't support the App Group"

The extension’s App ID in Apple must have the App Group enabled.

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Open **com.beautonomi.partner.OneSignalNotificationServiceExtension**.
3. Enable **App Groups**, click **Configure**, and add **group.com.beautonomi.partner.onesignal**. Save.
4. In **Profiles**, delete the Distribution profile for that extension (so EAS can create a new one), then run again:

   ```bash
   cd apps/provider
   eas credentials --platform ios
   ```

   Choose production → **OneSignalNotificationServiceExtension** → **Set up a new Provisioning Profile**.

## 3. Re-run the build

After credentials are set:

```bash
cd apps/provider
eas build --profile production --platform ios --non-interactive
```

Or push to your main branch if you use EAS from CI.

---

## Quick reference

| From | Command |
|------|--------|
| Repo root | `cd apps/provider && eas credentials --platform ios` |
| `apps/provider` | `eas credentials --platform ios` |
| Reminder (Windows) | `./scripts/setup-ios-credentials.ps1` |
| Reminder (any) | `pnpm run ios:credentials-help` |

Full details: [docs/DEPLOYMENT_EAS.md](../../docs/DEPLOYMENT_EAS.md).
