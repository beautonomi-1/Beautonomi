# Suggested improvements (post-audit)

**Source:** Customer app audit, Provider app audit, booking flow audit, and a quick pass over both apps.  
**Status:** Recommendations only; no critical bugs. Prior work already addressed profile-completion gate (customer), error handling (customer), and billing download URL (provider).

---

## 1. Customer app

| Area | Suggestion | Effort |
|------|------------|--------|
| **Offline** | **Done (customer).** useBookings and useCart cache last successful payload in AsyncStorage; on request failure they show cached data and set `fromCache` so UI can show "Showing saved data" if desired. Provider can add the same pattern (e.g. cacheKey option in useApi). | — |
| **Error helper rollout** | **Done.** `getApiErrorMessage()` used in gift-card, on-demand/waiting, chats, notifications, personal-info, messages, search, addresses, product-detail, cart, book, book-checkout, membership, and hooks (useCart, useBookings, useProductOrders). | — |
| **Deep link / reschedule** | If the backend adds a dedicated reschedule API (replace booking in one call), mobile could call it instead of “re-book then cancel old” for a simpler flow. | Low (backend-dependent) |
| **Accessibility** | **Done (main flows).** Complete booking, Cancel booking, Place order, Request now, and Download/Share invoice have accessibilityLabel and/or accessibilityHint; key CTAs use accessibilityRole="button" and accessibilityState where relevant. | — |
| **Tests** | Add a few integration or E2E tests for critical paths (login → home, book → checkout → consume, cart → order). Customer app has minimal test coverage today. | Medium |

---

## 2. Provider app

| Area | Suggestion | Effort |
|------|------------|--------|
| **Error handling** | Introduce a shared helper (like customer’s `getApiErrorMessage`) and use it for API errors and catch blocks so alerts/toasts show consistent, user-friendly messages. | Low |
| **Offline** | OfflineBar exists; consider caching last payload for dashboard, bookings list, and client list for offline read. | Medium |
| **Loading / timeouts** | Add timeouts or “Retry” on heavy screens (e.g. reports, dashboard when slow) so users aren’t left on a spinner indefinitely. | Low |
| **Invoice download (native)** | **Done.** Download/Share use authenticated flow: FileSystem.downloadAsync with Bearer token, then Share.share with the local file URI. Web still opens URL in browser. | — |

---

## 3. Cross-cutting / platform

| Area | Suggestion | Effort |
|------|------------|--------|
| **Analytics** | Customer app uses screen tracking and some payment events; consider standardising event names and adding key conversion events (booking completed, order placed, signup completed) for funnels. | Low |
| **Feature flags** | If you need to roll out or kill features by segment or region, consider a small feature-flag layer (e.g. from config-bundle or a dedicated API) so mobile and web stay in sync. | Medium |
| **Staging / envs** | Ensure APP_URL and API base URLs are clearly set per build (dev/staging/prod) and that deep links and OAuth redirects point to the right app variant. | Low (likely done) |
| **Security** | Keep tokens in secure storage (already using Supabase auth storage); avoid logging PII or tokens. No sensitive data in error messages sent to Sentry (scrub if needed). | Low (review) |

---

## 4. Docs and process

| Area | Suggestion | Effort |
|------|------------|--------|
| **Runbooks** | Add a short runbook for “customer app won’t load after login” (portal/profile-completion, APP_URL, auth) and “booking hold fails” (availability, hold API, network). | Low |
| **Release notes** | When shipping booking or checkout changes, note them in release notes and call out any API or deep-link changes for support. | Low |

---

## 5. Priority overview

- **Quick wins:** **Done.** Customer error helper rollout, provider error helper, provider loading timeouts.
- **User impact:** **Done.** Offline caching (customer bookings + cart), provider invoice auth + share, accessibility on primary flows.
- **Backend-dependent:** Reschedule API, feature flags, any new booking/checkout fields.
- **Quality / ops:** Tests, analytics consistency, runbooks, release notes.

You can tackle these in any order; the audits already confirm that core flows and APIs are correct and aligned with web.
