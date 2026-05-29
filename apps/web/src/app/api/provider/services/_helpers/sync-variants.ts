import type { SupabaseClient } from "@supabase/supabase-js";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export interface RawPricingOption {
  id?: string;
  price?: number;
  duration?: number;
  priceType?: string;
  price_type?: string;
  pricingName?: string;
  pricing_name?: string;
}

export interface NormalizedPricingOption {
  id: string;
  price: number;
  duration: number;
  priceType: string;
  pricingName: string;
  variantName: string;
  sortOrder: number;
}

export interface VariantSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  synced: number;
  errors: string[];
}

interface ExistingVariant {
  id: string;
  variant_name: string;
}

/**
 * Normalizes a raw pricing_options row (camelCase or snake_case) and resolves
 * the bookable variant_name used at booking time.
 */
export function normalizePricingOption(
  opt: RawPricingOption,
  index: number,
  parentService: Record<string, unknown>,
): NormalizedPricingOption {
  const pricingName = String(opt.pricingName ?? opt.pricing_name ?? "").trim();
  const parentPricingName = String(parentService.pricing_name ?? "").trim();
  const parentDuration = Number(parentService.duration_minutes) || 60;

  let variantName: string;
  if (pricingName) {
    variantName = pricingName;
  } else if (index === 0) {
    variantName = parentPricingName || "Standard";
  } else {
    variantName = `Option ${index + 1}`;
  }

  return {
    id: opt.id ?? String(index + 1),
    price: Number(opt.price) || 0,
    duration: Number(opt.duration) || parentDuration,
    priceType: String(opt.priceType ?? opt.price_type ?? "fixed"),
    pricingName,
    variantName,
    sortOrder: index,
  };
}

