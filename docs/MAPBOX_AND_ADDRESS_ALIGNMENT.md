# Mapbox and address/location alignment

All address and location features (maps, directions, geocoding, service-zone checks) use **Mapbox** as the platform default. Config is shared across web and mobile so behaviour is consistent.

## Config source

| What | Where | Used by |
|------|--------|---------|
| **Mapbox token + style** | **Admin → Mapbox** (Integrations & dev → Mapbox): `mapbox_config` table (`public_access_token`, `style_url`, `is_enabled`) | Web and mobile |
| **Fallback token** | Admin → Settings → Integrations → Mapbox: `platform_settings.settings.mapbox` | Only when `mapbox_config` has no row |

- **Public API (web + mobile):** `GET /api/public/third-party-config?service=mapbox` returns `public_token` and optional `style_url` (prefers `mapbox_config`).
- **Web map preview / static images:** `GET /api/public/directions-config` returns `mapboxPublicToken` and `mapboxStyleUrl` from `mapbox_config`.

## What uses it

- **Web:** Enhanced address dialog (map preview + service availability), search bar / mobile search bar (availability), ZoneMapViewer, partner-profile location map, earning-slider map, directions links (DirectionsLink, partner-about, provider booking, fresha-about), notification `directions_url` (salon directions).
- **Customer app:** Address picker (geocode via `/api/mapbox/geocode`), StaticMapImage (token + style from third-party-config), partner-profile “Get directions” (Mapbox URL).
- **Provider app:** Address autocomplete (geocode), getMapboxToken / getMapboxConfig from third-party-config.

## Directions and “view on map” links

- **Helper:** `apps/web/src/lib/directions/get-directions-url.ts`  
  - `getMapboxDirectionsUrl(destination, origin?)` – Mapbox directions URL (no token in URL).  
  - `getMapboxMapUrl(location)` – Mapbox “view location” URL.  
  - `getDirectionsUrl()` / `getMapUrl()` – Prefer Mapbox when configured; fall back to Google only when Mapbox is not configured.
- **Sync default:** `getDirectionsUrlSync()` returns Mapbox URL so initial link state is correct without async config.

## Service availability (“in zone”)

- **API:** `POST /api/mapbox/check-zone` with `{ point: { latitude, longitude } }` (optional `provider_id`).
- **Backend:** Reads active `service_zones`, uses Mapbox server lib to test point-in-zone.
- **UI:** `useServiceAvailability()` in enhanced-address-dialog, search-bar, mobile-search-bar, beautonomi-header.

## Adding new address/location features

1. **Map preview or static image:** Fetch token (and optional style) from `/api/public/directions-config` (web) or `getMapboxConfig()` (mobile), then use Mapbox Static Images API or Mapbox GL.
2. **“Get directions” / “View on map”:** Use `getMapboxDirectionsUrl()` or `getMapboxMapUrl()` (or async `getDirectionsUrl` / `getMapUrl` when you need provider selection).
3. **Geocoding / autocomplete:** Use existing `/api/mapbox/geocode` (server uses Mapbox from `mapbox_config` / platform secrets).
4. **Service availability:** Use `useServiceAvailability()` (web) or call `POST /api/mapbox/check-zone` (mobile).

Do not introduce new Google Maps embeds or API keys for address/location; keep Mapbox as the single map provider for these flows.
