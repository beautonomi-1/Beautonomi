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

const WEB_STEP_KEY_TO_ID: Record<WizardStepKey, number> = {
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

/** Bump when the web wizard step map changes; legacy numeric drafts remap on load. */
export const ONBOARDING_STEP_MAP_VERSION = 2;

/** Pre–travel-fees web drafts used steps 10–14 for categories…plan; insert travel at 10. */
export function remapLegacyWebDraftNumericStep(step: number): number {
  if (step >= 10 && step <= 14) return step + 1;
  return step;
}

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

export function wizardStepIdForKey(key: WizardStepKey, platform: "web" | "mobile" = "web"): number {
  if (platform === "mobile") {
    return MOBILE_STEP_KEY_TO_ID[key];
  }
  return WEB_STEP_KEY_TO_ID[key] ?? 1;
}

export function wizardStepKeyForId(stepId: number, platform: "web" | "mobile" = "web"): WizardStepKey | null {
  const map = platform === "mobile" ? MOBILE_STEP_KEY_TO_ID : WEB_STEP_KEY_TO_ID;
  for (const [key, id] of Object.entries(map) as [WizardStepKey, number][]) {
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

export function travelFeesStepVisible(data: Pick<ZoneFormSlice, "business_type">): boolean {
  return data.business_type === "mobile" || data.business_type === "both";
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
