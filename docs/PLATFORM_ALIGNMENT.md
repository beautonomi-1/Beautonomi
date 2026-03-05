# Platform alignment (Web, Customer app, Provider app)

This doc summarizes how the three platforms stay aligned on key features and what was checked/fixed.

## Platforms

- **Web** (`apps/web`) – Next.js; public home, partner profile, booking, admin, provider portal.
- **Customer app** (`apps/customer`) – Expo/React Native; home, partner profile, book, checkout.
- **Provider app** (`apps/provider`) – Expo/React Native; provider dashboard, settings, routes, no home feed.

## Alignment areas

### 1. Home feed & provider cards

| Area | Web | Customer app | Notes |
|------|-----|--------------|--------|
| Home API | `GET /api/public/home?lat=&lng=&category=` | Same, via `useHomeData(lat, lng, category)` | Aligned. Customer uses `useLocation` + `useSelectedAddress` for lat/lng. |
| Sections | Top Rated, Sponsored, Nearest, Hottest, Upcoming | Top Rated, Nearest, Hottest, Upcoming | Aligned. “Browse by City” removed from both. Sponsored on web only (customer can add slot later if needed). |
| Provider card badges | Top Rated, Hottest, Nearest, Rising Star, Freelancer, House Calls, At Salon, current_badge, Sponsored, Verified | Same set | Aligned. Customer types and `useHomeData` now include `current_badge`, `is_sponsored`; ProviderCard shows them. |
| Distance on card | `distance_km` from API | Same, normalized in `useHomeData` | Aligned. |
| Ranking | When ranking module enabled, Top Rated & Hottest re-ordered by `provider_quality_score` | Same order as API (no client sort) | Aligned. |

### 2. Partner profile & distance

| Area | Web | Customer app | Notes |
|------|-----|--------------|--------|
| Provider API | `GET /api/public/providers/[slug]?lat=&lng=` (optional) | Same; now passes `?lat=&lng=` when available | Aligned. Customer uses `useSelectedAddress` + `useLocation` and refetches when location changes. |
| `distance_km` on profile | Shown when returned | Same (e.g. TrustModule) | Aligned. |

### 3. Booking & travel

| Area | Web | Customer app | Notes |
|------|-----|--------------|--------|
| Hold/checkout | `travel_distance_km`, `travel_fee` from hold API | Same from hold/checkout APIs | Aligned. |
| At-home / house calls | Location validate, travel fee from distance | Same flow | Aligned. |

### 4. Config & feature flags

| Area | Web | Customer app | Provider app | Notes |
|------|-----|--------------|--------------|--------|
| Config bundle | `ranking`, `distance`, etc. | Same shape (`ranking: {}`, etc.) | Same shape | Aligned. Used for feature flags. |
| Ranking module | Control plane + quality scores UI | N/A (consumes API order) | N/A | Backend + web admin only. |

### 5. Types

- **Customer** `PublicProviderCard`: now includes `current_badge`, `is_sponsored` and `ProviderBadge` to match web and API.
- **Customer** `PublicProviderDetail`: already had `distance_km`; partner profile now requests it with lat/lng when available.

## Changes made for alignment

1. **Customer app types** (`apps/customer/src/types/api.ts`): Added `ProviderBadge`, `current_badge`, `is_sponsored` to `PublicProviderCard`.
2. **Customer app useHomeData**: Normalize and pass through `current_badge` and `is_sponsored` from home API.
3. **Customer app ProviderCard**: Render `current_badge` (with color) and “Sponsored” when present.
4. **Customer app partner-profile**: Use `useSelectedAddress` and `useLocation`; call provider API with `?lat=&lng=` when available so `distance_km` is returned; refetch when location changes.
5. **Customer app home**: Removed “Browse by City” section to match web.

## Provider app

Provider app does not show a home feed or browse providers. It uses distance settings (`max_service_distance_km`, etc.), config bundle (including `ranking`), and booking/hold APIs. No further alignment changes were required for the areas above.

---

## What else (optional next steps) — implemented

1. **Search API** (`GET /api/public/search`): Accepts `lat`/`lng` in filters but returns `distance_km` (Haversine to nearest location) when lat/lng are present. To align with home and partner profile: when `lat`/`lng` are present, compute distance (e.g. Haversine from shared `lib/geo/distance`) from user to each provider’s nearest location and (Implemented.)
2. **Search + ranking**: When ranking module is enabled and `sort_by` is `relevance`, organic results are re-sorted by `provider_quality_score.computed_score` (sponsored stay at top).
3. **Browse by City**: Home API returns `browseByCity: []`; customer `useHomeData` and `HomeApiResponse` no longer include it.
4. **Ranking cron**: `GET /api/cron/ranking-recompute` runs full recompute (production). Secure with `Authorization: Bearer <CRON_SECRET>`. Schedule via Vercel Cron or external cron (e.g. daily). Previously: optional scheduled job (e.g. cron) to call `POST /api/admin/ranking/recompute` with `full: true` periodically so scores stay fresh without manual “Recompute all”.
5. **Travel fee**: Mapbox Directions (driving) used when available in `calculateTravelFeeForHold` and `POST /api/location/validate`; Haversine fallback. Previously: travel fee used Haversine everywhere. If you want “driving distance” for the fee, you could use Mapbox Directions in `calculateTravelFeeForHold` / location validate and store `route_distance_km` for pricing (with Haversine fallback when Mapbox fails).
