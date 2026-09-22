import type { SupabaseClient } from "@supabase/supabase-js";

const WALK_IN_CUSTOM_SLUG = "__walk_in_custom__";

/** Web `custom-…` and mobile `custom:…` placeholder service ids. */
const CUSTOM_SERVICE_ID_PREFIX = /^custom[-:]/;

export type WalkInCustomServiceInput = {
  isCustom?: boolean;
  customName?: string;
  name?: string;
  serviceName?: string;
  service_name?: string;
  serviceId?: string;
  service_id?: string;
  offering_id?: string;
};

function serviceLineId(service: WalkInCustomServiceInput): string {
  const raw =
    service.serviceId ?? service.service_id ?? service.offering_id ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

export function isCustomServicePlaceholderId(id: string): boolean {
  return CUSTOM_SERVICE_ID_PREFIX.test(id.trim());
}

/**
 * Ensures a hidden per-provider offering used for ad-hoc walk-in custom service lines.
 */
export async function ensureWalkInCustomOffering(
  supabase: SupabaseClient,
  providerId: string,
  currency: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("offerings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("title", "Walk-in custom service")
    .eq("is_active", false)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("offerings")
    .insert({
      provider_id: providerId,
      title: "Walk-in custom service",
      description: "Internal placeholder for provider-entered custom walk-in services",
      duration_minutes: 60,
      price: 0,
      currency,
      is_active: false,
      supports_at_salon: true,
      supports_at_home: true,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message ?? "Could not create custom service offering");
  }

  return created.id as string;
}

export function isWalkInCustomServiceInput(service: WalkInCustomServiceInput): boolean {
  if (service.isCustom === true) return true;
  if (service.customName?.trim()) return true;
  const id = serviceLineId(service);
  if (id && isCustomServicePlaceholderId(id)) return true;
  return false;
}

export function walkInCustomServiceLabel(service: WalkInCustomServiceInput): string {
  const label =
    service.customName?.trim() ||
    service.name?.trim() ||
    service.serviceName?.trim() ||
    service.service_name?.trim() ||
    "Custom service";
  return label;
}

type WalkInCustomizationJson = {
  display_name?: string;
  is_walk_in_custom?: boolean;
  custom_line_index?: number;
  notes?: string;
};

export function parseWalkInCustomizationJson(
  customization: string | null | undefined,
): WalkInCustomizationJson | null {
  if (customization == null || typeof customization !== "string") return null;
  const trimmed = customization.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as WalkInCustomizationJson;
    if (parsed?.is_walk_in_custom === true) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Calendar/list/detail title: walk-in custom JSON display_name, else catalog offering title. */
export function resolveBookingServiceDisplayName(params: {
  offeringTitle?: string | null;
  customization?: string | null;
}): string {
  const walkIn = parseWalkInCustomizationJson(params.customization);
  if (walkIn?.display_name?.trim()) {
    return walkIn.display_name.trim();
  }
  const title = params.offeringTitle?.trim();
  return title || "Service";
}

/** API field for edit/calendar: plain note only, never walk-in JSON blob. */
export function bookingServiceCustomizationForApi(
  customization: string | null | undefined,
): string | null {
  if (customization == null || typeof customization !== "string") return null;
  const trimmed = customization.trim();
  if (!trimmed.length) return null;
  if (parseWalkInCustomizationJson(trimmed)) return null;
  return trimmed;
}

export function isPlaceholderOfferingIdForResourceCheck(id: string): boolean {
  return isCustomServicePlaceholderId(id);
}

type BookingServiceRowForApi = {
  id?: string;
  offering_id?: string | null;
  staff_id?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
  currency?: string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  guest_name?: string | null;
  customization?: string | null;
  offering?: { title?: string | null } | null;
  offerings?: { title?: string | null } | { title?: string | null }[] | null;
  staff?: { name?: string | null; role?: string | null } | { name?: string | null }[] | null;
};

function offeringTitleFromRow(bs: BookingServiceRowForApi): string {
  const offering = Array.isArray(bs.offerings) ? bs.offerings[0] : bs.offerings ?? bs.offering;
  return offering?.title?.trim() || "Service";
}

/** Provider list/detail API shape for one booking_services row. */
export function mapProviderBookingServiceLineForApi(
  bs: BookingServiceRowForApi,
  options?: { listIdFallback?: boolean; defaultTitle?: string },
) {
  const offeringTitle = offeringTitleFromRow(bs) || options?.defaultTitle || "Service";
  const displayName = resolveBookingServiceDisplayName({
    offeringTitle,
    customization: bs.customization,
  });
  const staffObj = Array.isArray(bs.staff) ? bs.staff[0] : bs.staff;
  return {
    id: options?.listIdFallback ? bs.offering_id || bs.id : bs.id,
    offering_id: bs.offering_id,
    service_id: bs.offering_id,
    staff_id: bs.staff_id ?? null,
    staff_name: staffObj?.name ?? null,
    staff: staffObj,
    name: displayName,
    offering_name: displayName,
    service_name: displayName,
    duration_minutes: bs.duration_minutes ?? 60,
    price: bs.price ?? 0,
    currency: bs.currency,
    scheduled_start_at: bs.scheduled_start_at,
    scheduled_end_at: bs.scheduled_end_at,
    guest_name: bs.guest_name ?? null,
    customization: bookingServiceCustomizationForApi(bs.customization),
  };
}

export { WALK_IN_CUSTOM_SLUG };
