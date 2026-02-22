# Provider locations – column alignment

## Schema (source of truth)

- **`provider_locations`** (see `supabase/migrations/003_providers.sql`): uses **`latitude`** and **`longitude`** (no `address_lat` / `address_lng`).
- **`bookings`** (see `supabase/migrations/005_bookings.sql`): customer address coordinates are **`address_latitude`** and **`address_longitude`** (no `address_lat` / `address_lng`).

## Aligned usage

All code that reads or writes provider location coordinates should use **`latitude`** and **`longitude`** for `provider_locations`. All code that reads/writes booking customer address coordinates should use **`address_latitude`** and **`address_longitude`** for `bookings`.

### provider_locations (latitude / longitude)

- **`/api/location/validate`** – selects `latitude, longitude` from `provider_locations`; uses them (with fallback to `address_lat`/`address_lng` for backward compat) for distance and travel fee.
- **`/api/provider/zone-selections/suggest`** – selects `latitude, longitude` from `provider_locations` for zone suggestions.
- **`/api/provider/routes/optimize`** – selects `latitude, longitude` from `provider_locations` for route start; uses `address_latitude`, `address_longitude` from `bookings` for at-home stops.
- **`lib/travel/calculateTravelFeeForHold`** – selects `latitude, longitude` from `provider_locations` (with fallback) for hold travel fee.
- **Provider settings UI** (e.g. service-zones page) – uses `latitude` / `longitude` from the locations API response (with fallback to `address_lat`/`address_lng`).

### bookings (address_latitude / address_longitude)

- **`/api/provider/routes/optimize`** – selects `address_latitude`, `address_longitude` from `bookings` for at-home booking stops.
- Create/update booking flows – write customer address coords to `address_latitude`, `address_longitude`.

## Why this matters

- Travel fee and distance for at-home bookings depend on provider base location (`provider_locations.latitude/longitude`) and customer address (`bookings.address_latitude/address_longitude`). Using the wrong column names would return null and break calculations.
- Route optimization uses the same provider and booking coordinates; alignment keeps behaviour consistent across location validate, hold creation, and provider route tools.

---

## Freelancer location semantics

Freelancers are providers with no other staff; they *are* the staff of their business. Their “location” is where they operate from (e.g. home or a single base).

### What’s automatic

- **Staff:** Migrations ensure the provider owner has a staff record and is assigned to the provider’s locations (`ensure_freelancer_staff`, `auto_assign_freelancers_to_locations`).
- **Single location as base:** When a freelancer has no `provider_locations` row, a row can be auto-created from their user/profile address (e.g. `ensure_freelancer_location`). That single location is their base for:
  - **Travel fee / distance** – calculated from this base to the customer address.
  - **Home page distance** – see below (primary/first location per provider).
- **Coordinates:** The auto-created location is created from address text only; **latitude/longitude are not set** by that migration. So until the freelancer sets their location (e.g. in provider settings or via a location picker), the base may have null coords. In that case they may be excluded from “nearest” on the customer home page and travel fee may fall back or be unavailable until coords are set.

### Summary

- One (or primary) `provider_locations` row = freelancer’s base = “where they’re coming from”.
- Travel fee and “distance to provider” both use this base; behaviour is the same as for salons (one base per provider for that purpose).
- For distance and travel fee to work automatically, the freelancer (or onboarding) should set latitude/longitude on that location.

---

## Customer home page – provider card distance

### Multi-branch providers (e.g. Cape Town + Johannesburg)

- **Branches are unique:** Each `provider_locations` row is a distinct branch (different address, city, staff, and optionally services/offerings per location). Bookings store `location_id`, so the chosen branch is fixed for the booking.
- **“Nearest” section:** For providers with multiple branches, the home API uses the **branch nearest to the customer**, not the primary branch. So a customer in Cape Town sees distance and city/country for the Cape Town branch; a customer in Johannesburg sees the Johannesburg branch. That way the card reflects the branch that is actually closest.
- **Rest of the flow:** When the customer taps a provider and books “at salon”, they choose a **location** (branch); services, staff, and availability are per location, so the correct branch is used end-to-end.

### Source of coordinates (Nearest section)

- **Customer:** `latitude` and `longitude` from the home API query (from the customer’s selected address or device location).
- **Provider:** For the **“Nearest”** list, the API loads **all** active `provider_locations` (with non-null lat/lng) for the candidate providers. For each provider it picks the **location with minimum distance** to the customer and uses that location’s coords and city/country for the card. So multi-branch providers show the nearest branch. (Other sections that need one location per provider may still use primary, e.g. via `get_provider_primary_location_coords`.)

### How distance is calculated

- **Formula:** Haversine straight-line distance (see `apps/web/src/lib/mapbox/mapbox.ts`, `calculateDistance`). Distance is in kilometres.
- **Accuracy:** This is **great-circle (straight-line)** distance, not driving or road distance. Actual travel distance/time can be higher in practice.
- **Who gets a distance:** Only providers that have at least one active `provider_locations` row with non-null `latitude` and `longitude` get a distance and can appear in the “nearest” list; others are excluded from distance-based logic.

---

## Possible improvements

1. **Freelancer auto-location from `user_addresses`** *(implemented in migration 243)*  
   `ensure_freelancer_location` now uses the user’s default (or first) row in **`user_addresses`** instead of the non-existent `users.address`. When creating a `provider_locations` row, it sets **`latitude`** and **`longitude`** from that address when present, so distance and travel fee work without the freelancer having to set a pin. A one-time backfill runs for existing freelancers who have no location but have a saved address.

2. **Geocoding when creating a location** *(implemented)*  
   - **Create/update:** `POST /api/provider/locations` and `PATCH /api/provider/locations/[id]` already geocode when address is provided and coordinates are missing.  
   - **After freelancer setup:** When a freelancer is onboarded, any `provider_locations` created by `ensure_freelancer_location` with address but no coords are geocoded in the same request (onboarding route).  
   - **Backfill:** `POST /api/provider/locations/geocode-missing` finds the current provider’s locations with address but null lat/lng, geocodes them via Mapbox, and updates the rows. Call from dashboard or cron.  
   - **Helper:** `lib/mapbox/geocodeProviderLocation.ts` exposes `geocodeProviderLocation(supabase, locationId)` for one-off use.

3. **Home API: one location per provider at DB level** *(implemented in migration 244)*  
   **`get_provider_primary_location_coords(provider_ids)`** (RPC) returns one row per provider (primary or first) for use where “one location per provider” is enough. The **“Nearest”** section instead fetches all locations per provider and picks the **nearest branch** to the customer so multi-branch providers show the correct branch (e.g. Cape Town vs Johannesburg).

4. **Distance accuracy / UX**  
   Distance is straight-line (Haversine). If you want “driving distance” or “travel time”, you’d need to call a directions API (e.g. Mapbox) and possibly cache or approximate; that’s a product/UX decision rather than a correctness fix.
