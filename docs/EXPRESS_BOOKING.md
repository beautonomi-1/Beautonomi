# Express Booking — Implementation Summary

"Express Booking" is the public online booking flow (Liquid Glass design system) at `/book/[providerSlug]` and `/book/continue`. All **dynamic** content is sourced from APIs; only UI copy and fallbacks are static.

---

## 1. Entry & provider resolution

| What | Source | Notes |
|------|--------|--------|
| Provider (id, slug, business_name) | **API** `GET /api/public/providers/[slug]` | 404 if not found or inactive. |
| Online booking enabled | **API** (same + `GET …/online-booking-settings`) | Flow only renders if enabled. |

**Files:** `apps/web/src/app/book/[providerSlug]/page.tsx`

---

## 2. Main booking flow (`OnlineBookingFlowNew`)

### 2.1 Data loaded from APIs (all dynamic)

| Data | API | Used for |
|------|-----|----------|
| **Offerings (services)** | `GET /api/public/providers/[slug]/offerings` | Service list, prices, duration, currency. |
| **Staff** | `GET /api/public/providers/[slug]/staff` | Staff step; "Anyone" when `staff_selection_mode` allows. |
| **Locations** | `GET /api/public/providers/[slug]` → `data.locations` | Venue step (at salon branches). |
| **Online booking settings** | `GET /api/public/providers/[slug]/online-booking-settings` | `min_notice_minutes`, `max_advance_days`, `staff_selection_mode`, `require_auth_step`, `allow_online_waitlist`, etc. |
| **Packages** | `GET /api/public/providers/[slug]/packages` | Package options on services step. |
| **Service variants** | `GET /api/public/providers/[slug]/services/[id]/variants` (per service) | Variants per offering. |
| **Provider forms** | `GET /api/public/provider-forms?provider_id=…` | Intake step (provider-specific forms). |
| **Booking custom field definitions** | `GET /api/custom-fields/definitions?entity_type=booking` | Intake step (platform custom fields). |
| **Add-ons** | `GET /api/public/providers/[slug]/services/[offeringId]/addons` | Add-ons step (after primary service selected). |
| **Availability slots** | `GET /api/public/providers/[slug]/availability?date=…&service_id=…&staff_id=…&duration_minutes=…&location_id=…&min_notice_minutes=…&max_advance_days=…` | Schedule step slots. |
| **Cancellation policy** | `GET /api/public/cancellation-policy?provider_id=…&location_type=…` | Review step policy text and cutoff. |
| **Create hold** | `POST /api/public/booking-holds` | Creates hold with services, slot, address (with optional lat/lng for travel). |
| **Geocoding (at-home)** | `POST /api/mapbox/geocode` | Fallback when address has no lat/lng (travel fee calculation). |

### 2.2 Derived in UI (from API data)

- **Categories:** Derived from offerings’ `provider_categories` (or provider_category_id). Fallback labels for uncategorised: "Other Services" / "Services" when list would otherwise be empty — structure still from offerings.
- **Step order:** Derived from `staff_selection_mode` from API (e.g. staff step shown only when `client_chooses`).
- **Settings defaults:** Initial state uses fallbacks (e.g. 60 min notice, 90 days) only until the first API response; thereafter all from API.

### 2.3 Static / copy only (not provider content)

- Step names and flow order (venue → category → services → addons → [staff] → schedule → intake → review).
- Default currency fallback `"ZAR"` when no service currency (e.g. empty selection).
- Copy: "No preference" / "Anyone available" for the "any" staff option.
- Toast messages (e.g. "No available slots in the next two weeks").
- Design tokens and platform name in `book/constants.ts` (e.g. `PLATFORM_NAME`).

**Files:** `apps/web/src/app/book/components/OnlineBookingFlowNew.tsx`, `booking-engine/*` (StepVenue, StepCategory, StepServices, StepAddons, StepStaff, StepSchedule, StepIntake, StepReview).

---

