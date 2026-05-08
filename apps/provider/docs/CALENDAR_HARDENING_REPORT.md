# Provider calendar — audit hardening report (2026)

This document summarizes the calendar-focused audit pass and implementation aligned with `CALENDAR_MANUAL_VALIDATION.md` and automated tests.

For a full **API, database, component, and flow** map of the provider app calendar (mobile tab), see [PROVIDER_CALENDAR_AUDIT_OUTCOME.md](./PROVIDER_CALENDAR_AUDIT_OUTCOME.md).

---

## A. Calendar flow map

| Area | Role |
|------|------|
| [apps/provider/app/(app)/(tabs)/calendar.tsx](../app/(app)/(tabs)/calendar.tsx) | Main orchestrator: day / 3-day / week, bookings (paged GET), overlays (shifts, time blocks, availability blocks, staff unavailability, booking holds), preferences, drag reschedule, status mutations, deep links. |
| [apps/provider/src/hooks/usePagedProviderBookings.ts](../../src/hooks/usePagedProviderBookings.ts) | Loads bookings for visible date window. |
| [apps/provider/src/hooks/useCalendarBookingsRealtime.ts](../../src/hooks/useCalendarBookingsRealtime.ts) | Supabase realtime → debounced booking + overlay refresh. |
| [apps/provider/src/lib/provider-calendar-parity.ts](../../src/lib/provider-calendar-parity.ts) | Expands multi-service bookings into calendar rows. |
| [apps/provider/src/lib/expand-time-blocks.ts](../../src/lib/expand-time-blocks.ts) | Expands recurring `time_blocks` across visible YMD range (deterministic civil-date math). |
| [apps/web/src/app/api/provider/bookings/route.ts](../../web/src/app/api/provider/bookings/route.ts) | GET list / POST create; read cache invalidation on mutations. |
| [apps/web/src/app/api/provider/bookings/[id]/route.ts](../../web/src/app/api/provider/bookings/[id]/route.ts) | PATCH booking; invalidates provider bookings cache + **availability Next tags** on reschedule/cancel (see changes). |
| [apps/web/src/app/api/provider/bookings/check-availability/route.ts](../../web/src/app/api/provider/bookings/check-availability/route.ts) | Pre-flight for drag reschedule / creates (slot grid + holds). |
| [apps/web/src/app/api/provider/calendar/booking-holds/route.ts](../../web/src/app/api/provider/calendar/booking-holds/route.ts) | Ghost holds for checkout-in-progress. |
| Reschedule engine | [apps/web/src/lib/bookings/reschedule-core.ts](../../web/src/lib/bookings/reschedule-core.ts) (customer/portal/provider parity). |

---

## B. Issues found

### Critical blockers

- None confirmed in code review for this pass (production verification still requires device + Supabase-backed QA).

### Important functional bugs / fragile logic (addressed)

| Issue | Root cause | Files |
|-------|------------|-------|
| Recurring time-block recurrence drift | `parseISO('YYYY-MM-DDT12:00:00')` and local `getDay` depended on **device** timezone; weekday/daily counts could diverge from provider `YYYY-MM-DD` keys. | [expand-time-blocks.ts](../../src/lib/expand-time-blocks.ts) |
| Deep link `?date=` semantics | `YYYY-MM-DD` parsed as **device-local** `Date(y,m,d)`; could disagree with provider wall date when traveling. | [calendar.tsx](../app/(app)/(tabs)/calendar.tsx) |
| “Today” button | `new Date()` only — same travel mismatch for which civil day is selected. | [calendar.tsx](../app/(app)/(tabs)/calendar.tsx) |
| Hold expiry label | `toLocaleTimeString()` used device locale/TZ, not provider TZ. | [calendar.tsx](../app/(app)/(tabs)/calendar.tsx) |
| Customer-facing availability cache staleness | Provider PATCH reschedule/cancel did not `revalidateTag` staff/date availability tags. | [bookings/[id]/route.ts](../../web/src/app/api/provider/bookings/[id]/route.ts) |

### UX / performance / parity

- Large single-file calendar screen remains a regression hotspot (no structural split in this pass).
- Optional: POST `/api/provider/bookings` could also invalidate availability tags for new bookings (not added here to limit scope).

---

