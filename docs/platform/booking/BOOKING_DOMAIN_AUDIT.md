# Booking Domain Audit

**Date:** 2026-04-05  
**Scope:** Customer web booking (`/booking`, `/book`), `POST /api/public/bookings`, public availability, internal availability helpers, provider tooling (partial), packages, groups, staff, holds, recurring hooks.  
**Method:** Code-path and schema-usage inspection (not full E2E QA in production).

### Cross-platform parity (where fixes apply)

| Area | Customer web | Customer native | Provider web | Provider mobile | Notes |
|------|--------------|-----------------|--------------|-----------------|-------|
| **Package URL prefill** | `booking-flow.tsx` | `book/index.tsx` | — | — | Shared **`@beautonomi/utils`**: `resolvePackageOfferingsFromFlatMenu`, `flattenProviderServicesToMenu` (variant-aware menu resolution). |
| **Staff shifts `[id]`** | API `apps/web` | Same API | Same API | Same API | **`resolveProviderStaffRowId`** on server — accepts `provider_staff.id` or linked **`user_id`**. |
| **Calendar staff columns / h-scroll** | `CalendarGrid` | — | — | Different bookings UI | Web-only layout fix. |
| **Inline search focus** | — | `InlineSearch.tsx` | — | — | Customer app only. |

---

## 1. Executive Summary

The platform implements a **server-authoritative booking creation path** centered on `POST /api/public/bookings`, with **`validateBooking`** as the primary enrichment, pricing, conflict, resource, and policy gate before `createBookingRecord` and `processPayment`. This is the correct architectural anchor for money, capacity, and state.

Residual **product / cross-surface** gaps (backend alone ≠ end-to-end correctness):

- **Prepaid package sessions:** Migration **`437`** + **`438`** — entitlements; **`redeem`** / **`restore`** RPCs; paid **product orders** whose line items map to **`service_package_items.product_id`** grant sessions via **`ensurePackageEntitlementsFromProductOrder`** (after **`recordProductOrderPayment`**). **`create_booking_with_locking`** (migration **438**) redeems in the **same transaction** as the booking insert. **Customer cancel** (`POST /api/me/bookings/[id]/cancel`) calls **`restore_customer_package_entitlement`**. Payment step exposes **`GET /api/me/package-entitlements`** + dropdown when a catalog package is selected. **E2E** staging proof still recommended.
- **Catalog-only packages:** **`service_package_items`** quantities (primary + group); legacy packages with **no** item rows still skip strict matching.
- **Group bookings:** Policy + consistency rules on server; **per-participant staff** remains a **product** decision; UI still uses **first-service staff** for `/api/availability` duration.
- **Availability:** **`sumChainedBlockedMinutes`** + cart helpers align **`validateBooking`** and **`/api/availability`**. **`GET /api/public/providers/[slug]/availability`** now uses **`loadAvailabilityConstraints` + `calculateAvailableSlots`** (see **`public-slug-availability-engine.ts`**) with **`publicCalendarParity`** for **`availability_blocks`**, staff time off, and days off — same core as portal and provider calendar. Multi-**`service_ids`** still resolves span via **`publicSlugSpanParamsFromSlices`**. Optional **`travel_buffer_minutes`** aligns at-home buffer with **`/api/availability`**. **`/api/availability`** still requires **`providerId`** when **`staffId`** is **`any`**. Residual edge drift: **`working_hours` JSON breaks** (legacy loop modeled breaks; engine uses shifts + time blocks unless mirrored in DB).

**Production readiness:** **Go with tests + monitoring** for core online booking; **entitlement redemption** requires **DB migration applied** + **data population** before customer-facing “sessions”.

---

## 2. Booking Domain Model (as implemented)

| Concept | Primary representation | Notes |
|--------|-------------------------|--------|
| **Booking** | `bookings` | `provider_id`, `customer_id`, `scheduled_at`, `location_id`, `location_type`, `status`, `tenant_id`, group FKs as used |
| **Booking services** | `booking_services` | Per-line `offering_id`, `staff_id`, `scheduled_start_at` / `scheduled_end_at`, duration |
| **Hold** | `booking_holds` | `hold_id` on draft; `end_at` defines conflict window when present |
| **Draft (API)** | `bookingDraftSchema` / `BookingDraft` | Normalized staff ids; `package_id`, optional **`customer_package_entitlement_id`**, `group_participants`, `resource_ids`, `availability_travel_buffer_minutes`, `subscribe_recurring` |
| **Package (catalog)** | `service_packages` + `service_package_items` | **`validateBooking` enforces** booked offerings ⊆ items (qty); legacy packages with **no** item rows skip strict check |
| **Package (prepaid)** | `customer_package_entitlements` | Optional **`customer_package_entitlement_id`** on draft; redeem RPC + FK on `bookings` |
| **Group** | `is_group_booking` + `group_participants[]` | Participant `service_ids`; duration via `calculateGroupBookingDuration` |
| **Staff** | `provider_staff`, synthetic ids via `@beautonomi/utils` | Normalized in route to DB FK |
| **Resources** | `resource_ids` + `getRequiredResourcesForOffering` / `checkResourceAvailability` | Enforced in validate path |
| **Payment** | `processPayment` after row insert; failure triggers slot release | See payment helper |
| **Recurring** | `subscribe_recurring` + `subscribeRecurringEligible` | Blocked for reschedule and group bookings |

