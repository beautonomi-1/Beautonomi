# Platform integrations reference

This doc lists each integration, where its config lives, who manages it, and how it interacts with others. Use it to keep Singular, Amplitude, Sentry, Paystack, Mapbox, OneSignal, and Apps (store/Singular links) aligned without conflict.

## Config and ownership

| Integration | Config location | Who edits | Used by |
|-------------|-----------------|-----------|---------|
| **Apps (store / Singular links)** | `platform_settings.settings.apps` (Admin Settings API) | Superadmin (Settings → Apps) | Web download banner, `GET /api/public/apps`; emails/push can use same URLs |
| **Singular SDK** | Not in DB. SDK Key + Secret per app in EAS Secrets (`EXPO_PUBLIC_SINGULAR_SDK_KEY`, secret in EAS only). Link URLs = Apps (above). | Dev/ops (EAS); superadmin (Apps URLs) | Customer app, provider app (init + link handler) |
| **Amplitude** | `platform_settings` + `platform_secrets` | Superadmin (Settings; Integrations → Amplitude) | Web + mobile (existing) |
| **Sentry** | Env (e.g. `EXPO_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`) | Dev/ops | Web (next.config, instrumentation) + customer/provider (lib/sentry.ts) |
| **Paystack** | `platform_secrets` + Settings UI | Superadmin | Web server + client init (existing) |
| **Mapbox** | `platform_settings.settings.mapbox`; access token in `platform_secrets` | Superadmin | `GET /api/public/third-party-config?service=mapbox`, web + mobile |
| **OneSignal / Google** | `platform_settings` | Superadmin | third-party-config, web + mobile |

**Principle:** Singular **link URLs** are the same as **Apps** URLs (no new DB fields). Singular **SDK credentials** stay out of the DB and live in EAS Secrets / env for mobile only.

---

## Singular vs Amplitude

- **Singular:** Attribution, installs, campaign tracking, and **smart links** (open app if installed, else store). Use Singular for “where did this user/install come from?” and for link behaviour.
- **Amplitude:** In-app behaviour and product analytics (screens, bookings, etc.). Use Amplitude for “what did users do inside the app?”.
- **Do not** duplicate “install” or install-attribution events in Amplitude when using Singular for attribution. Keep install/attribution in Singular; keep in-app events in Amplitude.

---

## Apps URLs (store and Singular links)

Store URLs in **Admin → Settings → Apps** (Customer App / Provider App, per platform: iOS App Store URL, Android Download URL, Huawei App Gallery URL) drive:

- The **web download banner** (`DownloadBannerContainer` in apps/web), which fetches links from `GET /api/public/apps`.
- Any **emails or push** that link to “download the app” or “open in app.”

These URLs can be **Singular Link URLs**. When they are:

- **Tap from web/email/push** → Singular redirects to the app if installed, or to the store if not (“open app or store”).
- Superadmin pastes Singular Link URLs from the Singular dashboard into Settings → Apps (App Store URL, Download URL, App Gallery URL). No code change required on web or backend.

---

## Sentry, Paystack, Mapbox, OneSignal

- **Sentry:** Keys in env; web uses next.config and instrumentation; customer/provider use `lib/sentry.ts`. No interaction with Singular/Amplitude beyond sharing the same app.
- **Paystack:** Keys and webhooks in `platform_secrets` and Settings; server and client init unchanged. Links in emails (e.g. post-payment) can use the same Apps (Singular) URLs if you want “open in app” after payment.
- **Mapbox:** Public token from `platform_settings` via third-party-config; mobile can use the same endpoint or env. No overlap with Singular/Amplitude.
- **OneSignal / Google:** Config in `platform_settings`; exposed via third-party-config. Push/email links can use Apps (Singular) URLs for consistent “open app or store” behaviour.

---

## Cache and revalidation

When superadmin saves **Admin → Settings**, the API calls `revalidateTag("platform-settings")`. The following use that tag and will see updated config on the next request:

- `GET /api/public/apps`
- `GET /api/public/third-party-config`

So changes to Apps URLs, Mapbox, Amplitude, OneSignal, and Google propagate without a deploy.

---

## Singular: mobile app env / EAS

**Customer app** and **provider app** each need their own Singular SDK credentials (different key/secret per app):

- `EXPO_PUBLIC_SINGULAR_SDK_KEY` (or via app.config.js `extra`)
- Singular SDK **secret**: use EAS Secrets only; never commit. In dev, optional `.env.local` with placeholder.

See [Singular React Native SDK](https://support.singular.net/hc/en-us/articles/360038415852-React-Native-SDK-Basic-Integration) for setup. After adding the plugin and native rebuild, init runs in each app’s root layout; the Singular Link handler receives `deeplink`, `passthrough`, `isDeferred`, `urlParameters` for routing.

### Singular deep-link routing (mobile)

When a Singular link opens the app, the SDK invokes the link handler with `deeplink` (path) and `urlParameters` (query as `Map`). Each app maps these to an in-app screen and navigates.

**Customer app** (`buildCustomerRoute` in `apps/customer/src/lib/singular.ts`):

| Target screen      | Use `deeplink` path or `urlParameters.screen` | Required params              |
|--------------------|------------------------------------------------|------------------------------|
| Home tab           | `home` or (empty)                             | —                            |
| Cart               | `cart`                                        | —                            |
| Partner profile    | `partner-profile`                             | `slug` or `provider_slug`    |
| Product detail     | `product-detail`                              | `id` or `product_id`         |
| Booking detail     | `booking-detail`                              | `id` or `booking_id`         |
| Book (booking flow)| `book`                                        | `slug` or `provider_slug` (+ optional `service_id`, `duration_minutes`) |
| Notifications      | `notifications`                               | —                            |
| Profile tab        | `profile`                                     | —                            |
| Bookings tab       | `bookings`                                    | —                            |
| Explore tab        | `explore`                                     | —                            |
| Account settings   | `account-settings`                            | —                            |
| Help               | `help`                                        | —                            |
| About              | `about`                                       | —                            |
| Product orders     | `product-orders`                              | —                            |
| Write review       | `review-write`                                | Optional: `id` or `booking_id` |

**Provider app** (`buildProviderRoute` in `apps/provider/src/lib/singular.ts`):

| Target screen        | Use `deeplink` path or `urlParameters.screen` | Required params        |
|----------------------|-----------------------------------------------|------------------------|
| Dashboard (home) tab | `dashboard`, `home`, or (empty)               | —                      |
| Calendar tab         | `calendar`                                    | —                      |
| Clients tab          | `clients`                                     | —                      |
| Chats tab            | `chats`                                       | —                      |
| More tab             | `more`                                        | —                      |
| Notifications        | `notifications`                               | —                      |
| Search               | `search`                                      | —                      |
| Chat (conversation)  | `chat`                                        | `id` or `chat_id`      |
| On-demand incoming   | `on-demand` / `on-demand/incoming`            | `id` or `request_id`   |
| Onboarding           | `onboarding`                                  | —                      |

When creating Singular links in the Singular dashboard, set the path or add query parameters as above so the app opens the correct screen.
