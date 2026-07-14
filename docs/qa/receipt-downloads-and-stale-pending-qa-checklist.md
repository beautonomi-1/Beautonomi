# Receipt downloads + stale pending bookings — manual validation checklist

Use after the “World-class receipt downloads + stale pending bookings fix” change (platform-native PDF save/share on customer + provider apps, plus stale pending bookings surfacing and auto-expiry).

Automated coverage already in place (does not need manual re-verification):
- `apps/web/src/app/api/cron/expire-stale-pending-bookings/__tests__/route.test.ts`
- `apps/web/src/app/api/provider/nav-counts/__tests__/route.test.ts`
- `apps/provider/__tests__/lib/bookings-list-query.test.ts` (`§stale-pending` cases)

## Android — download (save to device)

- [ ] Provider app: Bookings → booking detail → "Download receipt". First time, OS folder picker appears (select Downloads); PDF saves and a "Saved" toast appears with an "Open" action.
- [ ] Tap "Open" — the PDF opens in a viewer app via the `content://` URI (no crash, no "no app found").
- [ ] Repeat the download on a second booking — no folder picker this time (persisted directory URI is reused), file saves straight away.
- [ ] Provider app: Invoices, Billing (Download button), Product orders, Group bookings, Billing history, Ads receipt, Terminal order receipt — each saves a correctly named PDF the same way.
- [ ] Customer app: Booking detail (both receipt buttons), Product order detail, Membership billing history — each saves to Downloads with the "Saved" toast + Open action.
- [ ] Deny the folder permission when prompted — a clear error alert appears (no silent failure, no crash).

## Android — share (explicit "Share" actions)

- [ ] Provider app → Billing → "Share Invoice" opens the native Android share sheet with a real PDF attachment (not a broken/empty file), correct filename, `application/pdf` mime type.
- [ ] Share to WhatsApp/Gmail/Drive from the sheet — recipient receives a valid, openable PDF.

## iOS — download (in-app preview)

- [ ] Provider app: Bookings → booking detail → "Download receipt" opens the full-screen in-app PDF preview (WebView) instead of the old share sheet.
- [ ] PDF renders correctly in the preview (pinch-zoom / scroll works).
- [ ] Header back button closes the preview and returns to the previous screen.
- [ ] Header "Share" button opens the native iOS share sheet from the preview; "Save to Files", "Print", and "Mail" all show a real PDF (verify UTI/mime is recognized — icon shows as PDF, not "unknown file").
- [ ] Repeat for: Invoices, Billing (Download), Product orders, Group bookings, Billing history, Ads receipt, Terminal order receipt (provider); Booking detail, Product order detail, Membership billing history (customer).
- [ ] AirDrop the PDF to another Apple device from the share sheet — file arrives as a valid, openable PDF.

## iOS — share (explicit "Share" actions)

- [ ] Provider app → Billing → "Share Invoice" opens the native share sheet directly (no preview screen) with correct PDF metadata.

## Web (unchanged behavior — regression check only)

- [ ] Provider web + customer web: downloading a receipt/invoice still triggers a direct browser download (blob + anchor), no regression from this change.

## Error handling (both platforms)

- [ ] Force a 401 (expired session) on a receipt endpoint with no signed-url fallback configured (e.g. membership billing history) — user sees a clear "session expired" style alert, not a crash or silent no-op.
- [ ] Turn off network mid-download — clear "server error" / "check your connection" alert.

## Stale pending bookings — provider app

- [ ] Seed (or find) a `pending` booking scheduled more than 30 days in the past. Confirm it is **not** reachable via the Day view date strip (expected — strip is capped at ±30 days).
- [ ] Bookings tab shows a "needs-attention" banner ("N booking requests from past dates need your attention — Review") when `stale_pending_bookings > 0`.
- [ ] Tapping the banner switches to Overview mode, filters to Pending, widens date range to "all", and sorts oldest-first — the stale booking(s) now appear in the list.
- [ ] From that list, Confirm and Cancel actions on a stale booking work exactly as they do for a normal pending booking (via `BookingScheduleCard`).
- [ ] In Overview mode, tapping the "Pending" stat card (with no stale bookings) also applies the pending filter + "all" date range and the list matches the count shown on the card.
- [ ] After confirming/cancelling all stale pending bookings, the banner disappears and `stale_pending_bookings` in nav-counts returns to 0.

## Stale pending bookings — auto-expiry cron

- [ ] Manually trigger `GET /api/cron/expire-stale-pending-bookings` (with correct cron auth header) against a staging booking that is `status = 'pending'` and scheduled more than `STALE_PENDING_TTL_HOURS` (default 24h) in the past.
- [ ] Booking flips to `cancelled`, `cancelled_by` is `null` (system-initiated), `cancellation_fee` is `0`.
- [ ] Any amount already paid is fully refunded (wallet/gift-card/loyalty ledger reflects the refund — check `settleBookingFinanceById` side effects).
- [ ] If the customer had a package entitlement consumed for the booking, it is restored (`restore_customer_package_entitlement`).
- [ ] Customer receives a notification that the request expired because the provider didn't confirm in time; provider receives a corresponding notification.
- [ ] If a waitlist entry existed for that slot, it gets matched (`matchWaitlistOnCancellation`) after the cancellation.
- [ ] Repeat with a stale `pending` `group_booking`: all pending participant bookings are individually cancelled/refunded/notified, and the parent `group_bookings` row flips to `cancelled`.
- [ ] Re-run the cron immediately after — already-cancelled bookings are skipped (idempotent, no duplicate refunds/notifications).
- [ ] Confirm the cron is registered and firing hourly in `apps/web/vercel.json` on the deployed environment (check Vercel cron logs after deploy).
