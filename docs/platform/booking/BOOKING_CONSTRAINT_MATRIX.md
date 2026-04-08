# Booking Constraint Matrix

Legend: **S** = server (`validateBooking` / `POST /api/public/bookings` / related helpers), **C** = client UI only, **P** = public availability API, **A** = `/api/availability`, **—** = not found / unclear.

| Booking type | Actor | Rule / constraint | Enforced today | Server | Client | Gap / duplication | Severity |
|--------------|-------|-------------------|--------------|--------|--------|-------------------|----------|
| All | Customer | Authenticated user for `POST /api/public/bookings` | S | ✓ | ✓ | — | Low |
| All | System | Rate limit booking creation | S | ✓ | — | — | Low |
| All | Customer | Provider belongs to market tenant; not global slug | S | ✓ | — | — | Medium |
| All | Customer | Provider `status === active` | S | ✓ | partial | C may still show cached provider | Medium |
| Salon | Customer | `location_id` required and valid for provider | S | ✓ | partial | — | Low |
| Salon | Customer | Location not `base`-only (no in-studio at that row) | S | ✓ | — | — | Medium |
| Mobile | Customer | Address object required | S | ✓ | partial | — | Low |
| Service | Customer | Offerings active + same provider | S | ✓ | ✓ | Duplicate UX checks | Low |
| Service | Customer | At-home only if offering supports at-home | S | ✓ | partial | — | Medium |
| Service | Customer | Min notice minutes | S | ✓ | P params may duplicate | Drift if UI doesn’t pass same min_notice | High |
| Service | System | Subscription booking limit | S | ✓ | — | Customer message via API | Medium |
| Addon | Customer | Addon active + provider; location restrictions | S | ✓ | — | — | Medium |
| Product | Customer | Price/variant/stock server-authoritative | S | ✓ | C displays estimates | Correct pattern | Low |
| Package | Customer | `package_id` belongs to provider; **catalog active** | S | ✓ (`is_active`) | — | `PACKAGE_INACTIVE` | Low |
| Package | Customer | Package allowed at salon `location_id` when restricted | S | ✓ | — | — | Medium |
| Package | Customer | **Booked services ⊆ package items (qty)** | S | ✓ | ✗ | Legacy packages with **zero** `service_package_items` rows skip strict check | **Medium** |
| Package | Customer | **Prepaid session** (`customer_package_entitlement_id`) | S | ✓ (migration **437** + `PACKAGE_ENTITLEMENT_*`) | ✗ | **Commerce must create rows**; redeem not atomic with insert | **Medium** |
| Portal | Customer | Reschedule slot span vs booking | S | ✓ (`sumChainedBlockedMinutes`) | partial | **`travelBuffer`** default **30** on reschedule page — align with `getTravelBuffer` | Medium |
| Group | Customer | Participant offerings valid | S | ✓ | — | — | Medium |
| Group | Customer | **Max size / online / exclusions / locations** (same DB as group-booking-settings) | S | ✓ (`fetchGroupBookingPolicyFieldsFromDb` + `evaluateGroupBookingPolicy`) | partial | Codes: `GROUP_*` | **Low** |
| Group | Customer | **`is_group_booking` ⇔ participants** | S | ✓ | — | `GROUP_PARTICIPANTS_REQUIRED` / `VALIDATION_ERROR` | Low |
| Group | System | Recurring not with group | S | ✓ (`subscribeRecurringEligible`) | — | — | Low |
| Staff | Customer | Staff id normalized to DB | S | ✓ (`POST` body map) | — | — | Low |
| Staff | Customer | Active on provider + **offering_staff** when restricted | S | ✓ | — | `STAFF_INVALID`, `STAFF_OFFERING_MISMATCH` | Medium |
| Staff | Customer | No double-book (**per scheduled segment** + buffer) | S | ✓ (`checkBookingSnapshotSegmentConflicts`) | — | Must match slot math; solo null staff → provider-wide | High |
| Hold | Customer | Active hold, same provider | S | ✓ | — | — | Medium |
| Hold | System | Hold overlap blocks without hold_id (**per segment**) | S | ✓ (`checkActiveHoldOverlap` each line) | — | — | Medium |
| Concurrency | System | Advisory lock after segment checks | S | ✓ (`lockBookingServices` first line staff) | — | Full multi-staff serialization not one lock | Medium |
| Availability | Customer | Slot shown matches bookable window | P / A | partial | ✓ | **Multi-pipeline drift** | **High** |
| Availability | Customer | `staffId=any` on `/api/availability` | A | **union slots** if **`providerId`** set; else **[]** | ✓ (`step-calendar` passes `providerId`) | Portal/other callers must pass **`providerId`** for “any” | **Medium** |
| Resource | Customer | Required resources available | S | ✓ | — | — | Medium |
| Reschedule | Customer | Own booking; not cancelled; policy allows | S | ✓ | — | — | Medium |
| Payment | Customer | Total matches server computation | S | ✓ | C shows preview | No client-supplied **service** total; products have `totalPrice` in schema but server validates stock/variant | Low |

### Recommended source of truth

| Concern | Source of truth |
|---------|-----------------|
| Money, tax, discounts, stock | **`validateBooking`** output → `createBookingRecord` / `processPayment` |
| Slot legibility (customer) | **`GET /api/public/providers/[slug]/availability`** and **`GET /api/availability`** (`duration` / `travelBuffer` / `providerId`+`any`) should match **`validateBooking`** duration/travel/hold |
| Staff calendar / portal | **`loadAvailabilityConstraints` + `calculateAvailableSlots`** — align params with reschedule validation |
| Package entitlement | **`service_package_items`** (catalog) + optional **`customer_package_entitlements`** (prepaid) in **`validateBooking`** |
| Group policy | **`fetchGroupBookingPolicyFieldsFromDb`** (same source as group-booking-settings) + **`evaluateGroupBookingPolicy`** in `validateBooking` |