/** Ensures unique variant_name values before upsert (appends " (2)" etc.). */
export function dedupeVariantNames(
  options: NormalizedPricingOption[],
): NormalizedPricingOption[] {
  const used = new Set<string>();

  return options.map((opt) => {
    if (!used.has(opt.variantName)) {
      used.add(opt.variantName);
      return opt;
    }

    let suffix = 2;
    let candidate = `${opt.variantName} (${suffix})`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${opt.variantName} (${suffix})`;
    }
    used.add(candidate);
    return { ...opt, variantName: candidate };
  });
}

/** Customer-facing tier label preview (matches sync). */
export function previewBookingTierName(
  opt: RawPricingOption,
  index: number,
  parentPricingName?: string | null,
): string {
  return normalizePricingOption(opt, index, { pricing_name: parentPricingName ?? "" }).variantName;
}

/** Builds normalized tier rows for sync; empty when single-tier (parent-only bookable). */
export function buildNormalizedTierOptions(
  pricingOptions: RawPricingOption[],
  parentService: Record<string, unknown>,
): NormalizedPricingOption[] {
  if (!Array.isArray(pricingOptions) || pricingOptions.length <= 1) {
    return [];
  }

  const normalized = pricingOptions.map((opt, index) =>
    normalizePricingOption(opt, index, parentService),
  );
  return dedupeVariantNames(normalized);
}

/**
 * When a client PATCHes primary price/duration without sending pricing_options,
 * keep tier 0 in stored JSON aligned so variant sync updates the bookable tier.
 */
export function mergePrimaryTierIntoStoredPricingOptions(
  storedOptions: RawPricingOption[] | null | undefined,
  primaryPrice: number,
  primaryDuration: number,
): RawPricingOption[] | null {
  if (!Array.isArray(storedOptions) || storedOptions.length <= 1) {
    return null;
  }
  return storedOptions.map((opt, idx) =>
    idx === 0 ? { ...opt, price: primaryPrice, duration: primaryDuration } : opt,
  );
}

/** True when pricing_options sync should run (basic/package/addon parents, not manual variants). */
export function shouldSyncPricingOptionVariants(serviceType: unknown): boolean {
  return serviceType !== "variant";
}

/**
 * Keeps child variant offerings in sync with a parent service's pricing_options array.
 *
 * Rules:
 *  - Single pricing option: parent row is bookable; existing child variants are deactivated.
 *  - Multiple pricing options: every row is materialised as a child variant row.
 *  - Blank tier names are auto-generated (Standard / Option N).
 *  - Child variants no longer in pricing_options are soft-deleted.
 *  - If price is 0 in the option, the parent service price is used as fallback.
 */
export async function syncVariantOfferings(
  supabase: SupabaseClient,
  parentService: Record<string, unknown>,
  pricingOptions: RawPricingOption[],
): Promise<VariantSyncResult> {
  const result: VariantSyncResult = {
    created: 0,
    updated: 0,
    deactivated: 0,
    synced: 0,
    errors: [],
  };

  try {
    const parentId = parentService.id as string;
    if (!parentId) {
      result.errors.push("Missing parent service id");
      return result;
    }

    const tierOptions = buildNormalizedTierOptions(pricingOptions, parentService);

    const { data: existingVariants, error: loadError } = await supabase
      .from("offerings")
      .select("id, variant_name")
      .eq("parent_service_id", parentId)
      .eq("service_type", "variant");

    if (loadError) {
      result.errors.push(loadError.message);
      return result;
    }

    const existingMap = new Map<string, string>(
      ((existingVariants as ExistingVariant[]) ?? []).map((v) => [v.variant_name, v.id]),
    );

    const activeNames = new Set(tierOptions.map((o) => o.variantName));

    for (const opt of tierOptions) {
      const name = opt.variantName;
      const parentPrice = Number(parentService.price) || 0;
      const parentDuration = Number(parentService.duration_minutes) || 60;
      const variantPrice = opt.price > 0 ? opt.price : parentPrice;
      const variantDuration = opt.duration > 0 ? opt.duration : parentDuration;

      const variantData: Record<string, unknown> = {
        provider_id: parentService.provider_id,
        parent_service_id: parentId,
        service_type: "variant",
        title: `${parentService.title} - ${name}`,
        variant_name: name,
        description: parentService.description ?? null,
        duration_minutes: variantDuration,
        buffer_minutes: parentService.buffer_minutes ?? 15,
        price: variantPrice,
        currency: parentService.currency ?? LAST_RESORT_CURRENCY,
        supports_at_home: parentService.supports_at_home ?? false,
        supports_at_salon: parentService.supports_at_salon ?? true,
        at_home_radius_km: parentService.at_home_radius_km ?? null,
        at_home_price_adjustment: parentService.at_home_price_adjustment ?? 0,
        thumbnail_url: parentService.thumbnail_url ?? null,
        images: parentService.images ?? [],
        is_active: parentService.is_active ?? true,
        online_booking_enabled: parentService.online_booking_enabled ?? true,
        aftercare_description: parentService.aftercare_description ?? null,
        tax_rate: parentService.tax_rate ?? 0,
        provider_category_id: parentService.provider_category_id ?? null,
        team_member_commission_enabled:
          parentService.team_member_commission_enabled ?? false,
        service_available_for: parentService.service_available_for ?? "everyone",
        team_member_ids: parentService.team_member_ids ?? [],
        variant_sort_order: opt.sortOrder,
        updated_at: new Date().toISOString(),
      };

      if (existingMap.has(name)) {
        const { error } = await supabase
          .from("offerings")
          .update(variantData)
          .eq("id", existingMap.get(name)!);
        if (error) {
          result.errors.push(`Update variant "${name}": ${error.message}`);
        } else {
          result.updated += 1;
          result.synced += 1;
        }
      } else {
        const { error } = await supabase.from("offerings").insert(variantData);
        if (error) {
          result.errors.push(`Create variant "${name}": ${error.message}`);
        } else {
          result.created += 1;
          result.synced += 1;
        }
      }
    }

    const toDeactivate = ((existingVariants as ExistingVariant[]) ?? [])
      .filter((v) => !activeNames.has(v.variant_name))
      .map((v) => v.id);

    if (toDeactivate.length > 0) {
      const { error } = await supabase
        .from("offerings")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("id", toDeactivate);
      if (error) {
        result.errors.push(`Deactivate removed variants: ${error.message}`);
      } else {
        result.deactivated = toDeactivate.length;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(message);
    console.error("[syncVariantOfferings] Failed to sync variants:", err);
  }

  return result;
}
