# Booking Fix Plan (Prioritized)

Priorities: **P0** correctness/money, **P1** operations chaos, **P2** UX drift, **P3** hygiene.

---

## P0 — Correctness / customer harm / money

| ID | Title | Severity | Affected | Root cause | Fix | Effort | Confidence |
|----|-------|----------|----------|------------|-----|--------|------------|
| F-01 | Package discount without item entitlement | ~~Critical~~ **Mitigated** | Package bookings | Was: discount only | **Done:** `service_package_items` quantities; **`is_active`** on catalog package; rejects inactive (`PACKAGE_INACTIVE`). **Still todo:** prepaid session ledger / DB validity columns if product adds them. | M | High |
| F-02 | Group booking ignores provider caps / flags | ~~High~~ **Mitigated** | Group | Was: no server policy | **Done:** **`fetchGroupBookingPolicyFieldsFromDb`** + **`evaluateGroupBookingPolicy`**; **`is_group_booking` ⇔ participants** enforced. Group-booking-settings API uses the same loader. | M | High |
| F-03 | Package session ledger | ~~High~~ **Partial** | Package | Was: no table | **Done:** migration **437** (`customer_package_entitlements`, `redeem_customer_package_entitlement`, optional **`customer_package_entitlement_id`** on draft + **`validateBooking`** + **`createBookingRecord`**). **Todo:** order→entitlement ingestion; **atomic** redeem with booking insert; Playwright E2E. | L | Medium |

---

## P1 — Overbooking / availability / concurrency

| ID | Title | Severity | Root cause | Fix | Effort |
|----|-------|----------|------------|-----|--------|
| F-04 | Availability vs validation drift | High | Multiple engines | **Partial:** **`sumChainedBlockedMinutes`** for **portal**; per-segment **validate**. **Todo:** adopt helper in **public slug** + **step-calendar** total duration; Playwright. | L |
| F-05 | `/api/availability` empty for `staffId=any` | ~~High~~ **Mitigated** | Was: `[]` always | **`providerId`** + union across staff (or synthetic solo); **`step-calendar`** sends **`providerId`** when staff is any. **Still:** portal/other clients must pass **`providerId`** for “any”. | M |
| F-06 | Multi-service different staff | ~~Medium~~ **Mitigated (server)** | Calendar still first-staff | **`validateBooking`** now runs **`checkBookingSnapshotSegmentConflicts`** + per-line **`checkActiveHoldOverlap`** + calendar blocks **per line** after `booking_services` snapshot is built (post random staff). UI alignment remains **P2**. | M |
| F-09 | First-service-only conflict window | ~~High~~ **Mitigated** | Was: one staff + merged duration | Replaced with per-segment checks; advisory **`lockBookingServices`** retained on **first line’s staff** (hold `end_at` or computed block end, buffer 0). | M |

### Tests

- **`src/lib/bookings/__tests__/conflict-check.test.ts`** — `checkBookingSnapshotSegmentConflicts` (multi-segment, overlap, null staff path).
- **`src/lib/public-booking/__tests__/group-booking-policy.test.ts`** — group policy pure rules.
- **`src/lib/availability/__tests__/merge-any-staff-slots.test.ts`** — union of “any staff” slot grids.

---

## P2 — Provider operational safety

| ID | Title | Fix | Effort |
|----|-------|-----|--------|
| F-07 | Provider calendar doesn’t show same blocks as customer | Align provider calendar fetch with `loadAvailabilityConstraints` + booking_services overlaps | M |
| F-08 | Group booking display / receipt | Ensure `group_booking_id` / ref surfaces consistently (partially in portal api) | S |

---

## P3 — Tests & documentation

| ID | Title | Fix | Effort |
|----|-------|-----|--------|
| T-01 | API tests for package entitlement | Vitest/Playwright hitting `POST /api/public/bookings` with wrong service + package_id → 400 | M |
| T-02 | API tests for group max size | Prefer extending **`group-booking-policy.test.ts`**; optional HTTP test over-cap → 400 | M |
| T-03 | Golden path: hold + pay + conflict | E2E on staging | M |

---

## Suggested implementation order

1. **F-04 + T-01** — availability parity (shared duration helper) + package entitlement regression tests.  
2. **F-03** — only after a **customer purchase / session ledger** table exists.  
3. **F-05** — mitigated for **`/booking`**; audit remaining callers of **`/api/availability`** with **`any`**.  
4. **F-01 / F-02 / F-06 / F-09** — landed; keep docs and tests in sync when changing slot math.

---

## Explicit non-goals (this pass)

- Rewriting entire calendar UI  
- Full DST/timezone audit without tenant policy  
- Mobile app (`apps/customer`, `apps/provider`) parity — **separate audit** recommended  

---

*Owner: Platform / Booking squad. Review with product for package session semantics and group staff assignment rules.*
