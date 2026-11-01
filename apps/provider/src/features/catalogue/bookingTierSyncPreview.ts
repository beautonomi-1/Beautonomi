import type { CatalogueServiceItem, PricingOption } from "./types";
import { resolveBookingTierName } from "./types";

/** Matches server `dedupeVariantNames` for tier labels used at sync time. */
export function dedupeBookingTierNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    let suffix = 2;
    let candidate = `${name} (${suffix})`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${name} (${suffix})`;
    }
    used.add(candidate);
    return candidate;
  });
}

export function activeBookingTierNamesFromForm(
  pricingOptions: PricingOption[],
  parentPricingName?: string | null,
): string[] {
  if (pricingOptions.length <= 1) return [];
  const raw = pricingOptions.map((opt, index) =>
    resolveBookingTierName(opt, index, parentPricingName),
  );
  return dedupeBookingTierNames(raw);
}

export function childVariantDisplayName(svc: CatalogueServiceItem): string {
  const vn = svc.variant_name?.trim();
  if (vn) return vn;
  return (svc.title ?? svc.name ?? "Option").trim() || "Option";
}

/** Names of active child variants that this save would turn off (mirrors sync rules). */
export function listChildVariantsToTurnOff(
  parentServiceId: string,
  pricingOptions: PricingOption[],
  parentPricingName: string | null | undefined,
  allServices: CatalogueServiceItem[],
): string[] {
  const children = allServices.filter(
    (s) =>
      s.parent_service_id === parentServiceId &&
      s.service_type === "variant" &&
      s.is_active !== false,
  );
  if (children.length === 0) return [];

  if (pricingOptions.length <= 1) {
    return children.map(childVariantDisplayName);
  }

  const activeNames = new Set(
    activeBookingTierNamesFromForm(pricingOptions, parentPricingName),
  );
  return children
    .filter((c) => !activeNames.has(c.variant_name ?? ""))
    .map(childVariantDisplayName);
}