## 3. Continue / checkout page (`/book/continue`)

### 3.1 Data from APIs

| Data | API | Used for |
|------|-----|----------|
| **Hold details** | `GET /api/public/booking-holds/[id]` | Services snapshot, times, location, address, travel_fee, travel_distance_km, provider_slug, etc. |
| **Provider settings** | `GET /api/public/provider-online-booking-settings?provider_id=…` | `allow_pay_in_person`, **tip_suggestions** (preset tip amounts). |
| **Provider forms** | `GET /api/public/provider-forms?provider_id=…` | Form definitions for checkout. |
| **Add-on details** | `GET /api/public/providers/[slug]/services/[offeringId]/addons` | Names and prices for selected add-ons in summary. |
| **Booking custom definitions** | `GET /api/custom-fields/definitions?entity_type=booking` | Additional details section. |
| **Promo validation** | `GET /api/public/promo-codes/validate?code=…&amount=…` | Discount value for summary. |
| **Consume hold (create booking)** | `POST /api/public/booking-holds/[id]/consume` | Creates booking with client info, add-ons, forms, custom fields, tip, payment method. |

### 3.2 Static / copy only

- Location label when `location_type === "at_salon"`: "At salon" (fallback when no address).
- Tip suggestions default to `[0, 50, 100, 150, 200]` only when API does not return `tip_suggestions`; otherwise **tip amounts come from API** (provider-online-booking-settings).
- Section headings and labels (e.g. "Booking summary", "Booking details", "Add a tip (optional)").

**Files:** `apps/web/src/app/book/continue/page.tsx`

---

## 4. Address & travel (house calls)

- **Address:** Map/geocode via `AddressAutocomplete` (Mapbox) and optional `POST /api/mapbox/geocode`. Address and lat/lng stored in booking data and sent with hold.
- **Travel fee / distance:** Calculated on the backend when creating the hold (using address coordinates or geocode result). Hold response includes `travel_fee` and `travel_distance_km`; continue page shows them in the summary.

---

## 5. Waitlist

- **Submit:** `POST /api/public/waitlist` from schedule step when no slots available (if waitlist enabled in settings).

**Files:** `apps/web/src/app/book/components/booking-engine/StepSchedule.tsx`

---

## 6. API vs static summary

| Area | From API | Static / fallback only |
|------|----------|-------------------------|
| Provider info | ✅ | — |
| Services, packages, variants | ✅ | — |
| Staff, locations | ✅ | — |
| Add-ons | ✅ | — |
| Slots & availability | ✅ | — |
| Online booking settings (notice, advance days, staff mode, waitlist, pay in person, tip_suggestions) | ✅ | Initial client defaults until first response |
| Cancellation policy | ✅ | Default policy text if no DB policy |
| Provider forms & booking custom fields | ✅ | — |
| Hold & booking creation | ✅ | — |
| Promo validation | ✅ | — |
| Tip preset amounts | ✅ (tip_suggestions from settings API) | Default array if API omits it |
| Step order | Derived from API (staff_selection_mode) | Step identifiers (venue, category, …) |
| Categories | Derived from offerings | Fallback labels "Other Services" / "Services" |
| Copy (labels, toasts, "At salon", "No preference") | — | ✅ |
| Design constants (colors, radii, PLATFORM_NAME) | — | ✅ |

---

## 7. File reference

- **Entry:** `apps/web/src/app/book/[providerSlug]/page.tsx`
- **Main flow:** `apps/web/src/app/book/components/OnlineBookingFlowNew.tsx`
- **Steps:** `apps/web/src/app/book/components/booking-engine/` (StepVenue, StepCategory, StepServices, StepAddons, StepStaff, StepSchedule, StepIntake, StepReview), `BookingNav`, `BookingStepper`
- **Continue:** `apps/web/src/app/book/continue/page.tsx`
- **Types:** `apps/web/src/app/book/types/booking-engine.ts`
- **Constants:** `apps/web/src/app/book/constants.ts`
