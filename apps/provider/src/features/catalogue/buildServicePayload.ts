import type { AdvancedPricingRule, OfferingResourceEntry, PricingOption } from "./types";
import { pricingOptionsToPayload } from "./types";

export interface ServiceFormPayloadInput {
  name: string;
  categoryId: string;
  serviceType: string;
  description: string;
  aftercareDescription: string;
  availableFor: string;
  onlineBookable: boolean;
  teamMemberIds: string[];
  teamMemberCommissionEnabled: boolean;
  pricingOptions: PricingOption[];
  advancedPricingRules: AdvancedPricingRule[];
  extraTimeEnabled: boolean;
  extraTimeDuration: number;
  reminderToRebookEnabled: boolean;
  reminderToRebookWeeks: number;
  serviceCostPercentage: number;
  taxRate: number;
  includedServices: string[];
  isActive: boolean;
  supportsAtSalon: boolean;
  supportsAtHome: boolean;
  atHomeRadiusKm: number | null;
  atHomePriceAdjustment: number;
  addonCategory: string;
  applicableServiceIds: string[];
  isRecommended: boolean;
  parentServiceId: string;
  variantName: string;
  variantSortOrder: number;
}

export function buildServicePayload(input: ServiceFormPayloadInput) {
  const primary = input.pricingOptions[0] ?? {
    duration: 60,
    priceType: "fixed",
    price: 0,
    pricingName: "",
  };

  return {
    name: input.name.trim(),
    title: input.name.trim(),
    service_type: input.serviceType,
    provider_category_id: input.categoryId,
    description: input.description.trim() || null,
    aftercare_description: input.aftercareDescription.trim() || null,
    service_available_for: input.availableFor,
    online_booking_enabled: input.onlineBookable,
    team_member_ids: input.teamMemberIds,
    team_member_commission_enabled: input.teamMemberCommissionEnabled,
    duration_minutes: primary.duration,
    price: primary.price,
    price_type: primary.priceType,
    pricing_name: primary.pricingName || null,
    pricing_options: pricingOptionsToPayload(input.pricingOptions),
    advanced_pricing_rules: input.advancedPricingRules,
    extra_time_enabled: input.extraTimeEnabled,
    extra_time_duration: input.extraTimeEnabled ? input.extraTimeDuration : 0,
    reminder_to_rebook_enabled: input.reminderToRebookEnabled,
    reminder_to_rebook_weeks: input.reminderToRebookWeeks,
    service_cost_percentage: input.serviceCostPercentage,
    tax_rate: input.taxRate,
    included_services: input.includedServices,
    is_active: input.isActive,
    supports_at_salon: input.supportsAtSalon,
    supports_at_home: input.supportsAtHome,
    at_home_radius_km: input.supportsAtHome ? input.atHomeRadiusKm : null,
    at_home_price_adjustment: input.supportsAtHome ? input.atHomePriceAdjustment : 0,
    addon_category: input.serviceType === "addon" ? input.addonCategory : null,
    applicable_service_ids:
      input.serviceType === "addon" && input.applicableServiceIds.length > 0
        ? input.applicableServiceIds
        : null,
    is_recommended: input.serviceType === "addon" ? input.isRecommended : false,
    parent_service_id: input.serviceType === "variant" ? input.parentServiceId || null : null,
    variant_name: input.serviceType === "variant" ? input.variantName.trim() || null : null,
    variant_sort_order: input.serviceType === "variant" ? input.variantSortOrder : 0,
  };
}

export function buildResourcesPayload(resources: OfferingResourceEntry[]) {
  return { resources };
}
