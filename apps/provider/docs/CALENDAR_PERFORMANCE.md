# Provider calendar — performance & trust notes

## Loading strategy

- **Day / 3-day / week views** request bookings for the **ISO week range** containing the visible window so date-strip dots, share text, and counts stay consistent without extra queries.
- **Paged fetch**: server caps responses at 1000 rows; the client walks `offset` pages until a short page. *(Optional future improvement: coalesce duplicate in-flight fetches for the same path to avoid stacked walks when realtime + refresh overlap.)*
- **Realtime**: booking rows refresh on a **400ms debounce**. Overlays do **not** auto-refresh with realtime (see `useCalendarBookingsRealtime`) to avoid multiplying secondary reads; providers should **pull to refresh** after editing blocks/holds if something looks stale.

## Trust / counts

- **Date-strip counts** respect **Show canceled** the same way as the grid (`bookingCountsByDate`).
- **Pending confirmation banner** uses **provider timezone date keys** for the “next 8 days” window (not device-local midnight).

## Rendering

- Booking cells use **`React.memo`** on `CalendarBookingBlock` plus a **stable `preferences` object** from the screen to cut redundant reconciliation on dense days.

## Manual sanity checks (large tenants)

- Week view with 500+ bookings in range: scroll and day switching stay usable; watch for repeated page walks (mitigated by inflight coalescing).
- Pull-to-refresh + simultaneous realtime: watch request volume; coalescing could be added if profiling shows duplicate walks.
