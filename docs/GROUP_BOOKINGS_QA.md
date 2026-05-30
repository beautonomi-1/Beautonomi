# Group Bookings — QA Matrix

> §group-bookings-qa 2026-05 — end-to-end QA pass for the group bookings feature.

This document is the test plan for group bookings across all surfaces.

---

## 1. Architecture invariants

| # | Invariant | Where to verify |
|---|-----------|----------------|
| A | A group booking always has exactly one participant with `is_primary_contact = true`. | `group_bookings.primary_contact_booking_id` must match that participant's `booking_id`. |
| B | Deleting/removing a participant cancels (not deletes) their child booking. | `DELETE /api/provider/group-bookings/[id]/participants/[pid]` — booking status `→ cancelled`, `group_booking_id → null`. |
| C | `total_price` on `group_bookings` is always recalculated after participant add/remove. | `recalculateGroupBookingTotal` called from both POST participants and DELETE participant. |
| D | Provider cancel cascades to all non-terminal child bookings and sends cancellation notifications. | `DELETE /api/provider/group-bookings/[id]` — `sendCancellationNotification` called per child. |
| E | Check-in is idempotent: calling check-in on an already-checked-in participant returns the original timestamp. | `POST .../check-in` — pre-flight fetch; early return when `checked_in_at IS NOT NULL`. |
| F | Check-out requires check-in: calling check-out on a non-checked-in participant returns `400 NOT_CHECKED_IN`. | `POST .../check-out` — pre-flight guard. |
| G | `complete_service` completes all active child bookings regardless of their current status. | Status filter `in("status", ["in_progress","confirmed","waiting","checked_in"])`. |
| H | `from-bookings` rolls back the group row if any participant link fails. | try/catch wraps the participant loop; `group_bookings` row deleted on throw. |
| I | `from-bookings` warns (not errors) when bookings have diverging scheduled times > 30 min. | Response includes `warnings[0].code = "TIME_DIVERGENCE"`. |
| J | Capacity has two layers: provider `max_group_size` limits public online groups; group row `max_participants` limits a concrete provider/admin session. | Public booking validates `max_group_size`; provider/admin add/edit routes validate `max_participants`. |

---

## 2. API surface

### Provider — group management

| Endpoint | Method(s) | Auth | Notes |
|----------|-----------|------|-------|
| `/api/provider/group-bookings` | GET, POST | owner/staff/superadmin | List (paginate, filter by status/date, search by ref or title) + create |
| `/api/provider/group-bookings/[id]` | GET, PATCH, POST(?action=), DELETE | owner/staff/superadmin | Detail, update, lifecycle actions, cancel |
| `/api/provider/group-bookings/[id]/participants` | POST | owner/staff/superadmin | Add participant (inline or link existing booking) |
| `/api/provider/group-bookings/[id]/participants/[pid]` | DELETE | owner/staff/superadmin | Remove participant (cancels child booking) |
| `/api/provider/group-bookings/[id]/participants/[pid]/check-in` | POST | owner/staff/superadmin | Idempotent; won't overwrite existing timestamp |
| `/api/provider/group-bookings/[id]/participants/[pid]/check-out` | POST | owner/staff/superadmin | Requires prior check-in; auto-completes group when all checked out |
| `/api/provider/group-bookings/[id]/receipt` | GET | owner/staff/superadmin (+ signed token) | JSON receipt data |
| `/api/provider/group-bookings/[id]/receipt/pdf` | GET | owner/staff/superadmin (+ signed token) | PDF download |
| `/api/provider/group-bookings/[id]/receipt/signed-url` | POST | owner/staff/superadmin | Issues time-limited download token |
| `/api/provider/group-bookings/from-bookings` | POST | owner/staff/superadmin | Link ≥2 existing bookings into one group; warns on time divergence |
| `/api/provider/settings/group-bookings` | GET, PATCH | owner/superadmin | Online booking toggle, max group size, excluded services |
| `/api/admin/group-bookings` | GET | admin providers/ops | Tenant-scoped admin list via provider tenant |
| `/api/admin/group-bookings/[id]` | GET, PATCH, POST, DELETE | admin providers/ops | Admin detail, notes/status edits, start/complete/cancel |

