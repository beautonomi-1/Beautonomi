# Provider calendar hours runbook

One shared engine (`packages/utils/src/calendar-hours/`) resolves every operating
hours / working hours shape into minute ranges and feeds both the web provider
portal (`apps/web/src/app/provider/calendar/CalendarClient.tsx`) and the
mobile provider calendar tab (`apps/provider/app/(app)/(tabs)/calendar.tsx`).

This doc is a debugging index for "why does the calendar look wrong" questions.

## Resolution order

1. `resolveDayHours(dayHours)` — normalises any of the historical shapes
   below into `{ openMin, closeMin, closed }`:
   - `{ open, close, closed }` (web)
   - `{ open_time, close_time, is_open }` (mobile / API)
   - `{ start, end }` or `{ start_time, end_time }` (legacy)
2. `dayMinuteRanges(date, weekly)` — returns the open minute ranges for a
   specific `Date`. Overnight shifts (close <= open) are split into today
   `[openMin, 1440]` and tomorrow `[0, closeMin]`, so a 22:00–02:00 shift
   renders on both days.
3. `slotIsOutsideWeekly(date, startMin, endMin, weekly, mode)` — minute-
   accurate inside/outside check. `mode = "strict"` requires the slot to be
   fully contained; `mode = "overlap"` returns `false` as long as the slot
   overlaps any open range (used for hour-row shading so a 09:30 open does
   not mark the 09:00 row as closed).
4. `mergeOperatingHours([...])` — union of many weekly schedules. Earliest
   open / latest close per day, closed only if every schedule is closed.
   Used for "All Locations" on mobile and (indirectly, via
   `mergeStaffWorkingHours`) for weekend shifts that rely on team members.
5. `deriveGridHourWindow({ visibleDates, locationOperatingHours, staffWorkingHours, events, ... })`
   — returns `{ startHour, endHour }` for the visible grid. Pads ±1 hour,
   clamps to `[0, 23]`, and always includes the minute range of any event
   that falls on a visible date so existing appointments never clip.

## Multi-location merge

Mobile's "All Locations" filter in `apps/provider/app/(app)/(tabs)/calendar.tsx`
calls `mergeOperatingHours(locations.map(l => l.operating_hours))`. Web sets
`locationOperatingHours` from the currently selected location; multi-location
union is handled by `deriveGridHourWindow`'s `staffWorkingHours` slot-
aggregation because web fetches location hours per selection.

A day is only marked closed in the merged result when **every** source is
closed. If one location is closed on Sunday but another opens 10:00–14:00,
the merged schedule reports Sunday `10:00–14:00 open`.

## Overnight shifts

- `dayMinuteRanges` emits two ranges for a 22:00–02:00 shift: `[1320, 1440]`
  on the opening day and `[0, 120]` on the wrap-around day.
- `deriveGridHourWindow` therefore pushes `endHour` to 23 on the opening day
  and `startHour` to 0 on the wrap-around day.
- Web: `GestureLayer` uses `slotIsOutsideWeekly` and resolves each slot
  minute-accurately, so overnight hours render as open on both days.
- Mobile: `renderHoursShading` calls `dayMinuteRanges` directly and draws
  shading only in the gaps between open ranges.

## Timezones

`dayMinuteRanges`, `slotIsOutsideWeekly`, `hourIsOutsideWeekly`, and
`deriveGridHourWindow` each accept an optional `timeZone` (IANA, e.g.
`"Africa/Johannesburg"`). When provided, the engine resolves the weekday of
each `Date` in that zone using `Intl.DateTimeFormat` (no extra dependency),
so a late-Saturday UTC instant is correctly read as Sunday in SAST.

Two callers, two strategies:

- **Web** (`apps/web/src/app/provider/calendar/CalendarClient.tsx`) already
  feeds the engine `toZonedTime(d, businessTz)` dates via `nowInTz` /
  `addDays`, so local getters (`getDay`, `getHours`) already reflect the
  business zone. Passing `timeZone` to the engine would cause double
  conversion, so the web path deliberately relies on the engine's Date-
  local fallback.
