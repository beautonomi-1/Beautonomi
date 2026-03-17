# Gaps and improvements

Consolidated gaps and suggested next steps from support tickets, account flows, and post-audit recommendations (customer app audit, provider app audit, booking flow audit).

---

## 1. Support tickets (user / provider side)

**Implemented (API):** `GET /api/me/support-tickets` now selects `ticket_number`. `POST /api/me/support-tickets/[id]/messages` exists so users can reply to their own tickets. A "My tickets" UI (page or in-app screen) can call these endpoints.

| Gap | Impact | Suggested fix | Status |
|-----|--------|----------------|--------|
| **No "My tickets" page** | Users (and providers) can submit a ticket but may not have a dedicated list/detail UI to see tickets or track status. | Add a page (e.g. `/help/my-tickets` or under account-settings) that calls `GET /api/me/support-tickets` and lists tickets with subject, status, ticket number, date. | API ready; UI optional. |
| **Ticket number not in list API** | — | — | **Done.** `GET /api/me/support-tickets` includes `ticket_number`. |
| **Ticket number not shown after submit** | After submitting at `/help/submit-ticket`, the user may only see a generic toast and redirect. | Use the POST response: show the ticket number in the success message (e.g. toast or inline) before redirecting. | Optional UX improvement. |
| **Users cannot reply to their ticket** | — | — | **Done.** `POST /api/me/support-tickets/[id]/messages` exists (auth = ticket owner, body: `{ message }`). Add ticket detail UI to view thread and reply. |

---

## 2. Support tickets (provider app)

| Gap | Impact | Suggested fix |
|-----|--------|----------------|
| **No "My tickets" in app** | Provider can open "Contact support" (web) to submit but cannot see their tickets or reply in the app. | Either: (a) add an in-app "My support tickets" screen that calls `GET /api/me/support-tickets` and links to web for detail/reply, or (b) add a full in-app flow (list + detail + reply via new user message API). |

---

## 3. Account deactivation / reactivation

| Gap | Impact | Suggested fix |
|-----|--------|----------------|
| **Self-service "reactivate by logging in" not effective** | When a user self-deactivates, only `deactivated_at` is set (auth user is not banned). On next login, AccountStatusGuard sees `is_deactivated` and signs them out, so they never get back in. | Option A: Add `deactivated_by` (`'user' \| 'admin'`). On successful login, if `deactivated_by === 'user'`, clear `deactivated_at` (and optionally `deactivation_reason`) so the user is reactivated. Option B: Provide a separate "Reactivate account" link (e.g. in email) that calls an API to clear `deactivated_at` for that user. |

---

## 4. Other small gaps

| Area | Gap | Suggested fix |
|------|-----|----------------|
| **Help / support entry for provider (web)** | Provider portal has a "Contact support" on account/profile page; no central "Help" or "Support" in main nav/sidebar. | Add a "Help" or "Support" link in provider sidebar/header that goes to `/help` or `/help/submit-ticket`. |
| **support_agent role** | Admin support-tickets API allows `support_agent`; RLS in migration 110 only mentions superadmin. Migration 112 was noted for support_agent. | Confirm migration 112 (or equivalent) adds `support_agent` to RLS so support agents can access tickets if you use that role. |

---

## 5. Customer app suggestions (post-audit)

| Area | Suggestion | Effort |
|------|------------|--------|
| **Offline** | **Done (customer).** useBookings and useCart cache last successful payload in AsyncStorage; on request failure they show cached data and set `fromCache` so UI can show "Showing saved data" if desired. Provider can add the same pattern (e.g. cacheKey option in useApi). | — |
| **Error helper rollout** | **Done.** `getApiErrorMessage()` used in gift-card, on-demand/waiting, chats, notifications, personal-info, messages, search, addresses, product-detail, cart, book, book-checkout, membership, and hooks (useCart, useBookings, useProductOrders). | — |
| **Deep link / reschedule** | If the backend adds a dedicated reschedule API (replace booking in one call), mobile could call it instead of "re-book then cancel old" for a simpler flow. | Low (backend-dependent) |
| **Accessibility** | **Done (main flows).** Complete booking, Cancel booking, Place order, Request now, and Download/Share invoice have accessibilityLabel and/or accessibilityHint; key CTAs use accessibilityRole="button" and accessibilityState where relevant. | — |
| **Tests** | Add a few integration or E2E tests for critical paths (login → home, book → checkout → consume, cart → order). Customer app has minimal test coverage today. | Medium |

---

## 6. Provider app suggestions (post-audit)

| Area | Suggestion | Effort |
|------|------------|--------|
| **Error handling** | Introduce a shared helper (like customer's `getApiErrorMessage`) and use it for API errors and catch blocks so alerts/toasts show consistent, user-friendly messages. | Low |
| **Offline** | OfflineBar exists; consider caching last payload for dashboard, bookings list, and client list for offline read. | Medium |
| **Loading / timeouts** | Add timeouts or "Retry" on heavy screens (e.g. reports, dashboard when slow) so users aren't left on a spinner indefinitely. | Low |
| **Invoice download (native)** | **Done.** Download/Share use authenticated flow: FileSystem.downloadAsync with Bearer token, then Share.share with the local file URI. Web still opens URL in browser. | — |

---

## 7. Cross-cutting / platform

| Area | Suggestion | Effort |
|------|------------|--------|
| **Analytics** | Customer app uses screen tracking and some payment events; consider standardising event names and adding key conversion events (booking completed, order placed, signup completed) for funnels. | Low |
| **Feature flags** | If you need to roll out or kill features by segment or region, consider a small feature-flag layer (e.g. from config-bundle or a dedicated API) so mobile and web stay in sync. | Medium |
| **Staging / envs** | Ensure APP_URL and API base URLs are clearly set per build (dev/staging/prod) and that deep links and OAuth redirects point to the right app variant. | Low (likely done) |
| **Security** | Keep tokens in secure storage (already using Supabase auth storage); avoid logging PII or tokens. No sensitive data in error messages sent to Sentry (scrub if needed). | Low (review) |

---

## 8. Docs and process

| Area | Suggestion | Effort |
|------|------------|--------|
| **Runbooks** | Add a short runbook for "customer app won't load after login" (portal/profile-completion, APP_URL, auth) and "booking hold fails" (availability, hold API, network). | Low |
| **Release notes** | When shipping booking or checkout changes, note them in release notes and call out any API or deep-link changes for support. | Low |

---

## 9. Summary

- **Support tickets:** Add ticket number to GET list, show it after submit, add "My tickets" page and user reply API (+ optional in-app list for providers).
- **Account:** Implement self-service reactivation (e.g. `deactivated_by` + clear on login, or reactivate link).
- **Provider web:** Optional Help/Support in nav; provider app: optional My tickets screen.
- **Quick wins / done:** Customer error helper rollout, provider error helper, provider loading timeouts, offline caching (customer), provider invoice auth + share, accessibility on primary flows.
- **Backend-dependent:** Reschedule API, feature flags, any new booking/checkout fields.
- **Quality / ops:** Tests, analytics consistency, runbooks, release notes.
