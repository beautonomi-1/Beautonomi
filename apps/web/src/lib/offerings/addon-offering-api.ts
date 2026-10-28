import type { AddonTargetIds } from "@/lib/offerings/addon-applicability";
import { addonAppliesTo } from "@/lib/offerings/addon-applicability";

export type OfferingAddonRow = {
  id: string;
  provider_id: string;
  title: string;
  description?: string | null;
  price: number;
  currency?: string | null;
  duration_minutes?: number | null;
  is_active?: boolean | null;
  is_recommended?: boolean | null;
  display_order?: number | null;
  addon_category?: string | null;
  applicable_service_ids?: string[] | null;
  thumbnail_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** UI/API shape expected by provider admin and customer checkout (name/sort_order legacy). */
export function mapOfferingRowToAddonApi(row: OfferingAddonRow) {
  const title = row.title ?? "";
  const serviceIds = Array.isArray(row.applicable_service_ids) ? row.applicable_service_ids : [];
  return {
    ...row,
    name: title,
    title,
    sort_order: row.display_order ?? 0,
    category: row.addon_category ?? null,
    service_ids: serviceIds,
    type: "service" as const,
    duration_minutes: row.duration_minutes ?? 0,
  };
}

export function filterAddonsByLocation<T extends { id: string }>(
  addons: T[],
  locationId: string | null,
  addonLocs: Array<{ addon_id: string }> | null,
  allAddonLocs: Array<{ addon_id: string }> | null,
): T[] {
  if (!locationId || addons.length === 0) return addons;
  const addonIdsAtLocation = new Set((addonLocs ?? []).map((r) => r.addon_id));
  const addonIdsWithRestriction = new Set((allAddonLocs ?? []).map((r) => r.addon_id));
  return addons.filter(
    (a) => !addonIdsWithRestriction.has(a.id) || addonIdsAtLocation.has(a.id),
  );
}

export function filterAddonsByService<T extends { applicable_service_ids?: string[] | null }>(
  addons: T[],
  target: AddonTargetIds | null,
): T[] {
  if (!target) return addons;
  return addons.filter((addon) => addonAppliesTo(addon, target));
}

/** product/upgrade filters have no backing column — return empty list. */
export function shouldReturnEmptyForAddonTypeFilter(type: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === "product" || t === "upgrade";
}

export type AddonWriteInput = {
  name?: string;
  description?: string | null;
  category?: string | null;
  price: number;
  currency?: string;
  duration_minutes?: number | null;
  is_active?: boolean;
  is_recommended?: boolean;
  sort_order?: number;
  service_ids?: string[];
  image_url?: string | null;
};

export function buildOfferingInsertFromAddonBody(
  providerId: string,
  input: AddonWriteInput,
  currencyDefault: string,
): Record<string, unknown> {
  const serviceIds = input.service_ids?.filter(Boolean) ?? [];
  return {
    provider_id: providerId,
    service_type: "addon",
    title: (input.name ?? "").trim(),
    description: input.description ?? null,
    price: input.price,
    currency: input.currency ?? currencyDefault,
    duration_minutes: input.duration_minutes ?? 0,
    is_active: input.is_active ?? true,
    is_recommended: input.is_recommended ?? false,
    display_order: input.sort_order ?? 0,
    addon_category: input.category ?? null,
    applicable_service_ids: serviceIds.length > 0 ? serviceIds : null,
    online_booking_enabled: true,
    ...(input.image_url ? { thumbnail_url: input.image_url } : {}),
  };
}

export function buildOfferingUpdateFromAddonBody(input: Partial<AddonWriteInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.title = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.price !== undefined) patch.price = input.price;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.duration_minutes !== undefined) patch.duration_minutes = input.duration_minutes ?? 0;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_recommended !== undefined) patch.is_recommended = input.is_recommended;
  if (input.sort_order !== undefined) patch.display_order = input.sort_order;
  if (input.category !== undefined) patch.addon_category = input.category;
  if (input.service_ids !== undefined) {
    patch.applicable_service_ids =
      input.service_ids.length > 0 ? input.service_ids : null;
  }
  if (input.image_url !== undefined) patch.thumbnail_url = input.image_url;
  return patch;
}

export const OFFERING_ADDON_SELECT =
  "id, provider_id, title, description, price, currency, duration_minutes, is_active, is_recommended, display_order, addon_category, applicable_service_ids, thumbnail_url, created_at, updated_at";
