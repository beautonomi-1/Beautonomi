# Support tickets – how it works

How support tickets work for **super admin**, **providers**, and **customers**, how marketplace context is captured, how CSAT is measured, and how **ticket numbers** are created.

---

## 1. Ticket number

- **Format:** `TKT-YYYYMMDD-NNNNNN`  
  Example: `TKT-20250226-000001`, `TKT-20250226-000002`, …

- **Where it’s set:** In the database, by a **trigger** on `support_tickets` (migration `110_create_support_tickets.sql`):
  - **Trigger:** `generate_support_ticket_number`, runs **BEFORE INSERT**.
  - **Function:** `generate_ticket_number()`.
  - If `ticket_number` is NULL or empty, it is set to:
    - `'TKT-'`
    - `TO_CHAR(NOW(), 'YYYYMMDD')` (today’s date)
    - `'-'`
    - `LPAD(NEXTVAL('ticket_number_seq')::TEXT, 6, '0')` (6-digit sequence, zero-padded).
  - **Sequence:** `ticket_number_seq` (increments per insert; same day can have many tickets, e.g. 000001, 000002, …).

- **Uniqueness:** `support_tickets.ticket_number` is **UNIQUE NOT NULL**, so every ticket has exactly one human-readable ID. APIs and notifications use `ticket.ticket_number` (or fallback to `ticket.id`).

---

## 2. Super admin

- **Access:** Support tickets are available to **super admin** (and, in the API, to **support_agent** if that role is used).
- **UI:**
  - **List:** `/admin/support-tickets`  
    - RoleGuard: `allowedRoles={["superadmin"]}`.  
    - Lists tickets with filters (status, priority), search (ticket number, subject, user email/name, provider name), requester origin, marketplace context, and CSAT score.  
    - Links to ticket detail.
  - **Detail:** `/admin/support-tickets/[id]`  
    - View ticket, requester type, marketplace context, user, provider, messages, attachments, internal notes, and CSAT.  
    - Reply (add message), add notes, update status (e.g. open → in_progress → resolved → closed), and use send-and-resolve actions.
- **APIs (admin):**
  - `GET /api/admin/support-tickets` – list (requires `superadmin` or `support_agent`).
  - `GET /api/admin/support-tickets/[id]` – single ticket.
  - `PATCH /api/admin/support-tickets/[id]` – update status, assignee, etc.
  - `POST /api/admin/support-tickets/[id]/messages` – add reply.
  - `POST /api/admin/support-tickets/[id]/notes` – add internal note.
- **Nav:** Admin nav shows a count for support tickets (from `/api/admin/nav-counts`).

So **support tickets do work on super admin**: they can see, filter, open, reply, add notes, and update status.

---

## 3. How providers can contact support / get help

- **Web (provider portal):**  
  When logged in as a provider on the **web** app, they can go to **Help** and submit a ticket:
  - **Help center:** `/help` (and links like “Submit a Support Ticket”, “Contact support”).
  - **Submit ticket page:** `/help/submit-ticket`  
    - Form: subject, message, priority (low/medium/high), optional category, and related area such as booking, product order, gift card, payment, account, or technical.  
    - Submits to `POST /api/me/support-tickets` (same as for customers).  
    - After submit, they’re redirected to `/help` and get an email (and push if enabled) with confirmation; the ticket number is in the created ticket and in notifications.

- **Provider app (Expo):**  
  In the **provider app**, they can submit and view tickets from More → Support tickets. Provider tickets are marked with `requester_type = 'provider'` and can include booking, product order, payment, provider onboarding, or other context.

So **providers can contact support** by:
1. **Web:** Go to Help → Submit a Support Ticket (`/help/submit-ticket`).
2. **App:** Settings → Account → **Contact support** → opens web `/help/submit-ticket`.

---

## 4. How customers contact support

- **Web:** Same as providers: **Help** → “Submit a Support Ticket” / “Contact support” → `/help/submit-ticket` → `POST /api/me/support-tickets`.
- **Customer app (Expo):** Support tickets are available in the customer app with list/detail views, attachments, polling for support replies, and the same context fields.
- **Account suspended page** and other help CTAs also link to `/help/submit-ticket` where relevant.

