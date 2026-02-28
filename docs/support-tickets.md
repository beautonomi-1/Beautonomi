# Support tickets – how it works

How support tickets work for **super admin**, **providers**, and **customers**, and how **ticket numbers** are created.

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
    - Lists tickets with filters (status, priority), search (ticket number, subject, user email/name, provider name).  
    - Links to ticket detail.
  - **Detail:** `/admin/support-tickets/[id]`  
    - View ticket, user, provider, messages, internal notes.  
    - Reply (add message), add notes, update status (e.g. open → in_progress → resolved → closed).
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
    - Form: subject, message, priority (low/medium/high), optional category.  
    - Submits to `POST /api/me/support-tickets` (same as for customers).  
    - After submit, they’re redirected to `/help` and get an email (and push if enabled) with confirmation; the ticket number is in the created ticket and in notifications.

- **Provider app (Expo):**  
  In the **provider app**, they can open the same flow in the browser:
  - **Settings → Account → Contact support**  
    - Opens the web app at `/help/submit-ticket` (same URL as above).  
    - They must be logged in on the web (same account as in the app) to submit; the API uses the current user and creates the ticket with that `user_id`.

So **providers can contact support** by:
1. **Web:** Go to Help → Submit a Support Ticket (`/help/submit-ticket`).
2. **App:** Settings → Account → **Contact support** → opens web `/help/submit-ticket`.

---

## 4. How customers contact support

- **Web:** Same as providers: **Help** → “Submit a Support Ticket” / “Contact support” → `/help/submit-ticket` → `POST /api/me/support-tickets`.
- **Account suspended page** and other help CTAs also link to `/help/submit-ticket` where relevant.

---

## 5. Creating a ticket (API and DB)

- **Endpoint:** `POST /api/me/support-tickets`  
  - **Auth:** Any authenticated user (customer or provider).  
  - **Body:** `subject`, `message`, optional `priority` (default `medium`), optional `category`.  
  - **Flow:**
    1. Insert into `support_tickets` with `user_id`, `subject`, `description` (from message), `priority`, `status: 'open'`, `category`.  
       - **Do not** send `ticket_number`; the DB trigger sets it.
    2. Insert first message into `support_ticket_messages` (same text as description).
    3. Call `notifySupportTicketCreated(userId, ticketNumber, subject, ticketId, ["email", "push"])` so the user gets a confirmation with the ticket number.
  - **Response:** Includes the created `ticket` (with `ticket_number`) and the initial message.

- **Table:** `support_tickets` has `user_id` (who opened it) and optional `provider_id` (for provider-related tickets). The **ticket number is generated only by the trigger** on insert; no application code sets it.

---

## 6. Summary

| Role / question | Answer |
|-----------------|--------|
| Do support tickets work on super admin? | Yes. Super admin (and support_agent in API) can list, open, reply, add notes, and update status at `/admin/support-tickets` and `/admin/support-tickets/[id]`. |
| How can provider contact support? | **Web:** Help → Submit a Support Ticket (`/help/submit-ticket`). **App:** Settings → Account → **Contact support** → opens web `/help/submit-ticket`. |
| How is ticket number created? | By DB trigger `generate_support_ticket_number` before insert: `TKT-YYYYMMDD-NNNNNN` using sequence `ticket_number_seq`. |
| How would this work end-to-end? | User (provider/customer) submits on web or via app link → `POST /api/me/support-tickets` → trigger sets `ticket_number` → user gets email/push with ticket number → super admin sees ticket in admin, replies/updates status; user can view their tickets via `GET /api/me/support-tickets` (e.g. for a “My tickets” page if built). |
