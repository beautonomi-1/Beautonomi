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
| **Provider app** | Payment, onboarding, invoices, verification, express-booking, packages open in the **in-app browser** (WebView) at `(app)/(tabs)/more/in-app-browser` so the user stays in the app and stays authenticated. Subscription payment success page sends `postMessage` → auto-return to native subscription screen. |
| **Customer app** | Payment and web cart are opened in the **in-app browser** (`(app)/in-app-browser`). Redirect lands on the web success page inside the WebView. The success page sends a `postMessage` so the app **automatically** closes the WebView and navigates (e.g. to product-orders, booking-detail, custom-requests, or profile). |

So for payment, “native” means: **never leave the app**. **Provider app**: in-app WebView for payment and other web flows; user stays authenticated. **Customer app**: in-app WebView; redirect is a web URL inside the WebView, then auto-return to native.

- **Provider app** uses **in-app WebView** (`(app)/(tabs)/more/in-app-browser`) for subscription payment, onboarding, setup-status http links, billing invoices, verification, express-booking, and packages. **Web-only features** open via `(app)/(tabs)/more/portal?path=...&title=...`, which redirects to the in-app browser: Finance (VAT reports, team totals, my earnings), Reports, Settings (calendar links, display prefs, receipt sequencing, ads, marketing-integrations), Forms create, and Automations create are native screens; no portal for these. Other flows (payment, invoices, verification, packages) use WebView when needed. See [PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md).

- **Customer app** uses `(app)/in-app-browser` for product checkout payment, custom-request payment, web cart, contact (“Give us feedback”), and become-a-provider (profile + account-settings). The web checkout success page sends `postMessage` so the app auto-closes the WebView and navigates. The success page also has an “Open in app” link using **`customer://`** deep links; the customer app handles these in `(app)/_layout.tsx` (e.g. `customer://booking-detail?id=...`, `customer://account-settings/custom-requests`, `customer://profile`, `customer://bookings`, `customer://product-orders`).

**Provider app (in-app WebView):** Payment opens in the in-app browser. When in_app=1, the web success page sends postMessage so the WebView closes and the app navigates to the native subscription screen automatically. Optional: if the web success page is opened from a “Return to app” link, the app can handle `provider://subscription/success` to navigate to the native subscription screen.

---

## Provider subscription: upgrade, renew, cancel

| Action | Web | Provider app |
|--------|-----|--------------|
| **Cancel** | `POST /api/provider/subscription/cancel` → toast, reload. | Same API → `refresh()`, alert on success/error. |
| **Renew** | `POST …/renew` → redirect to `payment_url` (Paystack). Callback: `/provider/subscription?payment_success=true`. | Same API with `in_app: true` → open `payment_url` in **in-app browser** → success page postMessage → auto-return to native subscription screen. |
| **Upgrade** | `POST …/upgrade`; if `requires_payment` then `POST …/initialize-payment` → redirect to `payment_url`. Callback: `/provider/subscription?payment_success=true`. | `POST …/initialize-payment` with `plan_id`, `billing_period`, `in_app: true` → open URL in **in-app browser** → auto-return on success. |

Cancel works the same on both. Renew and upgrade on the app use the in-app WebView so the user stays authenticated.

---

## Summary

- **Auth redirect**: Web uses web auth callback; apps use **native** redirect URI and must handle the OAuth code in the **native** auth callback screen so the user ends up in the app, not on the web.
- **Payment redirect**: Always to a **web** URL (Paystack limitation). **Provider app**: payment and other web flows open in **in-app WebView** so the user stays in the app and authenticated; subscription success uses **postMessage** to auto-return. **Customer app**: payment in **in-app WebView**, success page uses **postMessage** to auto-close and navigate. Deep links (`provider://subscription/success`, `customer://...`) are fallbacks or when opening from external browser.

---

## Verification (quick checks)

- **Provider app**: Native screens for all list/detail/settings; subscription payment, onboarding, setup links, invoices, verification, express-booking, packages open in **in-app browser** (WebView). Subscription → Renew or Upgrade → pay in WebView → auto-return to subscription screen via postMessage. Cancel → success and refresh.
- **Customer app**: Product checkout or custom-request payment in app → pay in WebView → should auto-return to product-orders / custom-requests / booking-detail / profile. From success page in WebView, tap “Open in app” → should navigate (WebView intercepts `customer://` and opens via Linking). From success page in Safari/Chrome, tap “Open in app” → app opens and navigates to the right screen.
- **Web**: Provider subscription renew/upgrade/cancel; customer checkout success and “Open in app” link (opens app if installed).

---

## See also

- **[APP_SCREENS_API_WIRING.md](./APP_SCREENS_API_WIRING.md)** – Which app screens call which backend APIs (useApi / api.*) for data loading and redirect logic.
- **[PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md)** – Provider mobile vs web: which features are native, which open in portal (in-app browser).
