# Service Zones Control Plane

Enterprise-grade platform service zone management for Beautonomi Superadmin: hierarchical coverage (country → province → city → town → postal code), inclusion/exclusion geometry, and Mapbox-backed UX.

## Current state (Phase 1 scan)

- **service_zones**: Provider-level zones (provider_id, zone_type: postal_code | city | polygon | radius, polygon_coordinates JSONB, center/radius). Used by providers for at-home coverage. Check-zone API reads this table and uses Mapbox `isPointInZone` (polygon/radius).
- **platform_zones**: Superadmin-level zones (no provider_id; same shape: postal_codes[], cities[], polygon_coordinates, radius). Providers select from these via **provider_zone_selections**. Admin UI: `/admin/mapbox` → ServiceZonesTab calls `/api/admin/platform-zones`.
- **PostGIS**: Enabled in `001_initial_schema.sql`.
- **Check-zone**: `POST /api/mapbox/check-zone` checks **service_zones** only (provider zones). Does not yet use PostGIS geometry; uses Mapbox lib with polygon_coordinates/radius.

## Target architecture

- **Platform zones (control plane)**: Superadmin defines coverage with:
  - **Inclusions**: Selected admin areas or postal code polygons (stored as snapshot geometry).
  - **Exclusions**: Postal codes or custom polygons to “punch out”.
  - **Computed geometry**: `MultiPolygon = union(inclusions) - union(exclusions)` (PostGIS), stored on `platform_zones`.
- **postal_areas**: Dataset table with polygon boundaries per country/province/city/town/postal_code (PostGIS). Loaded via seed/import (see “Loading postal dataset” below).
- **Provider behaviour**: Unchanged. Providers continue to select platform zones via provider_zone_selections; existing service_zones (provider-owned) remain for backward compatibility. Check-zone can be extended to consider platform_zones.geometry for “platform coverage” if desired.

## Database design (additive)

1. **postal_areas** (new)  
   - id, country_code, province_name, city_name, town_name, postal_code, geom (geometry).  
   - Indexes: (country_code, province_name), (country_code, city_name), (country_code, postal_code), GIST(geom).

2. **platform_zones** (extend)  
   - Add: country_code, status ('draft'|'active'|'archived'), geometry (geography MultiPolygon), centroid (point), bbox (jsonb), version (int default 1), `published_at`, `ops_metadata` (JSONB rollout notes / strategy — migration 330).  
   - Keep existing columns for backward compatibility; geometry is the source of truth when present.

3. **platform_zone_inclusions** (new)  
   - id, zone_id (FK platform_zones), type ('country'|'province'|'city'|'town'|'postal_code'), ref_code, ref_name, source, geom (snapshot), created_at.

4. **platform_zone_exclusions** (new)  
   - id, zone_id, type ('postal_code'|'custom_polygon'), ref_code, ref_name nullable, geom, created_at.

5. **PostGIS functions**  
   - `compute_platform_zone_geometry(zone_id)` → MultiPolygon.  
   - `update_platform_zone_geometry(zone_id)` → updates platform_zones.geometry, centroid, bbox, version.

## API contracts

