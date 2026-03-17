# Location type and walk-in status mapping

This doc describes how **house calls / at home**, **at salon**, and **walk-in** are represented and mapped across DB, API, provider app, and customer app.

---

## 1. House calls / at home

| Layer | Field / concept | Values / meaning |
|-------|------------------|-------------------|
| **DB** | `providers.offers_mobile_services` | Boolean: provider-level "we offer house calls". Default true. |
| **DB** | `offerings.supports_at_home` | Boolean per offering. Default false. |
| **DB** | `services.supports_at_home` | Boolean (provider-level services table). |
| **DB** | `bookings.location_type` | Enum `'at_home' \| 'at_salon'`. |
| **API (dashboard)** | `provider_profile.supports_house_calls` | From `providers.offers_mobile_services !== false`. |
| **API (public provider)** | `supports_house_calls` | From any offering with `supports_at_home === true` (or services table fallback). |
| **API (public search)** | `supports_house_calls` on each card | From offerings (any `supports_at_home`) + returned in search results. |
| **API (search filter)** | `at_home=true` query param | Restricts to providers that have ≥1 offering with `supports_at_home = true`. |
| **Provider app** | "At Home" option | Sends `location_type: "at_home"` when creating booking. |
| **Customer app** | "House Call" / "At your location" | Uses `supports_at_home` on service, `location_type === "at_home"` on booking. |

**Consistency:** Provider-level "we do house calls" is `offers_mobile_services`; customer-facing "this provider offers house calls" is derived from offerings (`supports_at_home`). Booking is `location_type: 'at_home'`. All use consistent naming in APIs (`supports_house_calls` vs `supports_at_home` on offerings).

---

## 2. At salon

| Layer | Field / concept | Values / meaning |
|-------|------------------|-------------------|
| **DB** | `provider_locations.location_type` | `'salon'` = physical venue (at_salon bookings, walk-ins); `'base'` = reference point for distance only (mobile-only). |
| **DB** | `bookings.location_type` | `'at_salon'` = appointment at a provider salon location. |
| **DB** | `bookings.location_id` | References `provider_locations.id` for at_salon (must be a row with `location_type = 'salon'`). |
| **API (dashboard)** | `provider_profile.supports_salon` | True if provider has ≥1 active location with `location_type = 'salon'`. |
| **API (public)** | `supports_salon` | Same: ≥1 active location with `location_type = 'salon'`. Search also derives from locations + offerings. |
| **Provider app** | "At Salon" option | Sends `location_type: "at_salon"`, `location_id` when creating booking. |
| **Customer app** | "At Salon" | Uses `supports_at_salon` on service, `location_type === "at_salon"` on booking. |

**Consistency:** `at_salon` always means "at a physical salon location". Only locations with `location_type = 'salon'` are used for at_salon bookings and walk-ins; `base` is for travel/distance only.

---

## 3. Walk-in

| Layer | Field / concept | Values / meaning |
|-------|------------------|-------------------|
| **DB** | `bookings.booking_source` | `'online'` = customer booked via app/web; `'walk_in'` = provider-created (in-person). |
| **API** | Provider POST `/api/provider/bookings` | Defaults `booking_source` to `'walk_in'` when not sent. |
| **Provider app** | New booking from calendar / More → Bookings → New | Does not send `booking_source` → API sets `walk_in`. Optional `?walk_in=true` in URL for quick add. |
| **Finance** | Platform fees | Only applied to `booking_source = 'online'`; walk-in bookings have zero platform fee. |

**Consistency:** Walk-in is a **booking source**, not a location type. A walk-in booking can be `location_type: 'at_salon'` or `'at_home'`. The provider app correctly creates walk-in bookings by calling the provider bookings API (which defaults to `walk_in`).

---

## 4. Quick reference

- **Booking location:** `location_type` = `'at_home'` | `'at_salon'` (where the appointment takes place).
- **Provider location:** `provider_locations.location_type` = `'salon'` | `'base'` (salon = venue; base = travel-only).
- **Booking source:** `booking_source` = `'online'` | `'walk_in'` (who created the booking; affects fees).
- **Discovery:** `supports_house_calls` / `supports_salon` on provider = derived from offerings + locations; search filter `at_home=true` restricts to providers with at-home offerings.

---

## 5. Fixes applied

- **Public search:** `at_home=true` filter was parsed but not applied; now restricts to provider IDs that have ≥1 offering with `supports_at_home = true`.
- **Public search:** Search results now include `supports_house_calls` and `supports_salon` on each provider card (from offerings + provider_locations.location_type), so customer app badges and filters are correct.
