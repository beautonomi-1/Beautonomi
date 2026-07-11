import "server-only";
import { haversineDistanceKmFromCoords } from "@/lib/geo/distance";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const TIME_PREFERENCE_WINDOWS: Record<
  "morning" | "afternoon" | "evening",
  { start: string; end: string }
> = {
  morning: { start: "06:00", end: "12:00" },
  afternoon: { start: "12:00", end: "17:00" },
  evening: { start: "17:00", end: "22:00" },
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function dayIndexForDateKey(date: string): number {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.getUTCDay() : 0;
}

function dayKeyForDateKey(date: string): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[dayIndexForDateKey(date)] ?? "sunday";
}

function parseTimeToMinutes(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function hoursOverlap(
  openTime: string,
  closeTime: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  const open = parseTimeToMinutes(openTime);
  const close = parseTimeToMinutes(closeTime);
  const start = parseTimeToMinutes(windowStart);
  const end = parseTimeToMinutes(windowEnd);
  if (open == null || close == null || start == null || end == null) return true;
  return open < end && start < close;
}

function isWorkingHoursOpenOnDate(
  workingHours: Record<string, unknown> | null | undefined,
  date: string,
): boolean {
  if (!workingHours || typeof workingHours !== "object") return true;

  const dayKey = dayKeyForDateKey(date);
  const hasAnyKeys = Object.keys(workingHours).length > 0;
  const day = workingHours[dayKey] as Record<string, unknown> | undefined;

  if (!hasAnyKeys) return true;
  if (day === undefined) return false;

  const isClosed = day.is_open === false || day.closed === true;
  return !isClosed;
}

function matchesTimePreference(
  openTime: string,
  closeTime: string,
  preference: "morning" | "afternoon" | "evening" | "any" | "custom" | undefined,
  customStart?: string,
  customEnd?: string,
): boolean {
  if (!preference || preference === "any") return true;

  if (preference === "custom") {
    if (!customStart || !customEnd) return true;
    return hoursOverlap(openTime, closeTime, customStart, customEnd);
  }

  const window = TIME_PREFERENCE_WINDOWS[preference];
  return hoursOverlap(openTime, closeTime, window.start, window.end);
}

function resolveWorkingHoursInterval(
  workingHours: Record<string, unknown> | null | undefined,
  date: string,
): { openTime: string; closeTime: string } | null {
  if (!workingHours || typeof workingHours !== "object") {
    return { openTime: "00:00", closeTime: "23:59" };
  }

  const dayKey = dayKeyForDateKey(date);
  const hasAnyKeys = Object.keys(workingHours).length > 0;
  const day = workingHours[dayKey] as Record<string, unknown> | undefined;

  if (!hasAnyKeys) return { openTime: "00:00", closeTime: "23:59" };
  if (!day) return null;

  const isClosed = day.is_open === false || day.closed === true;
  if (isClosed) return null;

  const openTime = String(day.open_time || day.open || "00:00").trim();
  const closeTime = String(day.close_time || day.close || "23:59").trim();
  return { openTime, closeTime };
}

export async function resolveSubcategoryId(
  supabase: any,
  subcategory: string,
  categoryId?: string,
): Promise<string | null> {
  if (isUuid(subcategory)) return subcategory;

  let query = supabase
    .from("subcategories")
    .select("id")
    .eq("slug", subcategory)
    .eq("is_active", true);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data } = await query.maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function getProviderIdsForOfferingFilters(args: {
  supabase: any;
  tenantId: string;
  priceMin?: number;
  priceMax?: number;
  subcategoryId?: string;
  service?: string;
  globalCategoryId?: string;
}): Promise<string[] | null> {
  const { supabase, tenantId, priceMin, priceMax, subcategoryId, service, globalCategoryId } =
    args;

  if (
    priceMin == null &&
    priceMax == null &&
    !subcategoryId &&
    !service &&
    !globalCategoryId
  ) {
    return null;
  }

  let offeringQuery = supabase
    .from("offerings")
    .select("provider_id, providers!inner(tenant_id, status)")
    .eq("is_active", true)
    .eq("providers.tenant_id", tenantId)
    .eq("providers.status", "active");

  if (globalCategoryId) {
    offeringQuery = offeringQuery.eq("category_id", globalCategoryId);
  }
  if (subcategoryId) {
    offeringQuery = offeringQuery.eq("subcategory_id", subcategoryId);
  }
  if (priceMin != null) {
    offeringQuery = offeringQuery.gte("price", priceMin);
  }
  if (priceMax != null) {
    offeringQuery = offeringQuery.lte("price", priceMax);
  }

  if (service) {
    if (isUuid(service)) {
      offeringQuery = offeringQuery.or(
        `id.eq.${service},master_service_id.eq.${service}`,
      );
    } else {
      const [{ data: masterService }, { data: offeringMatches }] = await Promise.all([
        supabase
          .from("master_services")
          .select("id")
          .eq("is_active", true)
          .ilike("name", `%${service}%`)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("offerings")
          .select("provider_id, providers!inner(tenant_id, status)")
          .eq("is_active", true)
          .eq("providers.tenant_id", tenantId)
          .eq("providers.status", "active")
          .ilike("title", `%${service}%`)
          .limit(300),
      ]);

      const masterServiceId = (masterService as { id?: string } | null)?.id;
      const titleProviderIds = uniqueStrings(
        (offeringMatches ?? []).map((row: { provider_id?: string }) => row.provider_id),
      );

      if (masterServiceId) {
        const { data: masterRows } = await supabase
          .from("offerings")
          .select("provider_id, providers!inner(tenant_id, status)")
          .eq("is_active", true)
          .eq("master_service_id", masterServiceId)
          .eq("providers.tenant_id", tenantId)
          .eq("providers.status", "active");

        return uniqueStrings([
          ...(masterRows ?? []).map((row: { provider_id?: string }) => row.provider_id),
          ...titleProviderIds,
        ]);
      }

      return titleProviderIds;
    }
  }

  const { data, error } = await offeringQuery.limit(1000);
  if (error) {
    console.error("Error querying offerings for search filters:", error);
    return null;
  }

  return uniqueStrings((data ?? []).map((row: { provider_id?: string }) => row.provider_id));
}

export async function getProviderIdsWithinRadius(args: {
  supabase: any;
  tenantId: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}): Promise<string[]> {
  const { supabase, tenantId, latitude, longitude, radiusKm } = args;

  const { data: locations, error } = await supabase
    .from("provider_locations")
    .select("provider_id, latitude, longitude, address_lat, address_lng, providers!inner(tenant_id, status)")
    .eq("is_active", true)
    .eq("providers.tenant_id", tenantId)
    .eq("providers.status", "active");

  if (error) {
    console.error("Error querying provider_locations for radius filter:", error);
    return [];
  }

  const withinRadius = new Set<string>();
  for (const loc of locations ?? []) {
    const lat = loc.latitude ?? loc.address_lat;
    const lng = loc.longitude ?? loc.address_lng;
    if (lat == null || lng == null) continue;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) continue;
    if (Number(lat) === 0 && Number(lng) === 0) continue;

    const km = haversineDistanceKmFromCoords(latitude, longitude, Number(lat), Number(lng));
    if (km <= radiusKm) {
      withinRadius.add(loc.provider_id);
    }
  }

  return [...withinRadius];
}