All under `/api/admin/service-zones/*` require **`requireAdminSection(ADMIN_SECTION_OPERATIONS)`** (superadmin and `admin_operations` by default; tenant assignment rules apply per `api-helpers`). Response shape: `{ data, error }`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/service-zones/areas/search?country=ZA&q=cape` | Search provinces/cities/towns/postal codes (metadata only). |
| GET | `/api/admin/service-zones/areas/postal-codes?country=ZA&city=Cape%20Town` | List postal codes for a city. |
| POST | `/api/admin/service-zones/areas/geometry` | Body: { country_code, postal_codes?, city?, province? }. Returns simplified GeoJSON for preview. |
| GET | `/api/admin/service-zones` | List platform zones (default: draft + active). Query `include_archived=1` includes archived. |
| POST | `/api/admin/service-zones` | Create draft zone (name, country_code). |
| POST | `/api/admin/service-zones/clone` | Body: { source_zone_id, name }. New empty draft, same country (next-city rollout). |
| PATCH | `/api/admin/service-zones/[id]` | Rename, status (`draft` \| `active` \| `archived`), shallow-merge `ops_metadata`; syncs `is_active` with status. Optional version. |
| POST | `/api/admin/service-zones/[id]/include` | Body: { type, ref_code, ref_name?, version? }. Resolve postal_areas, insert inclusions, recompute geometry. |
| POST | `/api/admin/service-zones/[id]/exclude` | Body: { type: 'postal_code', postal_code } or { type: 'custom_polygon', geojson }. Uses RPC `insert_platform_zone_exclusion_custom_polygon` for custom polygons (migration 296). |
| POST | `/api/admin/service-zones/[id]/publish` | Set status = 'active', `is_active` = true, `published_at` on first publish; requires existing geometry. Optional version. |
| GET | `/api/admin/service-zones/[id]` | Zone detail with geometry (simplified), `fragment_count`, `disconnected_fragments`, `published_at`, `ops_metadata`. |
| GET | `/api/admin/service-zones/[id]/rollout-summary` | Distinct cities / provinces / towns implied by postal inclusions (rollout visibility). |
| DELETE | `/api/admin/service-zones/[id]/inclusions/[inclusionId]` | Remove one inclusion; recompute zone geometry. |
| DELETE | `/api/admin/service-zones/[id]/exclusions/[exclusionId]` | Remove one exclusion; recompute zone geometry. |

## Superadmin UI (control plane)

- **Route**: `/admin/service-zones`. Linked from Admin nav (“Service Zones”) and from Mapbox → Service Zones tab (“Open Service Zones Control Plane”).
- **Layout**: Left zone list (create, select), center Mapbox map (zone polygon, fit to bbox), right builder panel (tabs).
- **Builder tabs**: (1) **Coverage** – country (read-only), search areas, Add include; list inclusions with “Exclude” for postal codes. (2) **Exclusions** – list exclusions, Remove. (3) **Preview & Publish** – version, last updated, bbox, Publish button; warning when zone has disconnected fragments (`fragment_count` > 1).
- Mapbox token: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. Zone geometry from `st_asgeojson_zone_simplified` RPC (simplified for display).

## UX flows

- **Left**: Zone list + search + “Create zone”.
- **Center**: Mapbox map with zone polygon, inclusion highlights, exclusion overlays (e.g. red hatched). Fit to zone bbox on load.
- **Right**: Builder panel tabs: (1) Coverage – country → province → city → town → postal codes with checkboxes; selecting city auto-selects postal codes; unchecking adds to exclusions and recomputes. (2) Exclusions – list of excluded postal codes + “Draw exclusion polygon” (Mapbox Draw). (3) Preview & Publish – stats (area km², postal count, bbox, version), Publish button, audit log link.
- Changes save to server; optional client-side undo stack for last N edits. “Simplify polygon for performance” applies only to display (server stores full geometry).

## Loading postal dataset

- **Option 2 (recommended for control plane)**: Maintain boundary data in Supabase/PostGIS. Import GeoJSON shapefiles into `postal_areas` (e.g. per country). Script/CLI or one-off migration that calls `ST_GeomFromGeoJSON` and inserts. For South Africa (and others), use a commercial or open boundary dataset (e.g. GADM, or purchased postal boundaries). Document the exact source and license in this doc or a separate RUNBOOK.
- **Placeholder**: Migration creates `postal_areas` and optional seed row(s) for one country so APIs can be implemented; production load is a separate step.

### Seeded SQL (South Africa placeholder)

Migration **`294_seed_postal_areas_za.sql`** seeds `postal_areas` with 12 rows for ZA so the control plane search and include flows work without a full boundary import.

**How to run**

- Apply migrations as usual: `supabase db push` or `supabase migration up`. Seed runs with migration 294.
- To re-seed (replace placeholder data): run the migration again; it deletes the seeded postal codes then re-inserts (idempotent for that set).

**What’s seeded**

| country_code | province_name   | city_name   | town_name          | postal_code |
|-------------|----------------|-------------|--------------------|-------------|
| ZA          | Western Cape    | Cape Town   | City Bowl          | 8001        |
| ZA          | Western Cape    | Cape Town   | Woodstock          | 8005        |
| ZA          | Western Cape    | Cape Town   | Milnerton          | 7441        |
| ZA          | Western Cape    | Cape Town   | Constantia         | 7800        |
| ZA          | Western Cape    | Stellenbosch| Stellenbosch       | 7600        |
| ZA          | Western Cape    | Paarl       | Paarl              | 7646        |
| ZA          | Gauteng         | Johannesburg| Johannesburg Central| 2000       |
| ZA          | Gauteng         | Johannesburg| Sandton            | 2196        |
| ZA          | Gauteng         | Johannesburg| Rosebank           | 2196        |
| ZA          | Gauteng         | Pretoria    | Pretoria Central   | 0002        |
| ZA          | KwaZulu-Natal   | Durban      | Durban Central     | 4001        |
| ZA          | KwaZulu-Natal   | Durban      | Umhlanga           | 4320        |

Each row has a `geom` polygon (WGS84) with rough bounds for that area. After 294 runs you can:

- **Search**: e.g. `?country=ZA&q=cape` → provinces: Western Cape; cities: Cape Town; postal_codes: 8001, 8005, 7441, 7800.
- **Include**: e.g. include city "Cape Town" adds 4 postal areas (8001, 8005, 7441, 7800) and recomputes zone geometry.
- **Exclude**: exclude postal code 8001 to punch a hole in the zone.

For production, replace or extend this seed with a full ZA (and other countries) dataset loaded via the importer flow below.

### Production importer flow (CSV/GeoNames -> postal_areas)

Migration **`352_postal_areas_import_helpers.sql`** adds:

- `postal_areas_import_stage` (staging table)
- `rebuild_postal_areas_from_stage(p_country_code, p_point_radius_m)` RPC

Importer script:

- `scripts/import-za-postal-areas.mjs`
- npm scripts:
  - `pnpm seed:postal:za`
  - `pnpm seed:postal:za:keep-stage`

What it does:

1. Downloads `https://download.geonames.org/export/zip/ZA.zip` (or uses `--zip-path`)
2. Parses and normalizes province/city/town/postal rows
3. Inserts batches into `postal_areas_import_stage`
4. Rebuilds `postal_areas` for ZA via `rebuild_postal_areas_from_stage`
5. Clears stage rows (unless `--keep-stage`)

