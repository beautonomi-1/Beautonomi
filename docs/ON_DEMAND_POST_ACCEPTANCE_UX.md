# Post–acceptance UX (customer): order summary and tracking

When a provider **accepts** an on-demand request, the customer is sent to **Booking detail** (`booking-detail` screen). This doc compares the current experience with a reference “order tracking” pattern and suggests improvements for Beautonomi.

## Reference pattern (order tracking screen)

- **Header:** Back + **Order #ID** (e.g. Order #DFD302740901) + status bar.
- **Tabs:** Tracking | Receipt | Details.
- **Acceptance block:** Green check, “Order accepted 10:41”, provider name below.
- **Status block:** Large block with headline (e.g. “Preparing your order”) and themed illustrations.
- **Tracking milestones:** e.g. Collection → Arrival → Delivery to you (with address).
- **ETA card:** “Arriving between 11:11 – 11:26” + Help link.

## What the customer sees today (Beautonomi) — implemented

After on-demand accept, the app does `router.replace(booking-detail, { id: request.booking_id })` (customer app) or redirects to `/account-settings/bookings/[id]` (web). The **booking-detail** screen now includes:

- **Header:** Booking # in screen title.
- **Acceptance strip** (confirmed/pending/started): Green check, "Booking confirmed [time]", "Your booking with [Provider name] is confirmed.", optional Help from `ui_copy.waiting_help_url`.
- **Tabs (customer app):** Tracking | Receipt | Details — status block, milestones, payment, full details.
- **Web** `/account-settings/bookings/[id]`: Booking #, acceptance strip, Help, full details.

**Original gaps vs reference (addressed):**

| Reference | Current | Suggestion |
|-----------|---------|------------|
| Order # in header | No booking/order ID in header | Show **Booking #** (e.g. `booking_number` or short id) in screen title. |
| Tabs (Tracking / Receipt / Details) | Single scroll, no tabs | Add tabs: **Tracking** (status + milestones), **Receipt** (payment), **Details** (services, location, full info). |
| “Order accepted at [time]” + provider | Only provider name in a card | Add **acceptance strip**: “Booking confirmed [time]” + provider name (and optional “with [Provider Name]”). |
| Status / illustration block | None | Add block: e.g. “Your visit is confirmed” / “Provider preparing” / “On the way” with **beauty-themed** visuals (tools, products, person in chair). |
| Tracking milestones | None | Add **milestones** by booking status: e.g. Request sent → Accepted → Preparing → En route / At venue → In progress → Completed. |
| ETA / arrival window | None | When supported by backend, show **estimated start or arrival**; otherwise “Scheduled [date] at [time]”. |
| Help | None | Add **Help** (link from `ui_copy` or app config) next to ETA or in header. |

## Alignment recommendations for Beautonomi

1. **Header**
   - Use **Booking #** in the screen title: `Booking #${booking_number || shortId}` so it matches the “Order #…” pattern and reassures the customer which booking they’re viewing.

2. **Acceptance / confirmation block**
   - For **confirmed** (and optionally pending/started) bookings, show a clear strip at the top:
     - Icon (e.g. green check).
     - “Booking confirmed [time]” (use `selected_datetime` or `confirmed_at` if available).
     - “Your booking with [Provider name] is confirmed.” (reuse provider name from API.)

3. **Tabs (Tracking | Receipt | Details)**
   - **Tracking:** Status headline + illustration block + milestones (see below). Good for on-demand and same-day bookings.
   - **Receipt:** Current payment summary + Pay / Download / Share.
   - **Details:** Current services, location, map, special requests, Reschedule / Cancel.
   - Keeps one place for “where is my booking” and separates payment and full details.

4. **Status block and copy**
   - One prominent block with:
     - Headline by status, e.g. “Your visit is confirmed”, “Provider preparing”, “On the way”, “Service in progress”, “Completed”.
     - **Beauty-themed** illustration or illustration set (e.g. scissors, brush, product bottle, person in salon chair) instead of food/delivery icons. Can be static at first; animation later if desired.

5. **Tracking milestones**
   - Map booking status to steps, e.g.:
     - Request sent (if from on-demand and we store that).
     - Accepted → “Booking accepted”.
     - Confirmed / Pending → “Preparing for your visit”.
     - Started → “Service in progress”.
     - Completed → “Completed”.
   - For house calls, add steps like “Provider en route” and “Provider has arrived” when backend supports location/status.

6. **Time and Help**
   - Show **scheduled time** prominently (and ETA/arrival window when available).
   - Add **Help** (link from on_demand `ui_copy.waiting_help_url` or a general app help URL) next to the time or in the header.

7. **On-demand vs scheduled**
   - Same booking-detail screen can serve both. Optional: if booking was created from an on-demand request (e.g. `on_demand_request_id` on booking or passed as param), show “Request accepted” in the acceptance strip and default to the Tracking tab.

## Data and API

- **Already available:** `booking_number`, `provider.business_name`, `selected_datetime`, `status`, services, location, payment.
- **Optional later:** `confirmed_at` or `accepted_at` for “Booking accepted at [time]”; `on_demand_request_id` to detect on-demand; ETA/arrival window if provider app sends it.

## Implementation order

1. **Done:** Header with Booking #; acceptance strip (“Booking confirmed [time]” + provider name); Help link from config.
2. **Done:** Tabs (Tracking / Receipt / Details) on customer app; content in Receipt and Details.
3. **Done:** Tracking tab with status block with headline + beauty illustration; simple milestones from `status`.
4. **Done:** ETA and Provider en route / Provider arrived when the backend supports it. Backend: provider_en_route_at, provider_arrived_at, estimated_arrival, provider_location on bookings (migration 290); start-journey and arrive set these; location updates persist ETA from Mapbox distance. Status API and GET /api/me/bookings/[id] return them. Customer app Tracking tab shows en-route/arrived milestones and ETA card for at-home; web OrderDetailsDynamic shows same steps and ETA. Aligned with routes optimization, Mapbox (distance/ETA), and travel fee.
