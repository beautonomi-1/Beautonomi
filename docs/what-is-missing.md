# What is missing – support tickets, account flows, provider app

Gaps and suggested next steps based on current implementation.

---

## 1. Support tickets (user / provider side)

| Gap | Impact | Suggested fix |
|-----|--------|----------------|
| **No "My tickets" page** | Users (and providers) can submit a ticket but cannot see their list of tickets or track status. | Add a page (e.g. `/help/my-tickets` or under account-settings) that calls `GET /api/me/support-tickets` and lists tickets with subject, status, ticket number, date. |
| **Ticket number not in list API** | `GET /api/me/support-tickets` does not select `ticket_number`, so a My tickets UI couldn’t show it. | Add `ticket_number` to the select in `GET /api/me/support-tickets`. |
| **Ticket number not shown after submit** | After submitting at `/help/submit-ticket`, the user only sees a generic toast and is redirected to `/help`. They get the ticket number only by email. | Use the POST response: show the ticket number in the success message (e.g. toast or inline) before redirecting, e.g. "Ticket created: TKT-20250226-000001". |
| **Users cannot reply to their ticket** | Only admin can add messages via `POST /api/admin/support-tickets/[id]/messages`. Users have no way to add a follow-up message. | Add `POST /api/me/support-tickets/[id]/messages` (auth = ticket owner, body: `{ message }`, insert into `support_ticket_messages` with `is_internal: false`). Then add a ticket detail page for the user (or expand My tickets) to view thread and reply. |

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

## 5. Summary

- **Support tickets:** Add ticket number to GET list, show it after submit, add "My tickets" page and user reply API (+ optional in-app list for providers).
- **Account:** Implement self-service reactivation (e.g. `deactivated_by` + clear on login, or reactivate link).
- **Provider web:** Optional Help/Support in nav; provider app: optional My tickets screen.

These are the main missing pieces for a complete support-ticket and account lifecycle experience.
