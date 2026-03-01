# Google Play & App Store compliance – Provider app

This checklist covers what’s required (or recommended) for the **provider** Expo app to comply with **Google Play** and **Apple App Store** when submitting or updating the app.

---

## In-app (already implemented)

| Requirement | Status | Where |
|-------------|--------|--------|
| **Privacy Policy** link | ✅ | Settings → Account → Privacy Policy (opens web). Signup: “Privacy Policy” link. Login: Privacy Policy for phone OTP. |
| **Terms of Service** link | ✅ | Settings → Account → Terms of Service (opens web). Signup: “Terms of Service” link. |
| **Account deactivation** | ✅ | Settings → Account → Deactivate account (in-app screen, password + optional reason, calls `POST /api/me/deactivate`). Destructive styling. See [Account deactivation and deletion](../account-deactivation-and-deletion.md) for super admin and platform behaviour. |
| **Account deletion** | ✅ | Settings → Account → Delete account (opens web `/account-settings/privacy-and-sharing` where user can request permanent deletion). Destructive styling. |
| **Sign in with Apple** | ✅ | Offered alongside Google/email/phone (Apple requires this if you offer other third-party sign-in). |
| **Email verification** | ✅ | Banner when unverified, resend, auth callback for confirmation links. |

---

## App Store Connect (Apple)

- **Privacy Policy URL**  
  Set in App Store Connect → App Information. Use your live site, e.g. `https://beautonomi.com/privacy-policy`.

- **Terms of Use / EULA**  
  Optional but recommended. Use e.g. `https://beautonomi.com/terms-and-condition` or a dedicated EULA page.

- **App Privacy (nutrition label)**  
  Declare data collection and usage (identifiers, usage data, etc.) in App Store Connect → App Privacy. Align with your Privacy Policy.

- **Sign in with Apple**  
  Already in the app; ensure the capability is enabled in the Apple Developer account and in the app’s entitlements (Expo/EAS handles this when using the Apple sign-in config).

- **Account deletion**  
  Apple expects users to be able to find account deletion. The provider app exposes “Delete account” in Settings → Account (opens web flow). Optionally mention in App Review notes: “Account deletion: Settings → Account → Delete account (opens web).”

---

## Google Play Console

- **Privacy Policy**  
  Required. Set in Play Console → Policy → App content → Privacy policy. Same URL as above.

- **Data safety**  
  Complete the Data safety form: what data is collected (e.g. email, name, phone, location if used), whether it’s shared, and whether users can request deletion. Align with your Privacy Policy.

- **App access**  
  If the app is restricted (e.g. providers only), provide test credentials or instructions in the “App access” section.

- **Account deletion**  
  Google requires that users can request account/data deletion. The app offers “Delete account” in Settings → Account (web flow). You can add a note in “App content” if asked.

---

## Expo / EAS configuration

- **app.json / app.config.js**  
  No mandatory Expo field for store privacy URL; store URLs are set in App Store Connect and Play Console. You can add a comment or `extra` in app.config for reference, e.g.  
  `privacyPolicyUrl: "https://beautonomi.com/privacy-policy"`.

- **EAS Submit / EAS Metadata**  
  When using EAS Submit, set store-specific metadata (description, keywords, etc.) in `eas.json` or EAS Metadata. Privacy policy URL is still configured in each store’s console.

- **Version and build**  
  Bump `version` in app.json for each release; use `ios.buildNumber` and `android.versionCode` as required by the stores.

---

## Optional but recommended

- **In-app “Data we collect”**  
  Short section in Settings or a link to a dedicated page that summarises data collection (and points to the full Privacy Policy).

- **Cookie / tracking consent**  
  If the app or linked web views use tracking/cookies, ensure consent flow and disclosure in the Privacy Policy and, if needed, in-app.

- **Accessibility**  
  Ensure labels and contrast meet store expectations; test with VoiceOver / TalkBack.

---

## Summary

- **In-app:** Privacy & Terms links (signup + settings), Deactivate account (in-app), Delete account (web), Sign in with Apple, email verification – all in place.
- **Apple:** Set Privacy Policy (and optionally Terms) URL in App Store Connect; fill App Privacy; note account deletion path for App Review if needed.
- **Google:** Set Privacy Policy in Play Console; complete Data safety; provide test access if required.
- **Expo/EAS:** Use app versioning and EAS metadata as needed; store URLs are configured in each store’s console.