**PostgREST:** Child bookings on `group_bookings` must use `bookings!bookings_group_booking_id_fkey` (never bare `bookings:bookings`) — see `apps/web/src/lib/bookings/group-booking-postgrest.ts`.

### Group lifecycle actions (`POST /api/provider/group-bookings/[id]?action=`)

| Action | Transitions | Notes |
|--------|------------|-------|
| `start_service` | `confirmed/waiting/checked_in → in_progress`; group `→ started` | Best-effort child update (inline-only groups succeed even with no bookings) |
| `complete_service` | `in_progress/confirmed/waiting/checked_in → completed`; group `→ completed` | Widened status filter covers providers who skip individual check-ins |
| `mark_paid` | Records `booking_payments` for each child booking with outstanding balance | Returns `NOT_INVOICED` for inline-only groups, `ALREADY_PAID` if fully settled |
| `refund` | — | Not supported — refund per child booking; returns `GROUP_REFUND_UNSUPPORTED` |

### Customer-facing

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/api/public/providers/[slug]/group-booking-settings` | GET | `enabled`, `maxGroupSize`, excluded services, locations |
| `/api/public/bookings` | POST | Accepts `is_group_booking + group_participants`; creates group + participants atomically |
| `/api/me/group-bookings/[id]/reschedule` | POST | Primary contact only; validates all child booking slots before committing |
| `/api/me/bookings/[id]/cancel` | POST | Cancelling the primary contact's booking cancels the entire group |

---

## 3. Status lifecycle

```
confirmed
   │
   ├─ first check-in ──────────────────────────────┐
   │                                               │
   ├─ start_service action                         ▼
   │                                           started
   │                                               │
   │                                  ┌────────────┤
   │                                  ▼            ▼
   │                          all checked out  complete_service
   │                                  │            │
   └──────────────────────────────────┴────────────▼
                                                completed
                                                
   (any state) ──── provider DELETE or customer cancel ──── cancelled
