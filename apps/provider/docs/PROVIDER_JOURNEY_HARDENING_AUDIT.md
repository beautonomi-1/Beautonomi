# Provider App Journey Hardening — Audit

**Scope:** Phases A–D of the provider mobile journey hardening pass (`apps/provider`).  
**Date:** 2026-06-06.  
**Related:** [PROVIDER_MOBILE_COMPLETION_AUDIT.md](./PROVIDER_MOBILE_COMPLETION_AUDIT.md), [PROVIDER_DASHBOARD_TRUTHFULNESS_AUDIT.md](./PROVIDER_DASHBOARD_TRUTHFULNESS_AUDIT.md).

---

## Summary

Independent, shippable improvements across booking operations, navigation/IA, payment capture reliability, and CRM parity. Reused existing APIs wherever possible; no native calendar grid or drag-reschedule rewrite.

| Phase | Status | Highlights |
|-------|--------|------------|
| **A** — Booking / calendar | ✅ Shipped | Edit appointment sheet, list-level cancel/reschedule, time-block month navigation |
| **B** — Navigation / IA | ✅ Shipped | Sell/POS discoverability, walk-in label disambiguation, duplicate screen redirects |
| **C** — Checkout / payments | ✅ Shipped | Yoco mark-paid retry UX; Paystack `entity_type: "other"` verified for retail walk-in |
| **D** — CRM parity | ✅ Shipped | Client delete, recent-client browse in new booking, campaign edit/delete for drafts |

---

## Phase A — Booking / calendar operational completeness

### A1 — Edit appointment sheet
- **Files:** `BookingEditSheet.tsx`, `build-booking-edit-patch-payload.ts`, `booking-edit-types.ts`, `bookings/[id].tsx`
- **API:** Existing `PATCH /api/provider/bookings/[id]` with `services[]`, `products[]`, `staff_id`, discounts, `version` optimistic lock.
- **Gating:** `edit_appointments` permission; surfaces `PRODUCT_EDIT_LOCKED` server errors via toast.
- **Web fix:** Per-service `staff_id` on PATCH insert (parity with POST create) in `apps/web/.../bookings/[id]/route.ts`.
- **Tests:** `__tests__/lib/build-booking-edit-patch-payload.test.ts` (3 cases).

### A2 — List-level Cancel + Reschedule
- **Files:** `BookingScheduleCard.tsx`, `bookings/index.tsx`, `bookings/[id].tsx`
- Overflow menu (⋯) on schedule rows; deep-links with `openReschedule=1` / `openCancel=1` query params.

### A3 — Time blocks month navigation
- **File:** `more/time-blocks.tsx`
- Prev/next month controls; 4-month range caption for blocks beyond the default window.

---

## Phase B — Navigation / IA cleanup

### B1 — POS discoverability
- **Files:** `dashboard.tsx`, `bookings/index.tsx`
- Prominent **Sell / POS** quick action → hidden Sales tab (`/(app)/(tabs)/sales`).

### B2 — Walk-in label disambiguation
- Bookings quick actions now distinguish: **Sell/POS**, **Front Desk queue**, **Walk-in Appointment**, **Retail Product sale**.

### B3 — De-duplication
- **Locations:** `more/settings/locations.tsx` → redirect to `more/locations`.
- **Packages:** `more/packages-list.tsx` → redirect to `more/packages`; catalogue link updated.
- **Settings:** Removed duplicate staff-permissions and booking-link entries in `more/settings/index.tsx`.

---

## Phase C — Checkout / payment-capture reliability

### C1 — Payment retry after terminal success
- **Files:** `sales.tsx`, `bookings/[id].tsx`
- Replaced passive “check Sales” alert with **Payment received — finish recording** + explicit Retry for `mark-paid` / sale PATCH failures.

### C2 — Paystack `entity_type`
- **Verified:** `walk-in-sale.tsx` uses `entity_type: "other"` intentionally; product order is created post-payment via `product-sales`. No finance misrouting found; comment added in source.

---

## Phase D — CRM / web parity

### D1 — Client delete
- **File:** `clients/[id].tsx`
- **Remove from client list** with confirmation → `DELETE /api/provider/clients/{id}`.

### D2 — Browse clients in new booking
- **File:** `bookings/new.tsx`
- Preloads `GET /api/provider/clients/serviced?limit=25` when search &lt; 2 chars; shows **Recent clients** list.

### D3 — Marketing campaign edit/delete
- **File:** `more/marketing.tsx`
- Edit/Delete on draft and scheduled campaigns via `PATCH` / `DELETE /api/provider/campaigns/{id}`; edit bottom sheet mirrors create fields.

---

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (`apps/provider`) | ✅ Pass |
| `npx jest build-booking-edit-patch-payload.test.ts` | ✅ 3/3 pass |
| `npx tsc --noEmit` (`apps/web`, API touch) | Booking PATCH `staff_id` parity only — run in CI |

## Final QA (2026-06-06)

**Automated:** Provider `tsc` clean; payload-builder Jest 3/3 pass.

**API contracts verified against web routes:**
- `PATCH/DELETE /api/provider/campaigns/{id}` — draft/scheduled edit; sent campaigns blocked server-side.
- `DELETE /api/provider/clients/{id}` — requires `edit_clients` permission (API enforces; UI shows action for all viewers).
- `GET /api/provider/clients/serviced` — used for new-booking browse list.
- `PATCH /api/provider/bookings/{id}` — line-item edit + `PRODUCT_EDIT_LOCKED` / version conflict codes wired in mobile.

**Routing:** List reschedule/cancel navigates to `/(app)/(tabs)/bookings/[id]` which re-exports `more/bookings/[id]` — query params `openReschedule` / `openCancel` open the correct sheets once data loads.

**QA fixes applied during review:**
- **Edit appointment:** “On this appointment” section now surfaces variant/parent-selected services (not only parent catalogue rows), preventing invisible line items on save.
- **Marketing:** Create/edit form reset on open/close; edit save validates email subject and schedule datetime.

**Known acceptable limits (not bugs):**
- Variant-only bookings: add-services picker lists parents only; existing variant lines stay visible in “On this appointment”.
- Client delete button not permission-gated in UI — server returns 403 without `edit_clients`.
- Nested card touch targets (⋯ menu + CTA inside card press) follow existing pattern; inner `TouchableOpacity` receives touch first on iOS/Android.
- Marketing edit sheet does not expose schedule datetime field (create sheet does); schedule preserved from GET on save.

---

## Booking date/time + realtime + group UX (2026-06-06)

| Phase | Status | Highlights |
|-------|--------|------------|
| **A** — Date/time | Shipped | Debounced `useBookingAvailableSlots`, `BookingDateTimePicker`, skeleton/“Updating times…”, Review spinner, period groups, Next available, relative dates |
| **B** — Live sync | Shipped | `BookingLiveSyncIndicator` (provider + customer), reschedule slot refresh on realtime, shared stage labels |
| **C** — Groups | Shipped | Customer primary-contact reschedule, per-participant staff, create progress, calendar group deep-links |

**Tests:** `booking-date-time-helpers.test.ts` (5 cases). **tsc:** provider + customer pass.

---

## Out of scope (deferred)

- Native week/month calendar grid and drag-to-reschedule.
- Speculative marketing API endpoints beyond existing campaign CRUD.
- Server-side slot holds; web provider booking-detail realtime.