export async function getProviderIdsAvailableOnDate(args: {
  supabase: any;
  tenantId: string;
  date: string;
  timePreference?: "any" | "morning" | "afternoon" | "evening" | "custom";
  customTimeStart?: string;
  customTimeEnd?: string;
}): Promise<string[]> {
  const { supabase, tenantId, date, timePreference, customTimeStart, customTimeEnd } = args;
  const dayOfWeek = dayIndexForDateKey(date);
  const available = new Set<string>();
  const providersWithExplicitSchedule = new Set<string>();

  const [{ data: locations }, { data: schedules }, { data: activeProviders }] =
    await Promise.all([
    supabase
      .from("provider_locations")
      .select("provider_id, working_hours, providers!inner(tenant_id, status)")
      .eq("is_active", true)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active"),
    supabase
      .from("staff_schedules")
      .select("provider_id, start_time, end_time, providers!inner(tenant_id, status)")
      .eq("day_of_week", dayOfWeek)
      .eq("is_working", true)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active"),
    supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
  ]);

  for (const loc of locations ?? []) {
    const providerId = loc.provider_id as string | undefined;
    if (!providerId) continue;

    const workingHours = loc.working_hours as Record<string, unknown> | null | undefined;
    if (workingHours && Object.keys(workingHours).length > 0) {
      providersWithExplicitSchedule.add(providerId);
    }

    if (!isWorkingHoursOpenOnDate(workingHours, date)) continue;

    const interval = resolveWorkingHoursInterval(workingHours, date);
    if (!interval) continue;

    if (
      matchesTimePreference(
        interval.openTime,
        interval.closeTime,
        timePreference,
        customTimeStart,
        customTimeEnd,
      )
    ) {
      available.add(providerId);
    }
  }

  for (const schedule of schedules ?? []) {
    const providerId = schedule.provider_id as string | undefined;
    if (!providerId) continue;
    providersWithExplicitSchedule.add(providerId);

    const openTime = String(schedule.start_time ?? "00:00").slice(0, 5);
    const closeTime = String(schedule.end_time ?? "23:59").slice(0, 5);

    if (
      matchesTimePreference(
        openTime,
        closeTime,
        timePreference,
        customTimeStart,
        customTimeEnd,
      )
    ) {
      available.add(providerId);
    }
  }

  for (const provider of activeProviders ?? []) {
    const providerId = provider.id as string | undefined;
    if (!providerId) continue;
    if (!providersWithExplicitSchedule.has(providerId)) {
      available.add(providerId);
    }
  }

  return [...available];
}

export function intersectProviderIds(
  current: string[] | undefined,
  next: string[] | null,
): string[] | undefined {
  if (next == null) return current;
  if (next.length === 0) return [];
  if (!current) return next;
  const nextSet = new Set(next);
  return current.filter((id) => nextSet.has(id));
}