---

## 3. Service Booking Rules

**Explicit (server):**

- At least one service; each `offering_id` must be **active** and **same provider**.
- **At-home:** offerings must `supports_at_home`.
- **At-salon:** `location_id` required; location must be **active**, belong to provider, and not `location_type === "base"` (distance-only).
- **At-home:** structured `address` required.
- **Provider** active; **tenant** market checks on route (`requirePublicTenant`, global slug block).
- **Min notice** from `provider_online_booking_settings.min_notice_minutes` (default 60 if missing).
- **Subscription booking limit** via `checkBookingLimit` after ensuring free subscription row.
- **Addons:** provider-owned, active; salon location restrictions via `addon_locations`.
- **Products:** server recomputes unit/total; variant required when `has_variants`; stock checks.
- **Conflicts:** After `booking_services` snapshot is built (post random “any staff” assignment): **`checkActiveHoldOverlap` per segment**, **`checkBookingSnapshotSegmentConflicts` per segment** (staff-scoped or provider-wide when `staff_id` null), then **`lockBookingServices`** on **first line’s staff** over **hold `end_at`** (hold flow) or **first start → last segment end + buffer** (non-hold). Buffer rules in `conflict-check.ts`.
- **Calendar blocks:** additional checks aligned with public availability (see validate-booking “Provider calendar blocks”).

**Implied / partial:**

- **Staff–service eligibility:** **Enforced in `validate-booking.ts`:** assigned staff must be **active `provider_staff`** for the provider; if **`offering_staff`** has rows for an offering, staff must appear in that set (`STAFF_OFFERING_MISMATCH` / `STAFF_INVALID`).
- **Multi-service same staff:** Calendar via `/api/availability` still uses **one `staffId`**; server validates **each segment’s** staff against conflicts and calendar blocks.

---

## 4. Package Booking Rules

**Implemented:**

- Optional `package_id`; must belong to provider; **`is_active`** must be true (`PACKAGE_INACTIVE` otherwise).
- Salon + `location_id`: if package has any `package_locations` rows, selected location must be allowed.
- Discount: fixed `price` (vs services subtotal) or `discount_percentage`.

**Prepaid sessions (when entitlement id is sent):**

- **`validateBooking`:** row exists, `customer_id` / `provider_id` / `package_id` match, `sessions_remaining ≥ 1`, `valid_from` / `valid_until` vs `now`.
- **`createBookingRecord`:** passes **`p_entitlement_id`** / **`p_entitlement_customer_id`** into **`create_booking_with_locking`** (migration **438**) so redeem runs in the **same DB transaction** as the booking row + **`booking_services`** insert.

**Still risky:**

- **Legacy catalog packages** with **no** `service_package_items` rows: discount without item matrix.
- **Ecommerce → entitlement** only when a product is linked to a package via **`service_package_items.product_id`**; other merchandising models may need extra rules.

---

## 5. Group Booking Rules

**Implemented:**

- Merges participant `service_ids` into offering fetch set; validates each offering.
- **Policy:** **`fetchGroupBookingPolicyFieldsFromDb`** (shared with group-booking-settings API) + **`evaluateGroupBookingPolicy`** — max size, online flag, exclusions, enabled salon locations.
- **Consistency:** cannot send **`is_group_booking` without `group_participants`** (or vice versa) — **`GROUP_PARTICIPANTS_REQUIRED`** / **`VALIDATION_ERROR`**.
- `calculateGroupBookingDuration` for conflict window and booking services assembly (see validate-booking).
- Recurring subscription explicitly **disallowed** for group in `subscribeRecurringEligible`.

**Residual:**

- **Per-participant staff** vs single staff for whole group — product semantics must stay explicit; server validates primary line staff + policies above.

---

## 6. Staff Assignment Rules

