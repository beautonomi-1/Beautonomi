import type { PricingOption } from "./types";

export interface ServiceFormValidationInput {
  name: string;
  categoryId: string;
  serviceType: string;
  parentServiceId: string;
  pricingOptions: PricingOption[];
  includedServices?: string[];
}

export function validateServiceForm(input: ServiceFormValidationInput): string | null {
  if (!input.name.trim()) return "Service name is required.";
  if (!input.categoryId || input.categoryId === "other" || input.categoryId === "all-services") {
    return "Service category is required.";
  }
  if (input.serviceType === "variant" && !input.parentServiceId) {
    return "Parent service is required for variants.";
  }
  if (input.serviceType === "package" && (input.includedServices?.length ?? 0) === 0) {
    return "Select at least one service to include in this package.";
  }
  const primary = input.pricingOptions[0];
  if (!primary || !primary.duration || primary.duration <= 0) {
    return "Duration must be a positive number (minutes).";
  }
  if (primary.price == null || Number.isNaN(primary.price) || primary.price < 0) {
    return "Price must be a valid number.";
  }
  return null;
}

export function validateAdvancedPricingRules(
  rules: { name: string; enabled: boolean; priceAdjustment: { value: number } }[],
): string | null {
  const invalid = rules.filter((r) => !r.name.trim() || (r.enabled && r.priceAdjustment.value === 0));
  if (invalid.length > 0) {
    return "Please complete all required fields for enabled advanced pricing rules.";
  }
  return null;
}