Example:

```bash
pnpm seed:postal:za
pnpm seed:postal:za -- --radius=1000
pnpm seed:postal:za -- --zip-path=/tmp/ZA.zip --keep-stage
```

## Performance and safety

- Preview geometry: always simplified (`ST_SimplifyPreserveTopology`) and limit coordinate count; full geometry stored in DB.
- Max included postal codes per include request (e.g. 500) to avoid DoS.
- Optimistic concurrency: PATCH/include/exclude require `version`; update only if current version matches.
- Caching: area search endpoints can be cached (short TTL).

## Provider availability consistency

- **check-zone** (`POST /api/mapbox/check-zone`) uses **service_zones** (provider-level) with DB columns `zone_type`, `polygon_coordinates`, `center_*`, `radius_km`. Response includes `in_zone`, `zones`, `platform_in_zone`, `platform_zones`.
- **Platform coverage**: The endpoint calls RPC `check_point_in_platform_zones(p_lng, p_lat)` (migration 295). Active platform zones with `geometry` are checked via PostGIS `ST_Contains`; matches are returned as `platform_zones` and `platform_in_zone`. Use for home page "Services available in your area".
## Implementation order

- Phase 2: Add `postal_areas` table and seed strategy (placeholder + docs).
- Phase 3: Add inclusion/exclusion tables; extend `platform_zones`; PostGIS compute functions.
- Phase 4: Admin APIs (search, geometry, zone CRUD, include, exclude, publish).
- Phase 5: Superadmin UI (control plane page with map + builder).
- Phase 6: Fix check-zone mapping for existing service_zones (polygon_coordinates/zone_type); optionally add platform zone geometry check.
- Phase 7: Tests + doc updates.
