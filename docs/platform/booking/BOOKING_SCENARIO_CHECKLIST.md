# Booking Scenario Checklist

Use for QA and regression. **Status:** ✓ = covered in code path or automated test, ⚠ = partial / needs env, ✗ = product gap, **E2E** = requires staging browser test.

**Rule:** Passing **`validateBooking`** alone does **not** prove the customer can complete the flow — check UI + slot APIs + server together (see **BOOKING_DOMAIN_AUDIT §14**).

## A. Customer — single service

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| A1 | Service + staff + salon + slot + pay | Booking + payment | ⚠ | **E2E** |
| A2 | At-home + address + travel | `location_type` at_home; buffer matches **`availability_travel_buffer_minutes`** vs `/api/availability` | ⚠ | cross-surface |
| A3 | Slot race / hold | Second user blocked | ✓ | conflict + holds |
| A4 | Min notice | `MIN_NOTICE_NOT_MET` | ✓ | |
| A5 | Inactive offering | 400 | ✓ | |
| A6 | `staffId` **any** + calendar | `/api/availability?providerId=…` returns union | ✓ | C must pass **`providerId`** |

## B. Customer — multi-service

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| B1 | Same staff, sequential | `validateBooking` per-segment conflicts | ✓ | |
| B2 | Duration for slot grid | Sum of durations **+ buffers between** vs **`sumChainedBlockedMinutes`** | ⚠ | **step-calendar** may sum durations only — drift risk |
| B3 | Different staff per line | Server validates each segment | ✓ | **Single** staff grid in UI — **product** |

## C. Package — catalog

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| C1 | Items cover cart | Discount | ✓ | |
| C2 | Wrong service + `package_id` | `PACKAGE_ENTITLEMENT_MISMATCH` | ✓ | |
| C3 | Salon `package_locations` | 400 if blocked | ✓ | |
| C4 | Inactive package | `PACKAGE_INACTIVE` | ✓ | |

## D. Package — prepaid entitlement

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| D1 | Valid `customer_package_entitlement_id` + `package_id` | Redeem RPC; `sessions_remaining` decrements | ⚠ | needs migration **437** + seeded row; **not atomic** with insert |
| D2 | Exhausted sessions | `PACKAGE_ENTITLEMENT_EXHAUSTED` | ✓ | code |
| D3 | Expired `valid_until` | `PACKAGE_ENTITLEMENT_EXPIRED` | ✓ | code |
| D4 | Order creates entitlement | Row in `customer_package_entitlements` | ✗ | **backend + product** (not in this repo pass) |

## E. Group

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| E1 | Within max / online / exclusions | `GROUP_*` codes | ✓ | |
| E2 | `is_group_booking` ⇔ participants | 400 | ✓ | |
| E3 | Recurring + group | Declined | ✓ | `subscribeRecurringEligible` |

## F. Availability surfaces

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| F1 | Public slug `/availability` | Custom engine | ⚠ | differs from `calculateAvailableSlots` |
| F2 | `/api/availability` | `loadAvailabilityConstraints` + `calculateAvailableSlots` | ✓ | |
| F3 | Portal reschedule | **`sumChainedBlockedMinutes`** + optional **`travelBuffer`** | ✓ | default **30** min mobile on reschedule page |
| F4 | `validateBooking` | Per-segment conflicts + calendar | ✓ | authoritative |

## G. Provider vs customer

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| G1 | Walk-in create | `booking_source` walk-in; fees per UI | ⚠ | parity with online validate not fully audited |
| G2 | Online | `booking_source` online | ✓ | |

## H. Reschedule / cancel / refund

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| H1 | Portal reschedule | New time via token | ⚠ | **E2E** |
| H2 | Cancel + policy | `canCancelBooking` | ⚠ | |
| H3 | Package session restore on cancel | Credit back | ✗ | **product + backend** |
| H4 | Group reschedule | `rescheduleGroupBooking` vs portal | ✗ | **cross-surface** |

## I. Booking UI (`/booking`)

| # | Scenario | Expected | Status | Gap type / notes |
|---|----------|----------|--------|------------------|
| I1 | No packages in catalog | Skip **packages** step (unless URL package) | ✓ | `booking-flow` |
| I2 | Sticky CTA | Visible on steps | ⚠ | **E2E** scroll |
| I3 | Pay total | Matches server after POST | ⚠ | preview vs authoritative |

## Automated tests (reference)

- `src/lib/booking-slot-math/__tests__/blocked-window-minutes.test.ts`
- `src/lib/availability/__tests__/merge-any-staff-slots.test.ts`
- `src/lib/bookings/__tests__/conflict-check.test.ts`
- `src/lib/public-booking/__tests__/group-booking-policy.test.ts`
- `src/__tests__/api/booking-flow.test.ts` (draft schema)

---

**Next:** Playwright E2E for **A1**, **D1** (with seed entitlement), and **H1**.
