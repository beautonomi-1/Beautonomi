# Mapbox and service zones — implementation guide

This document describes how Mapbox is wired in the Beautonomi web app, how **platform service zones** (control plane) relate to **provider `service_zones`**, and how the admin UIs and APIs fit together.

---

## 1. Mental model

There are **three related concepts**:

| Concept | Table(s) | Who manages it | Role |
|--------|-----------|----------------|------|
| **Mapbox credentials** | `mapbox_config`, `platform_secrets` | Superadmin (`/admin/mapbox`) | Powers server-side Mapbox APIs and browser maps (public token). |
| **Platform zones** | `platform_zones`, `platform_zone_inclusions`, `platform_zone_exclusions` | Operations admins — `admin_operations` or superadmin (`/admin/service-zones`, partly `/admin/mapbox`; APIs: `ADMIN_SECTION_OPERATIONS`) | Defines **where the platform operates** using PostGIS geometry built from postal/city/town/province inclusions minus exclusions. |
| **Provider service zones** | `service_zones` | Providers / admin tools | **Per-provider** polygons/radius/postal/city zones used for house-call logic and `/api/mapbox/check-zone` when rows exist. |

**`provider_zone_selections`** (from migration `173_create_two_tier_zone_system.sql`) links providers to **platform** zones with travel pricing; the control-plane UI focuses on shaping `platform_zones.geometry`, not that join table.

---

## 2. Mapbox configuration

### 2.1 Storage

