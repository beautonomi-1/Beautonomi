# App screens – API wiring reference

Screens that were wired to backend APIs (useApi or api.*) so they load or persist data via the Next.js API. Auth screens use Supabase directly; WebView-only screens are omitted.

## Provider app (`apps/provider`)

| Screen | API | Purpose |
|--------|-----|---------|
| `app/index.tsx` | `GET /api/me/portal`, `GET /api/provider/profile` | Portal check (redirect wrong app); profile exists → dashboard, else → onboarding |
| `(app)/search.tsx` | `GET /api/provider/search?q=&limit=` | Global search: clients, appointments, services |
| `(app)/(tabs)/settings.tsx` | `GET /api/provider/profile` | Business name, phone, email; "More settings" link |
| `(app)/(tabs)/more/delete-account-info.tsx` | `GET /api/me/account-status` | Deactivated/suspended state; "Open web to delete" |
| `(app)/(tabs)/more/upgrade-info.tsx` | `GET /api/provider/subscription` | Current plan; "Open web to upgrade" |
| `(app)/(tabs)/more/settings/index.tsx` | `GET /api/provider/setup-status` | Setup % banner when incomplete |
| `(app)/(tabs)/more/reports/index.tsx` | `GET /api/provider/analytics` | This-month revenue & bookings summary |
| `(app)/(tabs)/more/[slug].tsx` | `GET /api/provider/setup-status` | Setup % banner when incomplete |
| `(app)/(tabs)/more/settings-web.tsx` | `GET /api/provider/profile` | Business name in copy |
| `(app)/(tabs)/more/portal.tsx` | `GET /api/provider/profile` | Business name as default WebView title when no `title` param |

Other provider screens (bookings, messaging, catalogue, etc.) already used `useApi` or `api.*` before this pass.

## Customer app (`apps/customer`)

| Screen | API | Purpose |
|--------|-----|---------|
| `app/index.tsx` | `GET /api/me/portal`, `GET /api/me/profile-completion` | Portal check (redirect wrong app); required profile incomplete → personal-info, else → home |
| `(app)/account-settings/index.tsx` | `GET /api/me/profile-completion` | Profile completion % banner when &lt; 100% (uses `percentage` from API) |
| `(app)/account-settings/language.tsx` | `GET /api/me/preferences`, `POST /api/me/preferences` | Load/sync language from server; save on change |
| `(app)/on-demand/result.tsx` | `GET /api/me/on-demand/requests/[id]` | Provider name, booking_id; "View booking" when accepted |

Customer also has a new `useApi` hook at `src/hooks/useApi.ts` for consistent data fetching. Other customer screens use existing hooks (e.g. `useBookings`, `useCart`, `useProductOrders`, `useHomeData`) that call the API.

## Not wired (by design)

- **Auth**: login, signup, forgot-password, terms, privacy – Supabase auth / static content.
- **Redirects**: e.g. `(app)/chat/[id]` → messaging; `(app)/(tabs)/more/clients/index.tsx` → clients tab.
- **WebView-only**: in-app-browser, help, about (load web URLs).
- **Re-exports / hubs**: chats tab re-exports messaging; some hubs only render children that already use API.

---

## See also

- **[REDIRECTS_BY_PLATFORM.md](./REDIRECTS_BY_PLATFORM.md)** – Auth, payment, and in-app WebView redirect behaviour by platform.
- **[PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md)** – Feature parity gap between provider mobile app and provider web (Next.js).
