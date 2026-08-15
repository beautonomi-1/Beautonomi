# OAuth / Social Login (Google & Apple)

This doc describes how signup and login via **Google** and **Sign in with Apple** work on **web** and the **customer app**, how **profile** (name, avatar, email) is handled, and what to configure in Supabase and Apple/Google consoles. **Facebook** is not used for auth in the product UI.

---

## 1. Where it appears

| Surface | Google | Apple |
|--------|--------|--------|
| Web `/login` | ✅ | ✅ |
| Web login modal, inline signup, booking gate (`BeautonomiGateModal`) | ✅ | ✅ |
| Customer app login | ✅ | ✅ (iOS: native Sign in with Apple; Android / Expo web: in-app browser OAuth) |
| Customer app signup | ✅ | ✅ (same) |
| Provider app login | ✅ | ✅ (same) |

**Web implementation:** `signInWithOAuth(provider, redirectUrl?)` in `apps/web/src/lib/supabase/auth.ts`. Google-only `queryParams` (`access_type`, `prompt`) are **not** sent for Apple. Apple requests `scopes: 'name email'` so Supabase can populate metadata where Apple provides it.

**Native implementation:** `signInWithOAuth(provider)` in `apps/customer/src/providers/AuthProvider.tsx` and `apps/provider/src/providers/AuthProvider.tsx`. **Apple on iOS** uses native `expo-apple-authentication` + `supabase.auth.signInWithIdToken` (`tryNativeAppleSignIn`). Google, and Apple on Android/web, use Supabase `signInWithOAuth` + `skipBrowserRedirect: true` + `WebBrowser.openAuthSessionAsync(..., { preferEphemeralSession: true })`.

---

## 2. Supabase & provider setup

### Google

- Supabase → Authentication → Providers → **Google**: Client ID + secret from Google Cloud (OAuth **Web** client).
- Google Cloud → **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`.

### Apple

- Supabase → Authentication → Providers → **Apple**: Services ID, secret (JWT from `.p8` key), Key ID, Team ID, etc. Follow [Supabase: Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple).
- Apple Developer → Services ID → **Return URLs**: same Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`.
- App ID → enable **Sign in with Apple** for native bundle IDs; add bundle IDs (and Expo Go `host.exp.Exponent` if needed) to Supabase Apple **Client IDs** list per Supabase docs.
- Expo injects `com.apple.developer.applesignin: ["Default"]` at EAS compile time from `ios.entitlements` **and** the `expo-apple-authentication` config plugin (`usesAppleSignIn: true` alone does not write the entitlement in SDK 54). After adding it, regenerate the iOS provisioning profile so it includes Sign in with Apple.

### Redirect allowlist (Supabase)

Under **Authentication → URL configuration**, add every `redirectTo` your apps use: web `https://…/auth/callback`, staging/local URLs, and native deep links from `AuthSession.makeRedirectUri({ path: "auth/callback" })`.

---

## 3. Profile handling

After OAuth, Supabase fills **auth.users** `user_metadata` (name, email, `avatar_url` / `picture`, etc.). Apple often omits name on later sign-ins; the **web** `/auth/callback` route and **`handle_new_user`** trigger still sync **`public.users`**. The customer app shows metadata + profile-completion API with fallbacks for nested `picture.data.url` when present.

---

## 4. Checklist

| Item | Web | Customer app |
|------|-----|--------------|
| Google OAuth | ✅ | ✅ |
| Apple OAuth | ✅ | ✅ iOS native ID token; Android + Expo web browser OAuth |
| Callback / tokens | `/auth/callback` + PKCE on web | iOS Apple: `signInWithIdToken`. Else in-app browser → `setSession` / `exchangeCodeForSession` |

---

## 5. Summary

- Enable **Google** and **Apple** in Supabase; configure each provider’s console with the Supabase **callback URL**.
- **Apple on Android / Expo web:** Shown in customer and provider auth UIs; the flow uses Apple’s web OAuth via Supabase (same callback URL). Ensure **Return URLs** and Supabase **Redirect URLs** include every `redirectTo` from dev and prod builds.
- Rotate Apple OAuth client secret on Apple’s schedule (see Supabase Apple docs).
