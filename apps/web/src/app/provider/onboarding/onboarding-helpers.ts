export type ZoneFormSlice = {
  business_type?: string | null;
  zone_suggest_status?: ZoneSuggestStatus;
  selected_zone_ids?: string[];
};

export function hasValidAddressCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function ensureHttpsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export type ZoneSuggestStatus = "matched" | "none" | "error" | "no_coords";

export type WizardStepKey =
  | "team_size"
  | "identity"
  | "business"
  | "payment"
  | "software"
  | "payroll"
  | "location"
  | "photos"
  | "zones"
  | "travel_fees"
  | "categories"
  | "catalog"
  | "hours"
  | "review"
  | "plan";

const WEB_STEP_KEY_TO_ID: Partial<Record<WizardStepKey, number>> = {
  team_size: 1,
  identity: 2,
  business: 3,
  payment: 4,
  software: 5,
  payroll: 6,
  location: 7,
  photos: 8,
  zones: 9,
  categories: 10,
  catalog: 11,
  hours: 12,
  review: 13,
  plan: 14,
};

const MOBILE_STEP_KEY_TO_ID: Record<WizardStepKey, number> = {
  team_size: 1,
  identity: 2,
  business: 3,
  payment: 4,
  software: 5,
  payroll: 6,
  location: 7,
  photos: 8,
  zones: 9,
  travel_fees: 10,
  categories: 11,
  catalog: 12,
  hours: 13,
  review: 14,
  plan: 15,
};

/** Web wizard has no travel_fees step; resume maps to categories (10). */
export function wizardStepIdForKey(key: WizardStepKey, platform: "web" | "mobile" = "web"): number {
  if (platform === "web") {
    if (key === "travel_fees") return WEB_STEP_KEY_TO_ID.categories ?? 10;
    return WEB_STEP_KEY_TO_ID[key] ?? 1;
  }
  return MOBILE_STEP_KEY_TO_ID[key];
}

export function wizardStepKeyForId(stepId: number, platform: "web" | "mobile" = "web"): WizardStepKey | null {
  const entries =
    platform === "mobile"
      ? ([
          ["team_size", 1],
          ["identity", 2],
          ["business", 3],
          ["payment", 4],
          ["software", 5],
          ["payroll", 6],
          ["location", 7],
          ["photos", 8],
          ["zones", 9],
          ["travel_fees", 10],
          ["categories", 11],
          ["catalog", 12],
          ["hours", 13],
          ["review", 14],
          ["plan", 15],
        ] as const)
      : ([
          ["team_size", 1],
          ["identity", 2],
          ["business", 3],
          ["payment", 4],
          ["software", 5],
          ["payroll", 6],
          ["location", 7],
          ["photos", 8],
          ["zones", 9],
          ["categories", 10],
          ["catalog", 11],
          ["hours", 12],
          ["review", 13],
          ["plan", 14],
        ] as const);
  for (const [key, id] of entries) {
    if (id === stepId) return key;
  }
  return null;
}

export function effectiveZoneSuggestStatus(
  data: Pick<ZoneFormSlice, "zone_suggest_status" | "selected_zone_ids">,
): ZoneSuggestStatus | undefined {
  if (data.zone_suggest_status) return data.zone_suggest_status;
  if ((data.selected_zone_ids?.length ?? 0) > 0) return "matched";
  return undefined;
}

export function zonesStepVisible(data: ZoneFormSlice): boolean {
  if (data.business_type !== "mobile" && data.business_type !== "both") return false;
  const status = effectiveZoneSuggestStatus(data);
  return status !== "matched";
}

/** Clear zone auto-match when the business address coordinates change. */
export function zoneSuggestInvalidationPatch(
  prevLat: number | null | undefined,
  prevLng: number | null | undefined,
  nextLat: number | null | undefined,
  nextLng: number | null | undefined,
): Pick<ZoneFormSlice, "zone_suggest_status" | "selected_zone_ids"> | null {
  if (!hasValidAddressCoords(nextLat, nextLng)) {
    return { zone_suggest_status: undefined, selected_zone_ids: [] };
  }
  if (
    hasValidAddressCoords(prevLat, prevLng) &&
    prevLat === nextLat &&
    prevLng === nextLng
  ) {
    return null;
  }
  return { zone_suggest_status: undefined, selected_zone_ids: [] };
}
