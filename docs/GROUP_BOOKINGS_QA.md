# Group Bookings — QA Matrix

> §group-bookings-qa 2026-05 — end-to-end QA pass for the group bookings feature.

This document is the test plan for group bookings across all surfaces.

---

## 1. Architecture invariants

| # | Invariant | Where to verify |
|---|-----------|----------------|
| A | A group booking always has exactly one participant with `is_primary_contact = true`. | `group_bookings.primary_contact_booking_id` must match that participant's `booking_id`. |
| B | Deleting/removing a participant cancels (not deletes) their child booking. | `DELETE /api/provider/group-bookings/[id]/participants/[pid]` — booking status `→ cancelled`, `group_booking_id → null`. |
| C | `total_price` on `group_bookings` is recalculated after participant add/remove and after non-primary customer cancel. | `recalculateGroupBookingTotal` from POST/DELETE participants and `POST /api/me/bookings/[id]/cancel` (non-primary). Recalculate **excludes** roster rows whose linked child booking is `cancelled` / `no_show` (customer cancel keeps roster rows; provider DELETE removes them). See [`recalculate-group-total.ts`](apps/web/src/lib/bookings/recalculate-group-total.ts). |
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
   - **Verify**: if group cascade fails after the primary booking is cancelled, API returns **500** / `GROUP_CANCEL_INCOMPLETE` (not silent success).
2. Non-primary contact cancels their individual booking (requires their own child `bookings` row, e.g. `from-bookings` group).
   - **Verify**: only their booking is cancelled; group continues.
   - **Verify**: `group_bookings.total_price` drops that participant's service price (roster row may remain with `booking_status: cancelled` on group detail).
   - **Verify**: group lifecycle status is synced from remaining child bookings (`syncGroupBookingStatusFromChildren`).

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

### 7.1 Automated QA (local CI parity)

**Web (Vitest)** — full group-booking unit/route slice:

```bash
pnpm --filter web exec vitest run \
  src/lib/bookings/__tests__/group-booking-package-pricing \
  src/lib/bookings/__tests__/group-capacity \
  src/lib/bookings/__tests__/group-booking-status-sync \
  src/lib/bookings/__tests__/group-booking-payment-rollup \
  src/lib/bookings/__tests__/group-booking-postgrest \
  src/lib/bookings/__tests__/group-booking-notifications \
  src/lib/public-booking/__tests__/group-booking-policy \
  src/lib/provider-booking/__tests__/pick-group-booking-patch-payload \
  src/lib/provider-booking/__tests__/build-merged-group-row-from-group-detail \
  src/app/api/provider/bookings/__tests__/group-synthetic-id-proxy \
  "src/app/api/provider/group-bookings/[id]/participants/[participantId]/__tests__/check-in-check-out" \
  "src/app/api/me/group-bookings/[id]/__tests__/route.test"
```

**Shared package (Vitest):**

```bash
pnpm --filter @beautonomi/provider-booking exec vitest run src/validateGroupBookingCreate.test.ts
```

**Provider + customer apps (Jest — these packages do not ship Vitest):**

```bash
pnpm --filter provider test -- __tests__/lib/group-booking-detail-helpers.test.ts __tests__/features/validateGroupBookingCreate.test.ts
pnpm --filter customer test -- __tests__/lib/group-booking-payment-display.test.ts
```

**Extended route + lib coverage (2026-10-11):**

```bash
pnpm --filter web exec vitest run \
  src/lib/bookings/__tests__/recalculate-group-total \
  src/lib/bookings/__tests__/group-booking.test \
  src/app/api/provider/group-bookings/__tests__/route.post.test \
  src/app/api/provider/group-bookings/from-bookings/__tests__/route.test \
  "src/app/api/provider/group-bookings/[id]/__tests__/complete-service.test" \
  "src/app/api/provider/group-bookings/[id]/__tests__/delete-group.test" \
  "src/app/api/me/group-bookings/[id]/reschedule/__tests__/route.test" \
  "src/app/api/me/bookings/[id]/cancel/__tests__/route.group-booking.test" \
  src/app/api/public/bookings/__tests__/route.test.ts
```

**Full web group + adjacent lifecycle slice (recommended dev sign-off):**