```

---

## 4. Per-flow QA checklist

### 4.1 Provider portal — create group session

1. Navigate to Group Bookings → New Session.
2. Set date, service, staff, and location (or at-home address).
3. Add participants (inline name + service + price).
4. **Verify**: group created with `status = confirmed`, `total_price` = sum of participant prices + products + travel fee − package discount.
5. **Verify**: exactly one participant has `is_primary_contact = true`.
6. **Verify**: `ref_number` follows the `GB-...` format.
7. **Verify**: creating or adding beyond `max_participants` returns `400 GROUP_CAPACITY_EXCEEDED`; lowering capacity below the current participant count is rejected.

### 4.2 Provider mobile — check-in/check-out flow

1. Open the group in the Group Bookings screen.
2. Tap **Check In** on participant A.
   - **Verify**: `checked_in_at` is set; group status → `started`.
   - **Verify**: tapping **Check In** a second time returns the **original** timestamp (not a new one).
3. Tap **Check Out** on participant B (not yet checked in).
   - **Verify**: returns error `NOT_CHECKED_IN`. Button state reverts.
4. Tap **Check In** on participant B, then **Check Out** on B.
   - **Verify**: `checked_out_at` is set.
5. **Check Out** remaining participants.
   - **Verify**: last check-out auto-sets group `status = completed`.

### 4.3 Provider — complete service shortcut

1. Create a group with 3 participants. Do NOT check anyone in individually.
2. Tap **Complete Service**.
   - **Verify**: all 3 child bookings transition to `completed`.
   - **Verify**: group status → `completed`.
3. Repeat with a provider who taps **Start Service** first, then **Complete Service**.
   - **Verify**: same end state.

### 4.4 Provider — cancel group session

1. Cancel a group with 2 child bookings.
   - **Verify**: both child bookings transition to `cancelled`.
   - **Verify**: group status → `cancelled`.
   - **Verify**: each customer receives a cancellation push notification (OneSignal/email).
   - **Verify**: waitlist matching fires for freed slot.

### 4.5 Provider — remove a participant

1. Remove a non-primary participant from an active group.
   - **Verify**: `booking_participants` row is deleted; linked child booking status → `cancelled`.
   - **Verify**: group `total_price` is recalculated downward.
   - **Verify**: removing the **primary** contact does NOT cascade-cancel the group (only unlinks that booking; primary flag does not prevent removal).

### 4.6 Provider — mark paid

| Scenario | Expected |
|----------|---------|
| Group with inline-only participants (no `booking_id`) **that each have a service** | `200` — `mark_paid` self-heals: it auto-creates a child booking per participant (walk-in customer created from name/phone when no `customer_id`), then records `booking_payments` for each. Scoped to groups with **zero** existing child bookings, so customer online group bookings (primary child booking + guest roster) are never charged per-guest. |
| Group with inline-only participants where a participant has **no service** | `400 NOT_INVOICED` — that participant can't be invoiced; add a service, then record payment again |
| Group with all child bookings already settled | `400 ALREADY_PAID` |
| Group with outstanding balance on one or more child bookings | `200` — `booking_payments` row inserted for each outstanding booking |

### 4.7 Provider — from-bookings grouping

1. Select 2 bookings at the same time. **Verify**: group created, no warnings.
2. Select 2 bookings > 30 min apart. **Verify**: group created with `warnings[0].code = "TIME_DIVERGENCE"`.
3. Select a booking already in a group. **Verify**: `409 CONFLICT`.
4. Force a participant insert failure mid-loop. **Verify**: group row is deleted (no orphan).

### 4.8 Customer — online group booking

1. Customer toggles "Group booking" on checkout.
2. Adds participants with names + emails.
   - **Verify**: web and mobile stop at provider `max_group_size` / `maxGroupSize` and server returns `GROUP_SIZE_EXCEEDED` if bypassed.
3. Submits — payment flows through `POST /api/public/bookings`.
   - **Verify**: `group_bookings` row created with ref `GB-...`.
   - **Verify**: 2 `booking_participants` rows; first one `is_primary_contact = true`.
   - **Verify**: primary contact receives booking confirmation (push/email).
   - **Verify**: registered non-primary participants receive a group-booking email/SMS (check `sendGroupBookingNotifications` resolved without error in logs). Guest-only participant emails with no `users` row are logged and skipped because OneSignal targets registered user IDs.

### 4.9 Customer — reschedule group booking

1. Primary contact reschedules via the web app.
   - **Verify**: slot availability is checked for all child bookings at the shifted time.
   - **Verify**: `booking_events` written with `event_type = rescheduled` for each child booking.
   - **Verify**: reschedule notification sent to each child booking.
2. Non-primary contact attempts reschedule.
   - **Verify**: `403 Unauthorized` response.

### 4.10 Customer — cancel group booking

1. Primary contact cancels their individual booking via the app.
   - **Verify**: entire group cancelled (all child bookings → `cancelled`).
   - **Verify**: each group participant with a user account receives a cancellation notification.
2. Non-primary contact cancels their individual booking.
   - **Verify**: only their booking is cancelled; group continues.

### 4.11 Admin — manage group bookings

1. Open Admin → Providers & operations → Group bookings.
   - **Verify**: group bookings list loads, scoped to the active tenant through provider ownership.
   - **Verify**: search matches group reference or title.
   - **Verify**: status filter narrows rows.
2. Select a group.
   - **Verify**: detail panel shows provider, participants, check-in/out state, total, and links to child bookings.
3. Click **Start**.
   - **Verify**: group status becomes `started`; active child bookings become `in_progress`.
4. Click **Complete**.
   - **Verify**: group status becomes `completed`; active child bookings become `completed`.
5. Click **Cancel**.
   - **Verify**: group status becomes `cancelled`; non-terminal child bookings become `cancelled`.

### 4.12 Customer mobile — group detail screen

1. Open the customer mobile Bookings tab.
   - **Verify**: tapping a booking with `is_group_booking=true` and `group_booking_id` opens `/group-booking-detail` instead of the single booking detail.
2. Open a single booking detail for a group child booking.
   - **Verify**: the Group booking card shows the ref and **View group details** CTA.
3. On Group booking detail.
   - **Verify**: provider, date/time, participant count, total, location, and all participants render.
   - **Verify**: current user's participant row is marked `(you)`.
   - **Verify**: tapping a participant with a child `booking_id` opens that child booking detail.
4. Attempt to load a group where the signed-in user is not a participant.
   - **Verify**: API returns 404 and the screen shows retry/error state.

---

## 5. Edge cases

| # | Case | Expected |
|---|------|---------|
| 1 | Group with 0 participants (`complete_service`) | No child booking updates; group → `completed`. |
| 2 | Check-out when all participants already checked out | Group stays `completed`; idempotent 200 returned. |
| 3 | Provider reschedules group (PATCH `scheduled_at`) with child bookings | All non-terminal child bookings get the same new `scheduled_at`; `booking_services` rescheduled sequentially. |
| 4 | PATCH with `allow_override: true` | Slot availability check skipped — for admin overrides. |
| 5 | Package attached to group | `validateAndPriceGroupPackage` runs; discount reflected in `total_price`; `package_name` returned in GET. |
| 6 | At-home group (`location_type = at_home`) | `travel_fee` included in `group_bookings.total_price`; address fields persisted; `location_id` set to null. The fee is also charged **once**, on the **primary participant's** child booking (`bookings.travel_fee`), so it's collected via `mark_paid` and refundable. If the primary never gets a child booking (walk-in with no `customer_id`), it falls back to the first created child booking — both at create time and during `mark_paid` self-heal — so an at-home travel fee is never stranded uncollected. |
| 7 | GET receipt with signed download token | Token parsed with `parseReceiptDownloadToken`; correct `kind = provider_group_booking_receipt` validated. |
| 8 | Search by partial title | `GET /api/provider/group-bookings?search=yoga` matches both `ref_number` and `title`. |

---

## 6. Known gaps / out of scope

| Gap | Impact | Track |
|-----|--------|-------|
| Group refunds unsupported | Must refund per child booking | `GROUP_REFUND_UNSUPPORTED` — by design |
| Guest-only participant notifications | Participants without a `users` row cannot be targeted by the current OneSignal user-based sender | Requires direct email/SMS provider support |

---

## 7. Test suites

Run all group booking tests:

```bash
pnpm --filter web exec vitest run \
  src/lib/bookings/__tests__/group-booking-package-pricing \
  src/lib/bookings/__tests__/group-capacity \
  src/lib/public-booking/__tests__/group-booking-policy \
  src/lib/provider-booking/__tests__/pick-group-booking-patch-payload \
  src/lib/provider-booking/__tests__/build-merged-group-row-from-group-detail \
  src/app/api/provider/bookings/__tests__/group-synthetic-id-proxy \
  "src/app/api/provider/group-bookings/[id]/participants/[participantId]/__tests__/check-in-check-out"
```

---

## 8. References

- API entry: `apps/web/src/app/api/provider/group-bookings/`
- Core lib: `apps/web/src/lib/bookings/group-booking*.ts`
- Provider mobile screen: `apps/provider/app/(app)/(tabs)/more/group-bookings.tsx`
- Provider web portal: `apps/web/src/app/provider/group-bookings/page.tsx`
- Cancellation helper: `apps/web/src/lib/bookings/group-booking-cancellation.ts`
- Notification helper: `apps/web/src/lib/bookings/group-booking-notifications.ts`
- Public policy: `apps/web/src/lib/public-booking/group-booking-policy.ts`
