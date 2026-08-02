# Provider booking sheet migration (Phase 5)

## Summary

The legacy `AppointmentSidebar` (~5,850 lines) has been **removed**. Provider web booking now uses the **mobile-first bottom sheet** exclusively via `BookingSheetHost` on:

- `/provider/bookings` (Day hub + Overview)
- `/provider/calendar`
- `/provider/front-desk`

Global overlays (group, product orders, walk-in POS) mount via `ProviderBookingOverlayHost` in `ProviderShell`.

## Feature flag

| Key | Default (Phase 5) | Purpose |
|-----|-------------------|---------|
| `provider_booking_mobile_shell` | **on** | ConfigBundle toggle; code defaults to **on** when flag row is missing |

Dev override:

- `NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL=1` — force on
- `NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL=0` — force off (no legacy sidebar after Phase 5)

Migration: `834_provider_booking_mobile_shell_default_on.sql`

## Rollback (production incident)

Phase 5 **does not** support instant rollback to the legacy sidebar (file deleted).

1. **Redeploy** the previous release that still includes `AppointmentSidebar.tsx`, **or**
2. Set `provider_booking_mobile_shell=false` in ConfigBundle **and** redeploy a build that still ships the legacy sidebar (pre-Phase-5 tag).

No database rollback is required beyond re-disabling the flag if you redeploy legacy code.

## Error isolation

`BookingSheetHostErrorBoundary` catches render errors in booking sheets and shows **Close / Try again** — the rest of the provider portal continues to work.

## QA commands

```bash
# Unit tests (payload parity)
pnpm --filter @beautonomi/provider-booking test

# Typecheck
pnpm --filter web typecheck

# Provider booking E2E (requires provider auth env)
pnpm --filter web test:e2e:provider-booking
```

## Regression checklist

- [ ] Calendar: slot click → create; appointment click → view sheet
- [ ] Calendar: drag reschedule; hold overlays visible
- [ ] Front desk: walk-in + new appointment
- [ ] Bookings hub: Day / Overview; quick actions; realtime flash
- [ ] Group bookings: create/edit/view sheets
- [ ] Product orders + walk-in sale sheets
- [ ] `/provider/bookings/[id]` direct URL
- [ ] Bulk actions on Overview tab
- [ ] PayCloud / Yoco collect from view sheet
