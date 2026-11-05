# Booking-flow timeout investigation (2026-11-04)

## Incident window

- **UTC:** 2026-11-04 15:45–15:49 (aligned with Sentry session for provider owner `11ccc539-…` on build `provider@1.0.109`).
- **Symptoms:** Provider mobile `useApi` aborts at **15s** (`TIMEOUT`) on `/api/provider/packages`, `/api/provider/group-bookings`, `/api/provider/bookings/available-slots`, and likely `/api/provider/team` in the same session. Customer app **504** on `/api/public/home` in the same window suggests **platform-wide** slowness, not only provider routes.

## Production data context (provider `0350ad64-…`)

- Small roster (3 staff), 7 group bookings, 1 package — **not** large-table pressure.
- Booking `BTN-20261104-151829-43C612AE` saved with `booking_services.staff_id = null` because the staff UI was hidden while the team list never loaded.

## Code-level contributors (confirmed in repo)

| Surface | Mechanism |
|--------|-----------|
| Group list page 1 | `computeCompletedGroupBookingStats` scanned all completed groups, child bookings, and `finance_transactions` on every first-page load. |
| Available slots | Per-slot sequential `checkResourceAvailability` when offerings require resources; multi-staff “any” runs availability once per staff member. |
| Provider routes | No `maxDuration` on several handlers (defaults to platform limit); client aborts at 15s regardless. |
| Staff UI | Team list empty while loading/failed → staff row hidden → validation treated as “no staff required”. |

## Vercel / Supabase log pull (operator)

This workspace does not include Vercel CLI credentials. To confirm whether functions **completed after** the client abort or were **cold-started** in `fra1`:

1. Vercel → Project → Logs → filter **2026-11-04 15:45–15:49 UTC**, region **fra1**, paths: `/api/provider/team`, `/packages`, `/group-bookings`, `/bookings/available-slots`, `/api/public/home`.
2. Supabase → Reports → Database / API → slow queries and connection count for the same window.

Record duration p95 and cold-start flags here when available.

## QA follow-up (implementation audit)

- **`@beautonomi/provider-booking` must be rebuilt** (`npm run build` in `packages/provider-booking`) before provider mobile or Jest pick up validation/readiness changes; the package resolves to `dist/`, not `src/`.
- **Recurring series:** `"any"` on `staff_id` in recurring metadata is resolved in `create-booking-from-series.ts` when each occurrence booking is materialized (same picker as one-off create).
- **Client:** `NO_STAFF_AVAILABLE` is treated like slot conflict on new booking and on group create (`NO_STAFF_AVAILABLE` / `SLOT_NOT_AVAILABLE` / `CONFLICT` → “Pick another time” returns to the form with the time field flagged; `INVALID_STAFF` flags the staff field).
- **Jest:** group validation tests now pass `staffListLength` when asserting staff is required, matching production rules (empty loaded roster = staff optional).
- **Group “any” + participants:** participants on “Group default” no longer send `staff_id: "any"`; the server falls back to the group's resolved staff (`sessionContext.staffId`). Only an explicit per-participant “Any available” is resolved per participant.
- **Recurring + “any”:** the series-level `staff_id` is a UUID column (`z.string().uuid()`), so mobile omits it when the first line is “any”; per-line `metadata.services[].staff_id = "any"` is resolved per occurrence.
- **Custom service + “any”:** `resolveCustomServicesInBookingBody` runs first and sets the walk-in custom offering id on each custom line; that offering has no `staff_services` rows, so `staffIdsEligibleForOfferings` does not narrow and every active location staff member is a candidate (covered by `resolve-provider-any-staff-on-body.test.ts`).
- **Success sheet:** shows “With {names}” from the POST response `services[].staff_id` (already resolved server-side), mapped through the loaded roster. Booking detail/list read `booking_services.staff` from the DB.
- **Typecheck fixes:** `providerTimeZone` was undefined in the bookings and group-bookings POST handlers, and `locationType` was redeclared in `create-booking-from-series.ts`; both are fixed (`tsc --noEmit` clean for web and provider).

## Manual device QA (before OTA)

Run on a physical device against the build that will ship.

1. **Throttled network:** enable a slow 3G profile (or Network Link Conditioner). Open New booking → pick a service. Staff row must show “Loading team…”, never “No staff”; Create stays disabled until the roster arrives or the provider picks a staff option.
2. **Blocked team request:** block `/api/provider/team` (proxy or airplane mode after the screen opens). Staff row shows “Could not load team. Tap to retry”; tapping retries; Create remains blocked while the roster is unresolved. Repeat on Group bookings → New group, and in the custom offer sheet (staff is optional there; “No preference” stays selectable).
3. **Any staff → DB UUID:** with 2+ staff, choose “Any available” on a single booking, a group (Group default participants), and a recurring series. After save the success sheet shows “With {name}”; booking detail shows the same name.
4. **No one free:** make every staff member busy at a time, choose “Any available” → expect “Slot unavailable” + “Pick another time” (single and group), not a generic error.

SQL spot-checks (replace the provider id / time window):

```sql
-- New bookings created by the provider app must never have null or sentinel staff on service lines
select b.id, b.booking_number, bs.staff_id
from bookings b
join booking_services bs on bs.booking_id = b.id
where b.provider_id = '<provider_id>'
  and b.created_at > now() - interval '1 hour'
  and bs.staff_id is null;

-- Group participants on "Group default" should share the group's staff
select gb.id, gb.staff_id as group_staff_id, bs.staff_id
from group_bookings gb
join bookings b on b.group_booking_id = gb.id
join booking_services bs on bs.booking_id = b.id
where gb.provider_id = '<provider_id>'
  and gb.created_at > now() - interval '1 hour';
```

## Mitigations shipped in this change set

1. **Group stats:** lazy `GET /api/provider/group-bookings/stats`; list no longer runs stats unless `include_stats=1`.
2. **Slot grid:** resource checks for a day run in parallel (`Promise.all`) instead of strictly sequential awaits.
3. **`maxDuration = 30`** on team, packages, group-bookings (GET/POST), available-slots, and group stats.
4. **Client:** one automatic **TIMEOUT** retry for idempotent booking-flow GETs (team, services, packages, group-bookings, available-slots).
5. **Staff assignment:** roster loading/retry UI, “Any staff” + server resolution (separate from timeout work but fixes null `staff_id` when team requests fail).

## Follow-up if logs show unrelated platform outage

- Treat `/api/public/home` 504s as a separate track (already has `maxDuration` 30 on home).
- Consider Supabase connection pool / burst limits if logs show queueing across all routes.
