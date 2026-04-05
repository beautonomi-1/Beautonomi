/**
 * API shapes for platform_zones control plane (internal names unchanged).
 * UI copy uses "Market", "Included Area", "Excluded Area", "Coverage", "Launch".
 */

export type MarketOpsMetadata = {
  rolloutMode?: string;
  runbookNotes?: string;
  targetLaunchAt?: string;
  internalCodename?: string;
  clonedFromZoneId?: string;
  clonedFromName?: string;
};

export interface PlatformMarketListItem {
  id: string;
  name: string;
  /** Null on legacy rows — set in Basics before dataset search works. */
  country_code: string | null;
  status: string;
  version: number;
  bbox: number[] | { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  created_at: string;
  updated_at: string;
  has_geometry: boolean;
  published_at?: string | null;
  ops_metadata?: MarketOpsMetadata | null;
  /** Number of platform_zone_inclusions rows for this zone (from list API). */
  inclusion_count?: number;
}

export type PlatformInclusionRow = {
  id: string;
  type: string;
  ref_code: string;
  ref_name: string | null;
  created_at: string;
};

export type PlatformExclusionRow = {
  id: string;
  type: string;
  ref_code: string | null;
  ref_name: string | null;
  created_at: string;
};

export interface PlatformMarketDetail {
  id: string;
  name: string;
  country_code: string | null;
  status: string;
  version: number;
  bbox: number[] | { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  centroid: unknown;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  ops_metadata?: MarketOpsMetadata;
  inclusions: PlatformInclusionRow[];
  exclusions: PlatformExclusionRow[];
  geometry_geojson: { type: string; coordinates: unknown } | null;
  fragment_count?: number;
  disconnected_fragments?: boolean;
}
