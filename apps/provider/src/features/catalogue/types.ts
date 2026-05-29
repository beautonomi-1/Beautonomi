export interface PricingOption {
  id: string;
  duration: number;
  priceType: string;
  price: number;
  pricingName: string;
}

export interface AdvancedPricingRule {
  id: string;
  type: "time_based" | "location_based" | "client_type" | "package" | "seasonal";
  name: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  priceAdjustment: {
    type: "fixed" | "percentage";
    value: number;
  };
}

export interface OfferingResourceEntry {
  resource_id: string;
  required: boolean;
}

export interface CatalogueServiceItem {
  id: string;
  title?: string;
  name?: string;
  description?: string | null;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  is_active?: boolean;
  is_onboarding_auto_generated?: boolean;
  supports_at_home?: boolean;
  supports_at_salon?: boolean;
  at_home_radius_km?: number | null;
  at_home_price_adjustment?: number | null;
  provider_category_id?: string | null;
  display_order?: number | null;
  service_type?: string;
  parent_service_id?: string | null;
  variant_name?: string | null;
  variants?: CatalogueServiceItem[];
  provider_categories?: { id?: string; name: string; color?: string | null } | { id?: string; name: string; color?: string | null }[] | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  color?: string | null;
  display_order?: number | null;
}

export interface ServiceSection {
  sectionKey: string;
  title: string;
  color: string | null;
  sortOrder: number;
  items: CatalogueServiceItem[];
  isVirtual?: boolean;
}


export interface RefDataOption {
  value: string;
  label: string;
  description?: string;
}

export const DEFAULT_PRICING_OPTION = (): PricingOption => ({
  id: String(Date.now()),
  duration: 60,
  priceType: "fixed",
  price: 0,
  pricingName: "",
});

export function pricingOptionsFromService(service: {
  duration_minutes?: number;
  price?: number;
  price_type?: string;
  pricing_name?: string | null;
  pricing_options?: {
    id?: string;
    duration?: number;
    priceType?: string;
    price_type?: string;
    price?: number;
    pricingName?: string;
    pricing_name?: string;
  }[];
}): PricingOption[] {
  const raw = service.pricing_options;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((opt, idx) => ({
      id: opt.id ?? String(idx + 1),
      duration: opt.duration ?? service.duration_minutes ?? 60,
      priceType: opt.priceType ?? opt.price_type ?? "fixed",
      price: opt.price ?? 0,
      pricingName: opt.pricingName ?? opt.pricing_name ?? "",
    }));
  }
  return [
    {
      id: "1",
      duration: service.duration_minutes ?? 60,
      priceType: service.price_type ?? "fixed",
      price: service.price ?? 0,
      pricingName: service.pricing_name ?? "",
    },
  ];
}

export function pricingOptionsToPayload(options: PricingOption[]) {
  return options.map((opt) => ({
    id: opt.id,
    duration: opt.duration,
    priceType: opt.priceType,
    price: opt.price,
    pricingName: opt.pricingName,
  }));
}

/** Customer-facing tier label when pricingName is blank (matches server sync). */
export function resolveBookingTierName(
  opt: PricingOption,
  index: number,
  parentPricingName?: string | null,
): string {
  const trimmed = opt.pricingName.trim();
  if (trimmed) return trimmed;
  if (index === 0) return parentPricingName?.trim() || "Standard";
  return `Option ${index + 1}`;
}

export interface CustomerBookingTierPreview {
  name: string;
  durationMinutes: number;
  price: number;
  priceType: string;
}

/** Lines shown in the “what customers see” preview (empty when single-tier). */
export function buildCustomerBookingTierPreview(
  options: PricingOption[],
  parentPricingName?: string | null,
): CustomerBookingTierPreview[] {
  if (options.length <= 1) return [];
  return options.map((opt, index) => ({
    name: resolveBookingTierName(opt, index, parentPricingName),
    durationMinutes: opt.duration,
    price: opt.price,
    priceType: opt.priceType,
  }));
}
