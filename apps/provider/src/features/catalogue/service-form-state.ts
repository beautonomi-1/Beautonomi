import type { AdvancedPricingRule, PricingOption, RefDataOption } from "./types";
import { DEFAULT_PRICING_OPTION } from "./types";

export interface ServiceFormState {
  name: string;
  categoryId: string;
  serviceType: string;
  description: string;
  aftercareDescription: string;
  availableFor: string;
  onlineBookable: boolean;
  supportsAtSalon: boolean;
  supportsAtHome: boolean;
  atHomeRadiusKm: string;
  atHomePriceAdjustment: string;
  taxRate: string;
  teamMemberIds: string[];
  teamMemberCommissionEnabled: boolean;
  isActive: boolean;
  extraTimeEnabled: boolean;
  extraTimeDuration: string;
  reminderToRebookEnabled: boolean;
  reminderToRebookWeeks: string;
  serviceCostPercentage: string;
  includedServices: string[];
  applicableServiceIds: string[];
  addonCategory: string;
  isRecommended: boolean;
  parentServiceId: string;
  variantName: string;
  variantSortOrder: number;
  pricingOptions: PricingOption[];
  advancedPricingRules: AdvancedPricingRule[];
}

export const DEFAULT_SERVICE_FORM_STATE = (): ServiceFormState => ({
  name: "",
  categoryId: "",
  serviceType: "basic",
  description: "",
  aftercareDescription: "",
  availableFor: "everyone",
  onlineBookable: true,
  supportsAtSalon: true,
  supportsAtHome: false,
  atHomeRadiusKm: "",
  atHomePriceAdjustment: "0",
  taxRate: "0",
  teamMemberIds: [],
  teamMemberCommissionEnabled: false,
  isActive: true,
  extraTimeEnabled: false,
  extraTimeDuration: "15",
  reminderToRebookEnabled: false,
  reminderToRebookWeeks: "4",
  serviceCostPercentage: "0",
  includedServices: [],
  applicableServiceIds: [],
  addonCategory: "general",
  isRecommended: false,
  parentServiceId: "",
  variantName: "",
  variantSortOrder: 0,
  pricingOptions: [DEFAULT_PRICING_OPTION()],
  advancedPricingRules: [],
});

export interface ServiceCategoryOption {
  id: string;
  name: string;
  color?: string | null;
}

export interface ServiceFormRefData {
  service_type?: RefDataOption[];
  availability?: RefDataOption[];
  tax_rate?: RefDataOption[];
  duration?: RefDataOption[];
  price_type?: RefDataOption[];
  extra_time?: RefDataOption[];
  addon_category?: RefDataOption[];
}

export const FALLBACK_SERVICE_TYPE_OPTIONS: RefDataOption[] = [
  {
    value: "basic",
    label: "Basic service",
    description: "What most providers use. One service — add options below for multiple prices or lengths.",
  },
  {
    value: "variant",
    label: "Standalone variant",
    description: "Advanced only. Links to another service. Prefer Basic + booking options instead.",
  },
  {
    value: "addon",
    label: "Add-on",
    description: "Optional extra during checkout, not a main bookable service.",
  },
  {
    value: "package",
    label: "Package",
    description: "Bundle of services sold together at one price.",
  },
];

export const FALLBACK_AVAILABILITY_OPTIONS: RefDataOption[] = [
  { value: "everyone", label: "Everyone" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
];

export const FALLBACK_TAX_RATE_OPTIONS: RefDataOption[] = [
  { value: "0", label: "No tax" },
  { value: "15", label: "15% VAT" },
];

export const FALLBACK_DURATION_OPTIONS: RefDataOption[] = [
  { value: "5", label: "5 minutes" },
  { value: "10", label: "10 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "20", label: "20 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "75", label: "1 hour 15 minutes" },
  { value: "90", label: "1 hour 30 minutes" },
  { value: "105", label: "1 hour 45 minutes" },
  { value: "120", label: "2 hours" },
  { value: "150", label: "2 hours 30 minutes" },
  { value: "180", label: "3 hours" },
  { value: "210", label: "3 hours 30 minutes" },
  { value: "240", label: "4 hours" },
  { value: "300", label: "5 hours" },
  { value: "360", label: "6 hours" },
  { value: "480", label: "8 hours" },
];
export const FALLBACK_PRICE_TYPE_OPTIONS: RefDataOption[] = [{ value: "fixed", label: "Fixed" }];
export const FALLBACK_EXTRA_TIME_OPTIONS: RefDataOption[] = [{ value: "15", label: "15 min" }];
export const FALLBACK_ADDON_CATEGORY_OPTIONS: RefDataOption[] = [{ value: "general", label: "General" }];

export function resolveRefDataOptions(
  refData: ServiceFormRefData | Record<string, RefDataOption[]>,
): {
  serviceTypeOptions: RefDataOption[];
  availabilityOptions: RefDataOption[];
  taxRateOptions: RefDataOption[];
  durationOptions: RefDataOption[];
  priceTypeOptions: RefDataOption[];
  extraTimeOptions: RefDataOption[];
  addonCategoryOptions: RefDataOption[];
} {
  const ref = refData as ServiceFormRefData;
  return {
    serviceTypeOptions: ref.service_type?.length ? ref.service_type : FALLBACK_SERVICE_TYPE_OPTIONS,
    availabilityOptions: ref.availability?.length ? ref.availability : FALLBACK_AVAILABILITY_OPTIONS,
    taxRateOptions: ref.tax_rate?.length ? ref.tax_rate : FALLBACK_TAX_RATE_OPTIONS,
    durationOptions: ref.duration?.length ? ref.duration : FALLBACK_DURATION_OPTIONS,
    priceTypeOptions: ref.price_type?.length ? ref.price_type : FALLBACK_PRICE_TYPE_OPTIONS,
    extraTimeOptions: ref.extra_time?.length ? ref.extra_time : FALLBACK_EXTRA_TIME_OPTIONS,
    addonCategoryOptions: ref.addon_category?.length ? ref.addon_category : FALLBACK_ADDON_CATEGORY_OPTIONS,
  };
}