- **`POST /api/public/bookings`** normalizes public/synthetic staff ids to **DB `provider_staff` ids** (synthetic `provider-{uuid}` → `null` for FK) before `validateBooking`.
- **Active provider staff** + **`offering_staff`** restriction when configured (see §3).
- Conflicts: **per scheduled segment** on `booking_services` (see `checkBookingSnapshotSegmentConflicts`); **null staff** uses **provider-wide** overlap (`checkBookingConflictForProvider`).
- **`GET /api/availability`:** pass **`providerId`** (provider UUID) when **`staffId`** is **`any`** / omitted — returns **union** of slots across active staff (or synthetic solo staff). Without **`providerId`**, **`any`** still yields **[]**.

---

## 7. Availability Engine Assessment

| Entry point | Role |
|-------------|------|
| `GET /api/public/providers/[slug]/availability` | Primary **customer** express flow; supports `duration_minutes`, `buffer_minutes`, `service_ids`, `excludeHoldId`, min/max advance |
| `GET /api/availability` | `loadAvailabilityConstraints` + `calculateAvailableSlots`; **`staffId=any`** + **`providerId`** = union; mobile `travelBuffer` |
| Portal / reschedule | `loadAvailabilityConstraints` + `calculateAvailableSlots`; duration via **`sumChainedBlockedMinutes`** (`blocked-window-minutes.ts`); optional **`travelBuffer`** query (reschedule passes **30** min default for at-home today) |

**Risks:**

- **Drift** between what UI shows and what `validateBooking` enforces (duration + `availability_travel_buffer_minutes`, hold `end_at`, buffers).
- **Public slug** (`[slug]/availability`) vs **`/api/availability`**: different engines; callers should pass **`duration_minutes` + `buffer_minutes`** (split from the same chained slices as **`publicSlugSpanParamsFromSlices`**) so the **numeric** span matches **`sumChainedBlockedMinutes`**, even though the **slot iteration** logic still differs from **`calculateAvailableSlots`**.
- **`step-calendar`** uses **`slicesFromBookingCart`** + **`availabilityRouteDurationMinutes`** for **`/api/availability`** `duration`; **legacy persisted sessions** without **`bufferMinutes`** on services may still under-count until the user re-selects services.
- **Race:** holds + per-segment checks + advisory lock on first staff reduce but do not eliminate all races (e.g. two staff on same booking only get lock on first line’s staff window; DB uniqueness and transactional create still matter).

---

## 8. Pricing and Payment Assessment

- **Subtotals** for services (incl. at-home adjustment), addons, products, travel, package discount, promos, membership, tax, service fee, tip — computed in `validateBooking` (authoritative for creation/payment). **Service line prices from the client are not trusted** for the final total; product rows carry `totalPrice` in the schema but server recomputes where stock/variant rules apply.
- **Catalog package discount** requires **item entitlement** when `service_package_items` exist (see §4).

---

## 9. Customer vs Provider Consistency

- Provider portal APIs enrich bookings with group flags (e.g. `provider-portal/api.ts` patterns).
- **Risk:** Provider calendar mobile/web may not show the same blocking semantics as customer slot picker if they use different availability entry points.
- **Risk:** Package-backed booking may **look** like a normal discount on one side without redemption metadata on the other if DB doesn’t store package id consistently (verify `createBookingRecord`).

---

## 10. Scenario Matrix and Coverage (summary)

See **`BOOKING_SCENARIO_CHECKLIST.md`** for the full checklist.  
**Well-covered in code (relative):** auth required for creation, tenant/market guard, min notice, inactive provider, bad location, hold invalid, conflict 409, subscription limit, server product pricing, reschedule cancel of old booking with policy check.

**Weak / uncovered:** E2E Playwright for full checkout; **public slug** vs **`calculateAvailableSlots`** parity; **reschedule** refund rules for package-backed bookings; **group** reschedule (`rescheduleGroupBooking` vs customer portal reschedule).

---

## 11. Findings and Gaps (prioritized titles)

1. ~~**Populate entitlements from commerce**~~ — **Partial** — **`ensurePackageEntitlementsFromProductOrder`** on paid product orders (package-linked products).  
2. ~~**Atomic redeem + insert**~~ — **Done** — **migration 438** (`create_booking_with_locking` + redeem in one transaction).  
3. **Public slug vs portal vs `/api/availability` math** — Medium — **cross-surface** — shared **numeric** helpers adopted; **slug route still a different engine** (documented in §7).  
4. **Legacy catalog packages without `service_package_items`** — Medium.  
5. **Multi-staff advisory lock** — Low — lock on first line only; segments cover overlaps.

---

## 12. Recommended Fixes

