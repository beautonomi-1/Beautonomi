# Provider app – authentication

Every screen under `(app)/*` is behind authentication. There are no unauthenticated app routes.

## Flow

1. **Root**  
   User lands on `index` → if no session, redirect to `/(auth)/login`. If session, check portal (provider/customer/admin) and profile, then redirect to `(app)/(tabs)/dashboard` or `(app)/onboarding`.

2. **App layout** `(app)/_layout.tsx`  
   - If auth is still loading → show "Checking authentication…".  
   - If no session → `<Redirect href="/(auth)/login" />`.  
   - Otherwise render: `AccountStatusGuard` → `RoleGate` → `ProviderProvider` → app content.

3. **RoleGate**  
   Calls `GET /api/me/role`. If role is not `provider_owner` or `provider_staff`, shows "Provider access only" and Sign out. Prevents customer/admin sessions from using the provider app.

4. **AccountStatusGuard**  
   Calls `GET /api/me/account-status`. If suspended or deactivated, signs out and redirects to login with `?suspended=1` or `?deactivated=1`.

5. **Auth routes** `(auth)/*`  
   If user has a session, `(auth)/_layout` redirects to `/` so login/signup are not reachable when logged in.

## API requests

- All requests go through `@/lib/api-client`, which:
  - Uses `getAccessToken()` (Supabase `getUser()` then `getSession()`) so the token is validated/refreshed before each request.
  - On 401: refreshes session, retries once; if still 401 or refresh fails with session error, calls `supabase.auth.signOut()`, so the app layout re-renders and redirects to login.
- Hooks `useApi`, `useApiMutation`, `useApiPost` use this client, so every screen that fetches data is authenticated.

## OAuth callback

- `auth/callback` receives the OAuth redirect, calls `exchangeCodeForSession` or `setSession`, then (on native) waits 50ms before `router.replace("/(app)/(tabs)")` so `AuthProvider`’s `onAuthStateChange` can run and the app layout sees the new session.

## In-app browser (WebView)

- WebView content (e.g. subscription payment, onboarding web) loads the **web app**, which has its own session (cookies). The native app does not inject the Supabase token into the WebView. If the web app requires login, the user may need to sign in there or the web can support token-in-URL for in-app contexts; that is separate from native app auth.

## Verification checklist

- **No session** → Open app or navigate to any (app) route (including via deep link) → must redirect to `/(auth)/login`.
- **Session + wrong role** (e.g. customer) → RoleGate shows "Provider access only" and Sign out.
- **Session + suspended/deactivated** → AccountStatusGuard signs out and redirects to login with query param.
- **OAuth sign-in** → After callback, user lands on (app)/(tabs) without flashing back to login.
- **401 from API** (e.g. token revoked) → Next request refreshes then retries; if still 401, sign out and redirect to login.
- **Logged in and opening /login** → (auth) layout redirects to `/`.