## C. Changes implemented

1. **Deterministic recurrence**: Rewrote recurring expansion using UTC civil `YYYY-MM-DD` arithmetic (`calendarDaysBetweenYmd`, `utcWeekdayFromYmd`, `addDaysToYmd`) and explicit biweekly handling.
2. **Deep link + Today**: Parse `YYYY-MM-DD` with `buildZonedIsoForWallClock` when provider timezone exists; “Today” sets `selectedDate` from provider wall “today” key.
3. **Hold expiry**: Format with `formatTimeInZone(..., provider.timezone)`.
4. **Availability cache**: After successful PATCH, invalidate `availability:{staffId}:{date}` for booking staff on old/new schedule dates when rescheduled, or previous date when cancelled.
5. **Tests**: `expand-time-blocks`, extended `expandBookingsForCalendar`, GET `booking-holds` contract-style tests.
6. **Docs**: Expanded manual checklist; duplicate `date-fns-tz` entry removed from `apps/provider/package.json`.

---

## D. Exact files changed

| File | Why |
|------|-----|
| [apps/provider/src/lib/expand-time-blocks.ts](../../src/lib/expand-time-blocks.ts) | Deterministic recurrence + range expansion |
| [apps/provider/app/(app)/(tabs)/calendar.tsx](../app/(app)/(tabs)/calendar.tsx) | Deep link, Today, hold time label, hook order fix |
| [apps/web/src/app/api/provider/bookings/[id]/route.ts](../../../web/src/app/api/provider/bookings/[id]/route.ts) | Availability cache invalidation on reschedule/cancel |
| [apps/provider/__tests__/lib/expand-time-blocks.test.ts](../../__tests__/lib/expand-time-blocks.test.ts) | New tests |
| [apps/provider/__tests__/lib/provider-calendar-parity.test.ts](../../__tests__/lib/provider-calendar-parity.test.ts) | Expanded parity cases |
| [apps/web/src/app/api/provider/calendar/booking-holds/__tests__/route.get.test.ts](../../web/src/app/api/provider/calendar/booking-holds/__tests__/route.get.test.ts) | Route tests |
| [apps/provider/docs/CALENDAR_MANUAL_VALIDATION.md](CALENDAR_MANUAL_VALIDATION.md) | Manual scenarios |
| [apps/provider/docs/CALENDAR_HARDENING_REPORT.md](CALENDAR_HARDENING_REPORT.md) | This report |
| [apps/provider/package.json](../../package.json) | Remove duplicate dependency key |

---

## E. What is now fully working (strict)

- **Calendar UI**: Deep links and “Today” align with provider wall dates when `provider.timezone` is set; hold expiry labels match provider TZ formatting helpers used elsewhere on the screen.
- **API**: Provider PATCH triggers availability tag invalidation for affected staff/dates on reschedule and cancel (Next.js cache tags).
- **DB**: Unchanged schema; behavior is client + API correctness.
- **Scheduling**: Recurring `time_blocks` expansion matches civil calendar math independent of device TZ; drag reschedule path unchanged but still uses provider zoned ISO + check-availability API.

---

## F. UX / performance improvements

- Clearer operational trust for traveling providers (Today + notification deep links).
- Hold expiry text consistent with business timezone.
- Fewer “phantom” recurring block mismatches vs visible week range.

---

## G. Tests

**Added / extended**

- `npm test` (provider): `expand-time-blocks.test.ts`, `provider-calendar-parity.test.ts`
- `npx vitest run` (web): `booking-holds/__tests__/route.get.test.ts`

**Manual**: See [CALENDAR_MANUAL_VALIDATION.md](CALENDAR_MANUAL_VALIDATION.md).

---

## H. Remaining real blockers

- **Full launch readiness** still requires end-device QA against live Supabase (realtime burst, heavy schedules, external calendar OAuth/sync flows not exercised in CI).
- **POST create booking** availability tag invalidation not implemented in this pass (customer slots may lag until TTL/other invalidation paths).

---

## I. Final readiness

The provider calendar **engineering baseline for trust** is improved for timezone-safe navigation, recurring block rendering, hold labeling, and provider-booking-driven availability cache busting. **Operational “flawless”** status is **not claimed** without completing the manual torture-tests and staging verification in H.
