# Redirects by platform (native-first)

Each platform should keep the user in its own experience: **web → web**, **provider app → provider app**, **customer app → customer app**.

---

## Auth (login / OAuth)

| Platform | Redirect URL | Handler | After success |
|----------|--------------|---------|----------------|
| **Web** | `{APP_URL}/auth/callback` (or same-origin `/auth/callback`) | `apps/web/src/app/auth/callback/route.ts` | Redirect by role: provider → `/provider/dashboard`, customer → `/bookings`, admin → `/admin/dashboard`, or `?next=...`. |
| **Provider app** | `AuthSession.makeRedirectUri({ path: "auth/callback" })` (native deep link) | `apps/provider/app/auth/callback.tsx` | Native: exchange code from URL params → `router.replace("/(app)/(tabs)")` (onboarding or dashboard). |
| **Customer app** | Same pattern (native deep link) | `apps/customer/app/auth/callback.tsx` | Native: exchange code from URL params → `router.replace("/(app)/(tabs)/home")`. |

- **Web**: OAuth redirect goes to the Next.js auth callback route; it sets the session and redirects to the right web page.
- **Apps**: OAuth redirect opens the app at `auth/callback` with `code` (and optional `error`) in the URL. The callback screen must **on native** read those params, call `exchangeCodeForSession(code)`, then navigate into the app (tabs). If it doesn’t, the user is sent back to login and the session is never set.

---

## Payment (Paystack)

Paystack only supports **one callback URL per request** (we set it server-side). So the **redirect is always to the web app** (e.g. `{APP_URL}/provider/subscription?payment_success=true` or `{APP_URL}/checkout/success`).

| Platform | How it stays “native” |
|----------|------------------------|
| **Web** | User stays on the same site; redirect is a normal navigation to the success page. |
| **Provider app** | **Paid ads** and **subscription** use `WebBrowser.openAuthSessionAsync` against Paystack; the auth session resolves on the HTTPS bridge (`/provider/settings/ads/payment-return` or `/provider/subscription`). After verify, native screens show success (`ads-payment-success`, subscription). If the session does not auto-close (3DS / external browser), the bridge shows **Return to app** via `provider://settings/ads-payment-return` or `provider://subscription/success`. Other web flows (onboarding, invoices, verification, packages) still use the **in-app WebView** at `(app)/(tabs)/more/in-app-browser`. |
| **Customer app** | Booking/shop checkout use `openAuthSessionAsync` or the **in-app WebView** (`(app)/in-app-browser`). Redirect lands on a web success page; `postMessage` or deep links (`customer://`) return to native. |

So for payment, “native” means: **never leave the app**. **Provider app**: Paystack via auth session for ads/subscription (HTTPS bridge + `provider://` fallback); WebView for other authenticated web flows. **Customer app**: auth session or in-app WebView; web success page uses **postMessage** and **`customer://`** deep links.

- **Provider app** uses native Paystack auth sessions for **ads** (`apps/provider/.../settings/ads.tsx`) and **subscription** (`subscription.tsx`), with shared helpers in `apps/provider/src/lib/payments/providerPaystackReturn.ts`. The HTTPS bridge pages verify with Paystack server-side before showing success. **In-app WebView** (`(app)/(tabs)/more/in-app-browser`) remains for onboarding, setup-status links, billing invoice PDFs, verification, express-booking, and packages. **Web-only features** open via portal → in-app browser. Native screens include Ads, Marketing, Reports, Settings hubs. See [PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md).

- **Customer app** uses `(app)/in-app-browser` and `openAuthSessionAsync` for checkout. The web checkout success page sends `postMessage` and offers **`customer://`** deep links; handled in `(app)/_layout.tsx`.

**Provider app return fallbacks:** Ads bridge (`/provider/settings/ads/payment-return?context=app`) → `provider://settings/ads-payment-return`. Subscription (`/provider/subscription?in_app=1`) → `provider://subscription/success` or postMessage to in-app WebView when that path is used.

---

## Provider subscription: upgrade, renew, cancel

| Action | Web | Provider app |
|--------|-----|--------------|
| **Cancel** | `POST /api/provider/subscription/cancel` → toast, reload. | Same API → `refresh()`, alert on success/error. |
| **Renew** | `POST …/renew` → redirect to `payment_url` (Paystack). Callback: `/provider/subscription?payment_success=true`. | Same API with `in_app: true` → `openAuthSessionAsync` → HTTPS bridge → native subscription screen (or `provider://subscription/success` fallback). |
| **Upgrade** | `POST …/upgrade`; if `requires_payment` then `POST …/initialize-payment` → redirect to `payment_url`. Callback: `/provider/subscription?payment_success=true`. | `POST …/initialize-payment` with `plan_id`, `billing_period`, `in_app: true` → auth session → auto-return on success. |

Cancel works the same on both. Renew and upgrade on the app use the in-app WebView so the user stays authenticated.

---

## Summary

- **Auth redirect**: Web uses web auth callback; apps use **native** redirect URI and must handle the OAuth code in the **native** auth callback screen so the user ends up in the app, not on the web.
- **Payment redirect**: Always to a **web** URL (Paystack limitation). **Provider app**: ads/subscription use **auth session** + HTTPS bridge + `provider://` fallback; other flows use **in-app WebView**. **Customer app**: auth session or in-app WebView; success page uses **postMessage** and **`customer://`** deep links.

---

## Verification (quick checks)

- **Provider app**: Native Ads screen → buy boost → review sheet → Paystack auth session → verify → `ads-payment-success` (or bridge **Return to app**). Subscription → Renew/Upgrade → auth session → native subscription screen. Onboarding/invoices still use in-app browser.
- **Customer app**: Product checkout or custom-request payment in app → pay in WebView → should auto-return to product-orders / custom-requests / booking-detail / profile. From success page in WebView, tap “Open in app” → should navigate (WebView intercepts `customer://` and opens via Linking). From success page in Safari/Chrome, tap “Open in app” → app opens and navigates to the right screen.
- **Web**: Provider subscription renew/upgrade/cancel; customer checkout success and “Open in app” link (opens app if installed).

---

## See also

- **[APP_SCREENS_API_WIRING.md](./APP_SCREENS_API_WIRING.md)** – Which app screens call which backend APIs (useApi / api.*) for data loading and redirect logic.
- **[PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md)** – Provider mobile vs web: which features are native, which open in portal (in-app browser).