- **Mobile** (`apps/provider/app/(app)/(tabs)/calendar.tsx`) passes raw
  device-local `Date` instants and supplies
  `timeZone: provider?.timezone ?? null` to every engine entry point plus
  uses `formatDateKeyInTimeZone(day, tz)` to format `YYYY-MM-DD` overlay
  filter keys. Without this, a device in UTC viewing a JHB provider at
  22:30Z (Sunday 00:30 SAST) would apply the Saturday schedule and
  mismatch overlay `.date` strings.

Fallback behaviour: when `timeZone` is nullish or invalid (e.g. legacy
offset strings like `"GMT+2"`), the engine falls back to device-local
`getDay()`/`getFullYear()`/etc. The web app canonicalises legacy offset
zones via `normalizeProviderTimezone` before touching the calendar.

### Quick tz sanity checks

- `getWeekdayInTimeZone(new Date("2026-04-18T22:30Z"), "Africa/Johannesburg")`
  → `0` (Sunday).
- `formatDateKeyInTimeZone(new Date("2026-04-18T22:30Z"), "Africa/Johannesburg")`
  → `"2026-04-19"`.
- `dayMinuteRanges(new Date("2026-04-18T22:30Z"), { saturday: { open: "22:00", close: "02:00" } }, "Africa/Johannesburg")`
  → `[{ startMin: 0, endMin: 120 }]` (the overnight tail on the Sunday
  side of midnight).

## Booking holds and overlay filtering

Both apps filter overlays (bookings, availability blocks, staff
unavailability, booking holds, expanded time blocks) by the current
`locationFilter`. Overlays without a `location_id` are treated as
location-agnostic. When a hold, block, or booking looks "stuck" on the
wrong column:

1. Check the record's `location_id` — if null, it will render everywhere.
2. Confirm the mobile filter is not set to a single location that excludes
   the overlay.

## Debug checklist for a misrendering day

1. Is the day's source value non-null? `locations[*].operating_hours[dayName]`
   / `staff[*].working_hours[dayName]`.
2. What does `resolveDayHours(dayHours)` return? If `null`, the shape is
   unrecognised — check for stray arrays or string values.
3. What does `dayMinuteRanges(date, weekly)` return? Empty => the day is
   reported closed (or unrecognised).
4. What does `deriveGridHourWindow({...})` return? If it falls back to the
   default 8–20 range, nothing contributed open minutes.
5. For sub-hour opens / closes, does the 1-hour shading row look right?
   Shading uses **overlap** mode so a 09:30 open leaves the 09:00 row
   clickable; shading uses **strict** mode for minute-precise interior
   slots (future sub-hour grids).

## Tests

- `packages/utils/src/calendar-hours/__tests__/*.test.ts` — 61 unit tests
  covering resolution, ranges, overlap, merge, grid derivation, and
  timezone-aware weekday/day-key resolution (including overnight and
  staff-only weekends, Sunday→Monday wrap, and DST-adjacent instants).
- `apps/web/src/components/provider-portal/calendar/__tests__/GestureLayer.test.tsx`
  — renders the web calendar's shading layer for a sub-hour open and an
  overnight wrap-around case.

Run locally with:

```bash
pnpm --filter @beautonomi/utils test
pnpm --filter beautonomi-web test src/components/provider-portal/calendar
```

## Known out-of-scope items

- DST transition rendering (23/25-hour days) — engine still works; the
  grid row count change is a separate UI task.
- Editing flows for operating hours (settings screens) — unaffected.
- Mobile header "today" label still formats with device-local
  `format(new Date(), ...)`; users physically travelling across time zones
  without updating the device clock will see the device's "today" label.
  Overlay filtering and grid hours are now provider-zone correct.