```bash
cd apps/web && pnpm exec vitest run \
  src/lib/bookings/__tests__/recalculate-group-total \
  src/lib/bookings/__tests__/group-booking.test \
  src/lib/bookings/__tests__/group-booking-package-pricing \
  src/lib/bookings/__tests__/group-capacity \
  src/lib/bookings/__tests__/group-booking-status-sync \
  src/lib/bookings/__tests__/group-booking-payment-rollup \
  src/lib/bookings/__tests__/group-booking-postgrest \
  src/lib/bookings/__tests__/group-booking-notifications \
  src/lib/public-booking/__tests__/group-booking-policy \
  src/lib/provider-booking/__tests__/pick-group-booking-patch-payload \
  src/lib/provider-booking/__tests__/build-merged-group-row-from-group-detail \
  src/app/api/provider/bookings/__tests__/group-synthetic-id-proxy \
  src/app/api/provider/group-bookings/__tests__/route.post.test \
  src/app/api/provider/group-bookings/from-bookings/__tests__/route.test \
  "src/app/api/provider/group-bookings/[id]/__tests__/complete-service.test" \
  "src/app/api/provider/group-bookings/[id]/__tests__/delete-group.test" \
  "src/app/api/provider/group-bookings/[id]/participants/[participantId]/__tests__/check-in-check-out" \
  "src/app/api/me/group-bookings/[id]/__tests__/route.test" \
  "src/app/api/me/group-bookings/[id]/reschedule/__tests__/route.test" \
  "src/app/api/me/bookings/[id]/cancel/__tests__/route.group-booking.test" \
  src/app/api/public/bookings/__tests__/route.test.ts \
  src/__tests__/api/booking-flow.test.ts \
  src/lib/bookings/__tests__/lifecycle-qa-gaps.test.ts \
  --pool=forks --maxWorkers=2 --testTimeout=60000
```

Expect **118** web Vitest tests when counts are current. Under heavy parallel load, two cancel/me-detail tests use **90s** per-test timeouts to survive cold `import()` of the cancel route graph.

**Provider Jest (include optimistic patch):**

```bash
pnpm --filter provider test -- __tests__/lib/group-booking-detail-helpers.test.ts __tests__/features/validateGroupBookingCreate.test.ts __tests__/features/optimisticGroupPatch.test.ts
```

**Browser E2E (Playwright — requires `E2E_PROVIDER_EMAIL` or `PLAYWRIGHT_PROVIDER_STORAGE`):**

```bash
pnpm --filter web exec playwright test e2e/provider-booking-mobile-shell-matrix.spec.ts --grep group
```

Five scenarios: group quick action shell, group list row → view sheet, create bottom sheet, **optional** POST `/api/provider/group-bookings` on submit (skips if form/seed incomplete), more hub link. Without credentials all **skip** (not fail).

### 7.2 Manual staging QA

Execute §4.1–4.12 in order on **staging** before production release; record pass/fail per step (operator-owned — not runnable in CI).

| § | Scenario | Pass | Notes / build |
|---|----------|------|----------------|
| 4.1 | Provider create session | ☐ | |
| 4.2 | Mobile check-in/out | ☐ | |
| 4.3 | Complete service shortcut | ☐ | |
| 4.4 | Provider cancel group | ☐ | |
| 4.5 | Remove participant | ☐ | |
| 4.6 | Mark paid | ☐ | |
| 4.7 | From-bookings | ☐ | |
| 4.8 | Customer online group | ☐ | |
| 4.9 | Customer reschedule | ☐ | |
| 4.10 | Customer cancel | ☐ | |
| 4.11 | Admin manage | ☐ | |
| 4.12 | Customer mobile detail | ☐ | |

**Dev sign-off (automated):** full command in §7.1 (**118** web + **23** provider + **4** customer + **4** package = **149** tests) + optional Playwright `--grep group`. **Prod sign-off:** §7.2 checklist complete on staging (§10 layer **L6**).

---

## 8. Extended coverage matrix (facts)

