# Save Address & Distance / Travel Fee (House Calls)

## How save address works

- **Storage:** `user_addresses` table (label, address_line1, address_line2, city, state, postal_code, country, **latitude**, **longitude**, is_default; plus house-call fields: apartment_unit, building_name, floor_number, access_codes, parking_instructions, location_landmarks).
- **API:** `GET/POST/PATCH/DELETE /api/me/addresses` (used by both web and customer mobile app).
- **Saving:** When a user enters or selects an address, they can save it with a label (e.g. Home, Work). The API geocodes via Mapbox when needed and stores lat/lng so the address can be used for distance and travel-fee calculations later.

---

## Does the customer see a list of saved addresses to choose from?

### Web (Next.js)

- **Yes.** In the booking flow, **step-venue-choice** (at-home):
  - If the user has saved addresses, they are shown as selectable cards (label + address line, city; default badge).
  - User can click one to select it, or use “Enter a different address” and pick from Mapbox autocomplete.
  - After selecting (saved or new), the app calls **POST `/api/location/validate`** with the address string and provider_slug. The API returns:
    - `valid`, `travelFee`, `distanceKm`, `coordinates`, `travelTimeMinutes`, `breakdown`.
  - That result is stored in `bookingState.address` and used for the rest of the flow (totals, booking creation). So **distance and travel fee are correct** for web at-home bookings.
  - User can also choose “Save this address for faster checkout next time” after validating a new address (saved via POST `/api/me/addresses`).

### Customer mobile app

- **Saved addresses exist** and are shown in:
  - **Account → Saved addresses** (list, add/edit/delete, set default).
  - **AddressPicker** (used e.g. in product checkout): shows “Saved addresses” + Mapbox search; selection returns label + lat/lng + displayName.
- **Booking flow (at-home):** In **book.tsx** (venue step), when the user chooses “At my location”:
  - Only **manual fields** are shown: “Street address” and “City” (no list of saved addresses, no AddressPicker).
  - Lat/lng sent with the hold come from **device GPS** (`useLocation().coords`), not from the typed address or from a saved address.
  - So the customer **cannot choose from saved addresses** during booking, and the coordinates may not match the typed address (e.g. user types one city but device is in another).

---

## How distance and travel fee are handled

### Web

- User selects or enters address → **POST `/api/location/validate`** (address string + provider_slug).
- API: Mapbox geocodes address → provider location + travel-fee rules → **`computeTravelFee(baseLocation, serviceAddress, travelFeeRules)`** in `travelFeeEngine.ts` → returns fee, distance, time, breakdown.
- `bookingState.address` holds coordinates, travelFee, distanceKm, etc. The **multi-step web flow** uses this when creating the booking (or when creating a hold if the web flow uses holds with pre-validated address). So **distance calculations and house-call travel fees are correct** for web.

### Customer mobile app (hold-based flow)

- **Hold creation (POST `/api/public/booking-holds`):**
  - Accepts `address` (line1, city, country, optional latitude, longitude).
  - Stores only `address_snapshot` in the hold. **No travel_fee or distance is computed or stored** in the hold.
- **GET hold (e.g. for checkout):**
  - Returns `address_snapshot` and other hold fields. It does **not** return `travel_fee` or `travel_distance_km` (they are not in the DB).
  - The app expects `hold.travel_fee` and `hold.travel_distance_km` and shows them in the checkout UI; in practice they are **undefined**, so the app shows **0** for travel fee and no distance. So the **displayed total at checkout is wrong** (missing travel fee).
- **Consume hold → create booking (POST `/api/public/booking-holds/[id]/consume`):**
  - Builds a draft with `address` from `hold.address_snapshot` (line1, city, country, latitude, longitude) and calls **POST `/api/public/bookings`**.
  - The draft does **not** include `travel_fee`.
- **POST `/api/public/bookings` → `validate-booking.ts`:**
  - Uses `travelFee = draft.location_type === "at_home" ? (draft.travel_fee || 0) : 0`. So when `draft.travel_fee` is missing (as in consume), **travel fee is 0**.
  - The booking is created with **travel_fee: 0** and correct address/coordinates. So **travel fee is never applied** for mobile (hold-based) at-home bookings, and distance is only used for address storage and travel buffers, not for pricing.

---

## Summary

| Aspect | Web | Customer mobile |
|--------|-----|------------------|
| List of saved addresses at booking | Yes (step-venue-choice) | No (only Street + City fields) |
| Address → distance / travel fee | Yes (via `/api/location/validate` before booking) | No (hold has no travel_fee; consume doesn’t compute it) |
| Coordinates source | Validated address (Mapbox) | Device GPS at hold creation |
| Travel fee in checkout total | Correct | Shows 0 (not computed for hold) |
| Travel fee on created booking | Correct | 0 (validate uses draft.travel_fee \|\| 0) |

So **save address** works and is used correctly on **web** (list + validate + distance/travel fee). On **mobile**, saved addresses exist and are used elsewhere (e.g. product checkout, AddressPicker), but **not in the at-home booking flow**; and **distance/travel fee are not calculated for hold-based at-home bookings**, so they are wrong for house calls on mobile.

---

## Recommendations

1. **Mobile booking – use saved addresses:** In the at-home venue step, show the same list of saved addresses (from `useAddresses`) and allow the user to pick one, or open AddressPicker (saved + search). When a saved address has lat/lng, use those for the hold; otherwise geocode (e.g. via a small API that returns coords + travel fee for an address string and provider_id).
2. **Mobile – compute travel fee for holds:** Either:
   - **Option A:** When creating the hold (POST `/api/public/booking-holds`), if `address` has lat/lng (or geocode the address), call the same travel-fee logic as `/api/location/validate`, store `travel_fee` and `travel_distance_km` in the hold (e.g. in `metadata` or new columns), and return them in GET hold so checkout shows the correct total; or
   - **Option B:** When consuming the hold, before calling POST `/api/public/bookings`, compute travel fee from `address_snapshot` (e.g. call `/api/location/validate` or an internal helper) and pass `travel_fee` (and optionally distance) in the draft so `validateBooking` uses it and the booking is created with the correct travel fee.
3. **Consistency:** Ensure address used for the hold/booking has a single source of truth (saved address with lat/lng, or validated address from search) so distance and travel fee always match the address the customer chose.

---

## Implementation (done)

- **Backend:** `lib/travel/calculateTravelFeeForHold.ts` computes travel fee and distance from provider_id + address (lat/lng, line1, city, country). POST `/api/public/booking-holds` calls it when `at_home` and address has lat/lng, and stores `travel_fee` and `travel_distance_km` in hold `metadata`. GET hold returns these so checkout shows the correct total. Consume passes `travel_fee` from hold metadata into the booking draft so the created booking has the correct travel fee.
- **Customer app – primary address:** `SelectedAddressProvider` persists the user’s selected address (from home or AddressPicker) to AsyncStorage. Home uses it for “Nearest Providers” and the selection persists until the user changes it elsewhere.
- **Customer app – booking:** In the at-home venue step, the app shows saved addresses (from `useAddresses`), “Enter different address” (opens AddressPicker), and manual Street/City fields. When the user taps “At my location”, the form pre-fills from the primary selected address if set. Selected or entered address coordinates are sent with the hold so travel fee is calculated correctly.