See **`BOOKING_FIX_PLAN.md`** and **§14 Booking Product Completeness Delta**.

---

## 13. Production Readiness Verdict

| Area | Verdict |
|------|---------|
| Single-service + hold + pay | **Conditional go** — strong server path; monitor conflict false positives (buffer doubling documented in code). |
| Packages | **Conditional go** catalog + **prepaid** once migration **437** applied and entitlements populated; monitor redeem failures. |
| Groups | **Conditional go** when provider policy fields are populated; confirm UX vs server codes. |
| Recurring | **Partial** — eligibility guard exists; full recurrence vs availability not audited here in depth. |

**Overall:** Treat **booking as a product**: verify UI steps, slot APIs, and **`validateBooking`** together per **`BOOKING_SCENARIO_CHECKLIST.md`**.

---

## 14. Booking Product Completeness Delta

This section records **what “done” means for the booking product**, not only the API. Surfaces: **customer `/booking`**, **public availability**, **`/api/availability`**, **portal reschedule**, **provider calendar / create appointment**, **`validateBooking`**, **payments/refunds**.

| Theme | What’s in place | What’s still missing | Primary gap type |
|-------|-----------------|----------------------|------------------|
| **Package ledger** | **437** + **438**; order-paid hook; atomic redeem; cancel restore; payment-step entitlement picker | Merchandise beyond **`service_package_items.product_id`**; provider-cancel restore | Backend + product |
| **Availability parity** | Shared **`blocked-window-minutes`** for **portal** + **`/api/availability`** + validate; `any`+`providerId` | Public **slug** route still separate **engine** (not `calculateAvailableSlots`); persisted carts without **`bufferMinutes`** | Cross-surface |
| **Any staff** | `"any"` staff id + union slots when **`providerId`** set | Multi-service **different** staff per line not reflected in single calendar grid | Frontend + product |
| **Provider vs customer** | `booking_source` walk-in vs online; fees differ in UI | Full parity of conflict/calendar rules on provider create vs `validateBooking` not proven here | Cross-surface |
| **Package + group + staff** | Server validates group policy + package items + staff/offering_staff | Combined E2E tests; group reschedule story | Product + test |
| **Reschedule / cancel / refund** | Portal reschedule; cancellation policy APIs; **customer** cancel restores **`restore_customer_package_entitlement`** | Provider cancel restore; group reschedule path vs **`rescheduleGroupBooking`** | Backend + product |
| **Booking UI** | Skip **packages** step when catalog empty (unless URL package); sticky bar exists | Dynamic skip for addons/products when irrelevant; CTA always reflects server-priced total; full **E2E** | Frontend + test |

**Proof bar:** Automated **API + unit** tests reduce risk; **staging E2E** (Playwright) is still the bar for “customer can complete booking” claims.

---

## Evidence index (code)

- `apps/web/src/app/api/public/bookings/route.ts` — orchestration  
- `apps/web/src/lib/public-booking/booking-draft-schema.ts` — request shape  
- `apps/web/src/app/api/public/bookings/_helpers/validate-booking.ts` — rules  
- `apps/web/src/lib/bookings/conflict-check.ts` — overlap + buffers + `checkBookingSnapshotSegmentConflicts`  
- `apps/web/src/lib/public-booking/group-booking-policy.ts` — pure group rules  
- `apps/web/src/lib/public-booking/group-booking-policy-db.ts` — shared DB load for policy + group-booking-settings API  
- `apps/web/src/lib/availability/merge-any-staff-slots.ts` — union slots for `staffId=any`  
- `apps/web/src/lib/booking-slot-math/blocked-window-minutes.ts` — chained duration for portal vs validate  
- `apps/web/supabase/migrations/437_customer_package_entitlements.sql` — prepaid entitlements + redeem RPC  
- `apps/web/supabase/migrations/438_booking_entitlement_atomic_rpc.sql` — atomic `create_booking_with_locking` + redeem; restore RPC  
- `apps/web/src/lib/orders/ensure-package-entitlements-from-product-order.ts` — grant sessions after paid order  
- `apps/web/src/app/api/me/package-entitlements/route.ts` — list credits for payment step  
- `apps/web/src/app/api/public/providers/[slug]/availability/route.ts` — public slots  
- `apps/web/src/app/api/availability/route.ts` — staff slots; `any` + `providerId` union  
- `apps/web/src/app/booking/components/steps/step-calendar.tsx` — calls `/api/availability`  
- `apps/web/src/lib/recurring/subscribe-recurring-eligibility.ts` — recurring guards  

---

*Confidence: High for cited files; Medium for staff–service matrix and full recurring engine without reading every import.*