- **`mapbox_config`** (non-secret): `public_access_token`, `style_url`, `is_enabled`, timestamps.
- **`platform_secrets`**: `mapbox_access_token` — the **secret** token (server-only). Written by admin when a real token is submitted (not `***`).
- **Environment fallbacks**:
  - Secret: `MAPBOX_ACCESS_TOKEN` (checked first in `getMapboxAccessToken()`).
  - Public: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` used by `GET /api/public/directions-config` only when DB does not supply a public token and Mapbox is not explicitly disabled.

### 2.2 Admin API: `GET/PUT /api/admin/mapbox/config`

- Guard: `requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV)`.
- **GET** returns masked values: `access_token: "***"`, truncated `public_access_token`.
- **PUT**:
  - If `access_token` is present and not a placeholder → upsert `platform_secrets.mapbox_access_token`.
  - Updates `mapbox_config` (public token, style URL, `is_enabled`).
  - Syncs a subset into `platform_settings.settings.mapbox` for mobile/third-party config.
  - Calls `clearMapboxServiceSingleton()` so the next server request reloads the secret.
  - Writes an audit log entry `admin.mapbox.config.update`.

### 2.3 Public token for browsers: `GET /api/public/directions-config`

- Uses **service role** (`getSupabaseAdmin`) to read `mapbox_config`.
- If `is_enabled === false`, responds with `provider: "google"` and **does not** expose any Mapbox public token (even from env).
- Otherwise: `provider: "mapbox"` when a public token exists (DB or env), plus optional `mapboxStyleUrl`.

Client helper: `fetchMapboxPublicMapConfig()` in `apps/web/src/lib/mapbox/fetch-public-map-config.ts` — **preferred** over hard-coding `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` for interactive maps.

### 2.4 Server Mapbox client: `getMapboxService()`

Defined in `apps/web/src/lib/mapbox/mapbox.ts`.

- Lazy singleton; token from `getMapboxAccessToken()` (`env` → `platform_secrets`).
- If no token: may throw after checking `mapbox_config.is_enabled` (disabled vs misconfigured).
- Exposes geocoding, reverse geocoding, routing, distance matrix, and **`isPointInZone()`** (Haversine for radius, ray-casting for polygons) used by zone checks.

---

## 3. Platform zones (control plane)

### 3.1 Schema evolution

- **`173_create_two_tier_zone_system.sql`**: Creates `platform_zones` with `zone_type`, postal/city/polygon/radius fields, `is_active`, RLS for superadmin + public read of active zones.
- **`292_platform_zone_control_plane.sql`**: Adds `country_code`, `status` (`draft` | `active` | `archived`), PostGIS `geometry`, `centroid`, `bbox`, `version`; creates `platform_zone_inclusions` and `platform_zone_exclusions` with `geom`; adds `compute_platform_zone_geometry` and `update_platform_zone_geometry`.
- **`295_check_point_in_platform_zones.sql`**: RPC `check_point_in_platform_zones(p_lng, p_lat)` — returns active zones whose `geometry` contains the point.
- **`330_platform_zones_rollout_ops.sql`**: `published_at`, `ops_metadata` (rollout notes, clone lineage, etc.).

### 3.2 How geometry is built

1. **Inclusions** are rows in `platform_zone_inclusions` (`type`: country, province, city, town, postal_code) with a stored `geom` snapshot.
2. **Exclusions** subtract area: postal codes or **custom polygons** from the map.
3. **`compute_platform_zone_geometry(zone_id)`** = `ST_Difference(union(inclusions), union(exclusions))`, normalized to MultiPolygon.
4. **`update_platform_zone_geometry(zone_id)`** writes `platform_zones.geometry`, centroid, bbox, bumps `version`, clears geometry if nothing remains.

API routes under `/api/admin/service-zones/...` call into this model (include/exclude endpoints trigger recomputation as implemented in those handlers).

### 3.3 Point-in-platform-zone at runtime

`check_point_in_platform_zones` filters:

- `status = 'active'`
- `geometry IS NOT NULL`
- `ST_Contains(geometry, point::geography)`

Used from **`POST /api/mapbox/check-zone`** (see §5) alongside provider `service_zones`.

---

## 4. Provider `service_zones`

Defined/extended in `003_providers.sql`, `171_create_service_zones_table.sql`.

- **Scoped by `provider_id`**.
- Same conceptual zone types as legacy platform rows: postal, city, polygon, radius.
- **`POST /api/mapbox/check-zone`** loads active `service_zones` (optionally filtered by `zone_id` or `provider_id`) and uses **`MapboxService.isPointInZone`** for each row when any exist.
- **`GET/POST /api/admin/mapbox/service-zones`**: Admin listing and CRUD for **provider** `service_zones` (transforms DB shape ↔ API shape). Distinct from the **control plane** routes below.

---

## 5. Public Mapbox proxy routes (secret token)

All use `getMapboxService()` unless noted.

| Route | Purpose |
|-------|---------|
| `POST /api/mapbox/geocode` | Forward geocoding for UI (e.g. header search, `PolygonZoneEditor`, `location-modal`). |
| `POST /api/mapbox/distance` | Haversine or Mapbox-backed distance helpers. |
| `POST /api/mapbox/route` | Directions. |
| `POST /api/mapbox/distance-matrix` | Matrix API. |
| `POST /api/mapbox/check-zone` | See §5.1. |

Other server modules import `getMapboxService` directly (e.g. `public/home`, bookings at-home, travel fee calculation, provider booking location).

### 5.1 `POST /api/mapbox/check-zone` behaviour

**Body:** `{ point: { longitude, latitude }, zone_id?: uuid, provider_id?: uuid }`.

1. Query **`service_zones`** with `is_active = true`, optional filters.
2. **If no provider zones match:** returns `in_zone: false`, `zones: []`, and still tries **`check_point_in_platform_zones`** so callers get `platform_in_zone` / `platform_zones[]` (RPC errors are swallowed for older DBs).
3. **If provider zones exist:** for each zone, normalizes coordinates then **`mapbox.isPointInZone`**. Response includes both provider match flags and platform RPC results.

This separates **“inside a provider’s defined area”** from **“inside an active platform launch zone”**.

---

## 6. Admin UI: `/admin/mapbox`

**File:** `apps/web/src/app/admin/mapbox/page.tsx`

- **`RoleGuard`**: `allowedRoles={["superadmin"]}`.
- **Tabs:**
  - **Keys & maps** → `MapboxConfigTab`: load/save config via `/api/admin/mapbox/config`, verify public exposure via `GET /api/public/directions-config`, links to Mapbox account docs.
  - **Platform zones** → `ServiceZonesTab`: simpler **legacy-style** CRUD on **`platform_zones`** via **`/api/admin/platform-zones`** (not the PostGIS control-plane APIs).

**Cross-link:** prominent button to **`/admin/service-zones`** for the full control plane.

---

## 7. Admin UI: `/admin/service-zones` (control plane)

**File:** `apps/web/src/app/admin/service-zones/page.tsx`

Layout:

1. **Header** — title and short guidance; link to Mapbox setup.
2. **`MarketSidebar`** (left) — `GET /api/admin/service-zones` (`include_archived` toggle); create draft via `POST /api/admin/service-zones`.
3. **`MarketMap`** (center) — Mapbox GL JS + **Mapbox Draw**; optional layers from `GET /api/admin/service-zones/[id]/map-layers` (inclusion / exclusion / coverage unions when migration `350` RPCs are deployed):
   - Token/style from `fetchMapboxPublicMapConfig()`.
   - Renders `zone.geometry_geojson` as fill/line layers.
   - **Draw mode:** polygon → confirm → `POST /api/admin/service-zones/{id}/exclude` with `type: custom_polygon`, `geojson`, `version` (optimistic concurrency).
   - **Archived** zones: `allowMapEdits={false}`.
4. **`MarketBuilder`** (right) — stacked cards: basics, dataset + Mapbox-assisted search, included/excluded lists, coverage summary, rollout ops, launch (publish/archive) with dialogs.

**Detail:** `GET /api/admin/service-zones/{id}` returns inclusions, exclusions, GeoJSON geometry fragment metadata, etc.

**Publish:** `POST /api/admin/service-zones/{id}/publish` — requires `geometry`; sets `status: active`, `is_active: true`, sets `published_at` on first publish; supports optional `version` for conflict detection.

---

## 8. Control-plane API index (`/api/admin/service-zones/...`)

All guarded with **`ADMIN_SECTION_INTEGRATIONS_DEV`** (same section family as Mapbox config).

| Path | Role |
|------|------|
| `GET/POST /api/admin/service-zones` | List/create **draft** `platform_zones` (name + `country_code`). |
| `GET/PATCH/DELETE .../[id]` | Zone metadata and updates. |
| `GET .../[id]/map-layers` | Optional GeoJSON layers for admin map (inclusion union, exclusion union, coverage). |
| `.../[id]/include` | Add inclusion from area search dataset. |
| `.../[id]/exclude` | Add exclusion (postal or custom polygon). |
| `.../[id]/publish` | Activate zone (requires geometry). |
| `.../areas/search` | Search provinces/cities/towns/postals for a country. |
| `.../areas/postal-codes`, `.../areas/geometry` | Supporting area data. |
| `.../clone` | Clone zone for next market. |
| `.../[id]/rollout-summary` | Aggregated coverage summary for ops. |
| Inclusions/exclusions `[inclusionId]` / `[exclusionId]` | Remove specific rows. |

(Exact payloads are defined in each route handler; prefer reading the Zod schemas at the top of each file.)

---

## 9. Legacy admin path: `/api/admin/platform-zones`

Used only by **`ServiceZonesTab`** on **`/admin/mapbox`**. It mutates **`platform_zones`** rows in the older shape (postal/city/polygon/radius columns) without the inclusion/exclusion pipeline. For **phased geographic rollout**, operators should use **`/admin/service-zones`** so geometry stays consistent with `compute_platform_zone_geometry`.

---

## 10. End-to-end flows (summary)

1. **Configure Mapbox** → Superadmin saves secret + public token → browsers get public token from `/api/public/directions-config`; servers use secret via `getMapboxService()`.
2. **Define where the product is live** → Build zones in **`/admin/service-zones`** → publish → `check_point_in_platform_zones` returns matches for arbitrary lat/lng.
3. **Provider-specific areas** → `service_zones` + `/api/mapbox/check-zone` for point-in-provider-zone; platform coverage still returned in parallel when RPC succeeds.

---

## 11. Key source files (quick reference)

| Area | Path |
|------|------|
| Mapbox service + singleton | `apps/web/src/lib/mapbox/mapbox.ts` |
| Public map config helper | `apps/web/src/lib/mapbox/fetch-public-map-config.ts` |
| Secret resolution | `apps/web/src/lib/platform/secrets.ts` (`getMapboxAccessToken`) |
| Admin Mapbox page | `apps/web/src/app/admin/mapbox/page.tsx`, `components/MapboxConfigTab.tsx`, `components/ServiceZonesTab.tsx` |
| Control plane page | `apps/web/src/app/admin/service-zones/page.tsx`, `components/{MarketSidebar,MarketMap,MarketBuilder,...}.tsx`, `lib/platform-types.ts` |
| Admin config API | `apps/web/src/app/api/admin/mapbox/config/route.ts` |
| Public directions config | `apps/web/src/app/api/public/directions-config/route.ts` |
| Zone check | `apps/web/src/app/api/mapbox/check-zone/route.ts` |
| Provider zones admin API | `apps/web/src/app/api/admin/mapbox/service-zones/route.ts` |
| Platform zones list/create | `apps/web/src/app/api/admin/service-zones/route.ts` |
| SQL: platform geometry + RPC | `supabase/migrations/292_platform_zone_control_plane.sql`, `295_check_point_in_platform_zones.sql` |

---

*This document reflects the codebase layout as of the repo state when authored; if migrations or routes diverge, treat the implementation files as source of truth.*