---

## 5. Creating a ticket (API and DB)

- **Endpoint:** `POST /api/me/support-tickets`  
  - **Auth:** Any authenticated user (customer or provider).  
  - **Body:** `subject`, `message`, optional `priority` (default `medium`), optional `category`, optional `support_context_type`, optional `support_context_id`, optional `support_context_label`.  
  - **Flow:**
    1. Insert into `support_tickets` with `user_id`, `provider_id` where applicable, `requester_type`, `subject`, `description` (from message), `priority`, `status: 'open'`, `category`, support context fields, and last-message fields.  
       - **Do not** send `ticket_number`; the DB trigger sets it.
    2. Insert first message into `support_ticket_messages` (same text as description).
    3. Call `notifySupportTicketCreated(userId, ticketNumber, subject, ticketId, ["email", "push"])` so the user gets a confirmation with the ticket number.
  - **Response:** Includes the created `ticket` (with `ticket_number`) and the initial message.

- **Table:** `support_tickets` has `user_id` (who opened it), optional `provider_id`, `requester_type` (`customer`, `provider`, or `admin`), support context fields, unread tracking fields, and CSAT fields. The **ticket number is generated only by the trigger** on insert; no application code sets it.

---

## 6. Marketplace context and origin

- **Requester origin:** `requester_type` records whether the ticket came from a customer, provider, or admin-created support case. This lets the admin support desk and reports separate customer pain points from provider operations work.
- **Related area:** `support_context_type` records what the ticket is about:
  - `booking`
  - `product_order`
  - `gift_card`
  - `payment`
  - `provider_onboarding`
  - `account`
  - `technical`
  - `other`
- **Reference label:** `support_context_label` is the human-readable booking number, order reference, product name, payment note, or short context label shown in the admin desk and user ticket lists.
- **Reporting:** Support performance and workload reports group tickets by requester origin and context type so managers can see whether bookings, ecommerce orders, payments, or provider onboarding are driving load.

---

## 7. CSAT and agent effectiveness

- **Where users rate support:** When a ticket is `resolved` or `closed`, customer web, customer mobile, and provider mobile show a rating prompt on the ticket detail. Ticket lists also show “Rate this support experience” until a score is submitted.
- **Endpoint:** `POST /api/me/support-tickets/[id]/csat`
  - **Body:** `score` from 1 to 5 and optional `comment`.
  - **Rules:** Only the ticket owner can rate it, and only after the ticket is resolved or closed.
  - **Attribution:** The submitted score is stored on `support_tickets` with `csat_submitted_at` and `csat_agent_id`, using the assigned support agent at submission time.
- **Admin measurement:** Admin support reports aggregate CSAT over time and attribute ratings to support agents, while still showing requester mix and top context types.

---

## 8. Summary

| Role / question | Answer |
|-----------------|--------|
| Do support tickets work on super admin? | Yes. Super admin (and support_agent in API) can list, open, reply, add notes, update status, see requester origin/context, and review CSAT at `/admin/support-tickets` and `/admin/support-tickets/[id]`. |
| How can provider contact support? | **Web:** Help → Submit a Support Ticket (`/help/submit-ticket`). **App:** More → Support tickets. |
| How are booking/ecommerce/payment queries tracked? | `support_context_type` captures booking, product order, gift card, payment, provider onboarding, account, technical, or other. `support_context_label` stores the readable reference. |
| Where does the customer rate support? | On resolved/closed ticket detail pages in customer web/mobile and provider mobile through `POST /api/me/support-tickets/[id]/csat`. |
| How is ticket number created? | By DB trigger `generate_support_ticket_number` before insert: `TKT-YYYYMMDD-NNNNNN` using sequence `ticket_number_seq`. |
| How would this work end-to-end? | User (provider/customer) submits on web/app with context → `POST /api/me/support-tickets` → trigger sets `ticket_number` → user gets email/push with ticket number → super admin sees origin/context, replies/updates status → user rates the resolved ticket → reports measure CSAT by agent, origin, and support driver. |
