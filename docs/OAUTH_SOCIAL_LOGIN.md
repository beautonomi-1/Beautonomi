# OAuth / Social Login (Google, Apple, Facebook)

This doc describes how signup and login via **Google**, **Apple**, and **Facebook** work on **web** and **customer app**, how **profile** (name, avatar, email) is handled from OAuth, and what must be configured for them to work.

---

## 1. Is Facebook signup/login possible?

**Yes.** The codebase supports Facebook OAuth end-to-end:

- **Web:** `signInWithOAuth('facebook', redirectUrl)` in `apps/web/src/lib/supabase/auth.ts`. Facebook is used on:
  - **Signup page** and **login modal** (inline-signup-form, login-modal): "Continue with Facebook" button.
  - **Login page** (`/login`): "Continue with Facebook" button (added for parity).
  - **Booking gate** (BeautonomiGateModal): Facebook option.
- **Customer app:** `signInWithOAuth('facebook')` in AuthProvider; login screen has "Continue with Facebook".

For Facebook to work in production you must:

1. **Enable the Facebook provider** in Supabase: Dashboard → Authentication → Providers → Facebook → Enable.
2. Create a **Facebook App** at [developers.facebook.com](https://developers.facebook.com), add "Facebook Login" product, and configure:
   - **Valid OAuth Redirect URIs** to include your Supabase project URL, e.g. `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **App ID** and **App Secret** in Supabase Facebook provider settings.

No env vars are needed in the app repo for Facebook; Supabase stores provider credentials.

---

## 2. Profile handling from OAuth

### Where profile data comes from

After a user signs in with Google, Apple, or Facebook, Supabase stores provider data in **auth.users**:

- **user_metadata** (and **raw_user_meta_data**) typically includes: `full_name`, `name`, `first_name`, `last_name`, `avatar_url`, `picture`, `email`, `phone`, etc.  
- **Facebook** often sends `picture` as an object: `{ data: { url: "https://..." } }`.

### Database: `public.users`

- **On signup:** The **`handle_new_user`** trigger (migrations 198, 199, 268) runs on `auth.users` INSERT. It creates or updates a row in **`public.users`** with:
  - **full_name** from `full_name`, `name`, `first_name` + `last_name`, `display_name`, or `preferred_username`
  - **avatar_url** from `avatar_url`, `picture`, `photo`, or `image` (raw value; if provider sends `picture` as object, the trigger may store a string representation, so the callback step below is important)
  - **phone**, **email**, **role**
- **On OAuth callback (web only):** After exchanging the code for a session, **`/auth/callback`** (`apps/web/src/app/auth/callback/route.ts`) updates **`public.users`** again from `data.user.user_metadata`:
  - **full_name** from the same set of name fields
  - **avatar_url** from `avatar_url`, or string `picture`, or **`picture.data.url`** when Facebook sends picture as an object
  - **phone** when present

So:

- **Web:** Profile is synced by both the trigger (on user create) and the auth callback (after OAuth redirect). The callback ensures Facebook’s nested `picture.data.url` is written to `users.avatar_url`.
- **App:** The app does not hit the web `/auth/callback`; it uses in-app browser and gets tokens back. So **`public.users`** is filled by the **trigger** when Supabase creates the auth user. The app then shows profile from **user_metadata** and/or **GET /api/me/profile-completion** (which returns `avatar_url` from `users`). The app profile screen uses `profileData?.avatarUrl ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture` (including `picture.data.url` when present) so the avatar displays even before the next API sync.

### Web

- **Login:** `/login` – email/password + Google, Apple, Facebook. Redirect URL for OAuth is `${origin}/auth/callback?next=...`.
- **Signup:** `/signup` and modals (e.g. login-modal, inline-signup-form) – same three providers.
- **Callback:** `/auth/callback` – exchanges `code` for session, updates **`public.users`** with name/avatar/phone from OAuth metadata (including Facebook `picture.data.url`), then redirects by role or `next`.

### Customer app

- **Login:** AuthProvider `signInWithOAuth(provider)` with `skipBrowserRedirect: true`; opens OAuth URL in **WebBrowser**; on success, parses tokens from redirect URL and calls `setSession` or `exchangeCodeForSession`. Supports **google**, **apple**, **facebook**.
- **Profile:** Displays **full_name** from `user.user_metadata.full_name` or `first_name` + `last_name`; **avatar** from `profileData.avatarUrl` (profile-completion API), then `user_metadata.avatar_url`, then `user_metadata.picture` (string or `picture.data.url`). So OAuth users see name and avatar even when the app didn’t go through the web callback.

---

## 3. Alignment checklist

| Item | Web | Customer app |
|------|-----|--------------|
| Google OAuth | ✅ Login, signup, modals, gate | ✅ Login |
| Apple OAuth | ✅ Login, signup, modals, gate | ✅ Login |
| Facebook OAuth | ✅ Signup, modals, gate; ✅ Login page (parity) | ✅ Login |
| OAuth redirect / callback | ✅ `/auth/callback` exchanges code, syncs profile to `users` | ✅ In-app browser; tokens set via `setSession` / `exchangeCodeForSession` |
| Profile name from OAuth | ✅ Callback + trigger → `users.full_name` | ✅ `user_metadata.full_name` or `first_name` + `last_name` |
| Profile avatar from OAuth | ✅ Callback + trigger; callback handles `picture.data.url` | ✅ profile-completion API + `user_metadata.avatar_url` / `picture` / `picture.data.url` |
| i18n "Continue with Facebook" | ✅ `auth.continueWithFacebook` in en/af/st/zu | ✅ Same copy / locale as needed |

---

## 4. Enabling providers in Supabase

- **Dashboard** → **Authentication** → **Providers**.
- **Google / Apple / Facebook:** Enable and set Client ID and Secret (and Apple Service ID / key as required).  
- **Redirect URL** for the app is the Supabase project callback, e.g. `https://<project-ref>.supabase.co/auth/v1/callback`. For the **customer app** you must add the **custom scheme** (e.g. `com.beautonomi.customer://`) or **deep link** you use as the redirect in the app to Supabase “Redirect URLs” so Supabase accepts the redirect after OAuth.

---

## 5. Summary

- **Facebook signup and login are supported** on both web and app; web login page now includes Facebook for parity with signup and app.
- **Profile from OAuth** is handled by: (1) **handle_new_user** trigger → `public.users`, (2) **web auth callback** → updates `users` again and supports Facebook `picture.data.url`, (3) **app** → shows name/avatar from `user_metadata` and profile-completion API, with fallbacks for `picture` and `picture.data.url`.
- For production, enable each provider (Google, Apple, Facebook) in Supabase and configure the provider’s app and redirect URIs as above.