| Flow | Implementation | Automated test | Staging §4 |
|------|----------------|----------------|------------|
| `POST /api/provider/group-bookings` create session | [`route.ts`](apps/web/src/app/api/provider/group-bookings/route.ts) — capacity, slot grid, insert group + participants, rollback on participant failure | [`route.post.test.ts`](apps/web/src/app/api/provider/group-bookings/__tests__/route.post.test.ts): validation, capacity, **happy path** (child bookings + primary row), participant insert rollback; not real DB / slot grid without `allow_override` | §4.1 |
| Public `createGroupBooking` helper (online group rows) | [`group-booking.ts`](apps/web/src/lib/bookings/group-booking.ts) — insert group + participants, rollback on link failure | [`group-booking.test.ts`](apps/web/src/lib/bookings/__tests__/group-booking.test.ts) | §4.8 (with `create-booking-record`) |
| `POST /api/me/group-bookings/[id]/reschedule` | [`reschedule/route.ts`](apps/web/src/app/api/me/group-bookings/[id]/reschedule/route.ts) — primary only, slot grid per child, `rescheduleGroupBooking`, events, notifications | [`reschedule/__tests__/route.test.ts`](apps/web/src/app/api/me/group-bookings/[id]/reschedule/__tests__/route.test.ts) (403 non-primary, primary happy path mocked) | §4.9 |
| `DELETE /api/provider/group-bookings/[id]` | [`[id]/route.ts`](apps/web/src/app/api/provider/group-bookings/[id]/route.ts) — cancel by `bookings.group_booking_id`, waitlist, `sendCancellationNotification` per child | [`delete-group.test.ts`](apps/web/src/app/api/provider/group-bookings/[id]/__tests__/delete-group.test.ts) | §4.4 |
| `POST /api/public/bookings` + `is_group_booking` | [`create-booking-record.ts`](apps/web/src/app/api/public/bookings/_helpers/create-booking-record.ts) creates group + roster; route wires draft | Route wiring test in [`public/bookings/__tests__/route.test.ts`](apps/web/src/app/api/public/bookings/__tests__/route.test.ts); **not** full DB E2E | §4.8 |
| Provider/customer UI, admin, live Paystack, push/email | Apps under `apps/web`, `apps/provider`, `apps/customer`, `apps/admin-web` | Playwright shell smoke (§7.1); provider mobile **no** Detox/E2E in repo | §4.1–4.12 |
| Public draft schema + `hold_id` + group flags | [`booking-draft-schema`](apps/web/src/lib/public-booking/booking-draft-schema.ts) | [`booking-flow.test.ts`](apps/web/src/__tests__/api/booking-flow.test.ts) | §4.8 |
| Group organiser for pending expiry | lifecycle helper | [`lifecycle-qa-gaps.test.ts`](apps/web/src/lib/bookings/__tests__/lifecycle-qa-gaps.test.ts) | — |
| Synthetic booking id → group detail proxy | [`bookings/[id]/route`](apps/web/src/app/api/provider/bookings/[id]/route.ts) | [`group-synthetic-id-proxy.test.ts`](apps/web/src/app/api/provider/bookings/[id]/__tests__/group-synthetic-id-proxy.test.ts) | §4.1 |

---

## 10. End-to-end layers (facts)

| Layer | Meaning | Group booking coverage |
|-------|---------|-------------------------|
| **L1** | Pure lib logic | `group-*` Vitest under `src/lib/bookings` |
| **L2** | API handlers (mocked DB) | Provider / me / public route tests (§7.1) |
| **L3** | Schema, proxies, lifecycle | `booking-flow`, `lifecycle-qa-gaps`, synthetic id proxy |
| **L4** | Browser (Playwright) | 5 tests — `provider-booking-mobile-shell-matrix.spec.ts` (`--grep group`) |
| **L5** | Mobile Jest | Provider + customer + `@beautonomi/provider-booking` |
| **L6** | Staging (real DB, Paystack, push) | §7.2 manual only |

**Customer API chain:** public POST → me GET group → reschedule (primary) → cancel (primary cascade / non-primary recalc).

**Provider API chain:** POST group session → check-in/out / complete_service → DELETE (cascade + notify).

No one test executes L1–L6 against production data.

**Automated totals (2026-10-12):** web **118** + provider Jest **23** + customer **4** + package **4** = **149** tests.

---

## 9. References (API & apps)

- API entry: `apps/web/src/app/api/provider/group-bookings/`
- Core lib: `apps/web/src/lib/bookings/group-booking*.ts`
- Provider mobile screen: `apps/provider/app/(app)/(tabs)/more/group-bookings.tsx`
- Provider web portal: `apps/web/src/app/provider/group-bookings/page.tsx`
- Cancellation helper: `apps/web/src/lib/bookings/group-booking-cancellation.ts`
- Notification helper: `apps/web/src/lib/bookings/group-booking-notifications.ts`
- Public policy: `apps/web/src/lib/public-booking/group-booking-policy.ts`
