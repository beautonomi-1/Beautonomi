# Manual validation — provider calendar (last mile)

Run through on a **small phone** and (if available) a **dense multi-staff day**.

## Core navigation

1. **Solo day**: Day view, single column — slots tap through to new booking; booking tap/long-press; empty-day hint when truly empty.
2. **Multi-staff day**: Columns mode — staff headers, horizontal scroll, full-width “now” line; overflow ⋯ on dense cards. Horizontal **swipe to change day** is intentionally off here (use header chevrons) so vertical scroll and staff-column horizontal scroll do not fight day navigation.
3. **3-day / week**: Strip counts vs grid match canceled preference; swipe navigation (RNGH pan with vertical-scroll bias); shared now-line overlays.
4. **Today**: Tap **Today** — lands on the provider’s **business-date** “today” even when the device is in another timezone (traveling provider).

## Bookings and mutations

5. **Status change**: Action sheet / Android sheet — confirm pending disables tap/drag until refresh completes.
6. **Drag reschedule** (day): Ghost follows finger; drop snaps to grid; error alerts localized; after success, booking moves and counts refresh.
7. **Tap slot → new booking**: Date/time/staff/location query params match the tapped slot and filters.
8. **Cancel / complete / start service**: Calendar reflects persisted status after refresh; no ghost cancelled rows if “hide cancelled” is on.

## Overlays and availability

9. **Overlays**: Tap availability / hold / block — menus still work; pull-to-refresh after realtime burst if blocks feel stale.
10. **Booking hold**: Hold overlay shows expiry time in **provider timezone** (aligned with slot placement).
11. **Operating hours**: Change location hours or staff hours in settings — reopen calendar and confirm closed shading and grid window update after refresh.

## Deep links and notifications

12. **Deep link `?date=YYYY-MM-DD`**: Opens the matching **provider wall date** (not device-local interpretation).
13. **Deep link `?booking_id=`**: Opens booking detail from reminder/push; returning to calendar shows consistent state after refresh.

## Advanced scenarios (trust-critical)

14. **Busy day**: Many overlapping bookings — scroll performance; no missing rows vs bookings list.
15. **Group booking**: Tap routes to group session when applicable; detail matches calendar.
16. **Recurring appointments**: Future instances appear where generated; editing series does not leave orphan blocks on the calendar.
17. **Walk-in / waiting room**: Walk-in creation from FAB or flows; waiting-room banner count matches queue screen when applicable.
18. **At-home**: At-home booking shows location type; drag reschedule uses mobile/travel checks where configured.

## Timezone torture-test

19. **Timezone switching**: Change device timezone (or travel with phone) — selected **business day** for appointments stays aligned with provider timezone keys (strip dots vs grid).

## Preferences and polish

20. **Preferences**: Open Calendar Preferences — all sections readable in **en** and spot-check **af** (zu/st may still mirror English for long copy).
21. **Low connectivity**: Airplane mode toggle — error state + retry; returning online restores schedule.
22. **i18n**: Switch app language — calendar strings above plus prefs modal keys resolve.
