# Calendar integration

## 1. Provider calendar integration (Google, Apple, Outlook)

**Purpose:** Sync the **provider’s** appointments with their external calendar (Google, Outlook, or Apple/iCal) so bookings appear in their calendar and optionally pull in external events.

### Where it’s configured

- **Web:** Provider Settings → **Calendar Integration** (e.g. `/provider/settings/calendar-integration`).
- **Mobile (provider app):** More → Settings → **Calendar Integration** (“Google, Apple & Outlook sync”).

### How it works

1. **Storage**
   - Sync config is stored in **`calendar_syncs`** (per provider).
   - Supports: `google`, `outlook`, `ical` (Apple via iCal feed).
   - Fields include: `provider`, `calendar_id`, `access_token`, `refresh_token`, `ical_url`, `sync_direction`, `is_active`.

2. **Sync direction**
   - **app_to_calendar** – Push Beautonomi appointments to the external calendar.
   - **calendar_to_app** – (If implemented) pull external events into the app.
   - **bidirectional** – Both ways (gated to higher plan in code).

3. **APIs**
   - **List/create syncs:** `GET/POST /api/provider/calendar/sync`
   - **Update/delete:** `PATCH/DELETE /api/provider/calendar/sync/[id]`
   - **OAuth:** `GET /api/provider/calendar/auth/[provider]` (e.g. Google/Outlook auth URL and callback).

4. **Sync logic**
   - **`apps/web/src/lib/provider-portal/calendar-sync.ts`** (`CalendarSyncService`):
     - **Google:** Uses Calendar API to create events (title, time, location, optional attendee).
     - **Outlook:** Creates events via Microsoft Graph (or similar).
     **Apple:** Uses iCal subscription; “sync” is typically a feed URL rather than push.

5. **Access**
   - Calendar sync is **subscription-gated** (e.g. Starter+); bidirectional sync may require a higher plan. Checks live in `checkCalendarSyncFeatureAccess`.

So: **provider** calendar integration = connect **their** Google/Outlook/Apple calendar so **their** appointments show there (and optionally external events in the app).

---

## 2. Customer: saving a booking to their calendar

**Purpose:** After a customer books, they can add the appointment to **their** calendar (Google, Outlook, or any app that supports .ics).

### Where it exists today

- **Portal booking page** (customer view by magic link):
  - **Route:** e.g. `/portal/booking?token=...` (link from confirmation email/SMS).
  - **Behaviour:** Shows “Add to calendar” with:
    - **Google** – Opens Google Calendar “Add event” with pre-filled title, time, location.
    - **Outlook** – Opens Outlook web “Add event” with same details.
    - **.ICS** – Downloads a `.ics` file (e.g. `booking-{booking_number}.ics`) that can be opened in Apple Calendar, Outlook desktop, etc.
  - **Implementation:** `apps/web/src/app/portal/booking/page.tsx` builds a `calendarEvent` from the booking and uses:
    - `getGoogleCalendarUrl`, `getOutlookCalendarUrl`, `downloadICS` from `@/lib/calendar/ics`.

- **Main booking confirmation page** (right after checkout):
  - **Route:** `/booking/confirmation?bookingId=...`
  - **Behaviour:** Shows confirmation, “Download Receipt”, “Share”, “View My Bookings”.
  - **Currently:** **No** “Add to calendar” here; customers get the confirmation email and can use the **portal link** to open the booking and use “Add to calendar” there.

So: **yes, after a customer books they can save it to their calendar**, but only when they open the **portal booking page** (link in confirmation email/SMS). The post-checkout confirmation screen does not yet offer “Add to calendar” (see below to add it).

### Shared calendar helpers

- **`apps/web/src/lib/calendar/ics.ts`**
  - `CalendarEvent`: `title`, `description`, `location`, `start`, `end` (Date).
  - `generateICSBlob`, `getGoogleCalendarUrl`, `getOutlookCalendarUrl`, `downloadICS`.
- **`apps/web/src/lib/ical/generator.ts`**
  - Used for **staff calendar feed** (iCal feed for providers), not for one-off customer “add to calendar”.

---

## 3. Staff calendar feed (iCal for providers)

- **Route:** `GET /api/staff/[id]/calendar.ics`
- **Purpose:** Public iCal feed for a **staff member** (provider side). Subscribing in Apple Calendar (or similar) shows that staff’s appointments.
- **Implementation:** `apps/web/src/app/api/staff/[id]/calendar.ics/route.ts` + `generateStaffCalendar` in `apps/web/src/lib/ical/generator.ts`.

---

## Summary

| Audience   | Feature                         | How                                                                 |
|-----------|----------------------------------|---------------------------------------------------------------------|
| Provider  | Sync with Google/Outlook/Apple   | Settings → Calendar Integration; OAuth + `calendar_syncs`; subscription-gated. |
| Customer  | Add booking to their calendar    | Portal booking page: Google / Outlook / .ICS. Confirmation page: add “Add to calendar” (see below). |
| Provider  | Staff iCal feed                  | Subscribe to `/api/staff/[id]/calendar.ics` in a calendar app.      |

Adding “Add to calendar” (Google, Outlook, .ICS) to the main **booking confirmation page** would let customers save the appointment to their calendar immediately after booking, without having to open the portal link first.
