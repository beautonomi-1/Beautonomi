import type { BusinessType, OnboardingService } from "@/features/provider-onboarding/types";
import { buildServicePayload } from "./buildServicePayload";
import { validateServiceForm } from "./validateServiceForm";
import { pricingOptionsFromService } from "./types";
import { DEFAULT_SERVICE_FORM_STATE, type ServiceFormState } from "./service-form-state";

export function onboardingServiceToFormState(
  service: OnboardingService,
  categoryId?: string,
): ServiceFormState {
  const base = DEFAULT_SERVICE_FORM_STATE();
  return {
    ...base,
    name: service.title || "",
    categoryId: categoryId ?? service.provider_category_name ?? "",
    serviceType: "basic",
    description: service.description ?? "",
    aftercareDescription: service.aftercare_description ?? "",
    availableFor: service.service_available_for ?? "everyone",
    onlineBookable: service.online_booking_enabled !== false,
    supportsAtSalon: service.supports_at_salon !== false,
    supportsAtHome: service.supports_at_home ?? false,
    atHomeRadiusKm:
      service.at_home_radius_km != null ? String(service.at_home_radius_km) : "",
    atHomePriceAdjustment: String(service.at_home_price_adjustment ?? 0),
    taxRate: String(service.tax_rate ?? 0),
    extraTimeEnabled: service.extra_time_enabled ?? false,
    extraTimeDuration: String(service.extra_time_duration ?? 15),
    pricingOptions: pricingOptionsFromService(service),
  };
}

export interface FormStateToOnboardingServiceInput {
  form: ServiceFormState;
  categoryName: string;
  globalCategoryId?: string;
  currency: string;
  businessType: BusinessType;
}

export function formStateToOnboardingService(
  input: FormStateToOnboardingServiceInput,
): { service: OnboardingService | null; error: string | null } {
  const { form, categoryName, globalCategoryId, currency } = input;

  if (!categoryName.trim()) {
    return { service: null, error: "Select a category to continue." };
  }
  if (!form.supportsAtSalon && !form.supportsAtHome) {
    return { service: null, error: "Choose at least one availability option: salon or at-home." };
  }

  const validationError = validateServiceForm({
    name: form.name,
    categoryId: form.categoryId || categoryName.trim(),
    serviceType: "basic",
    parentServiceId: "",
    pricingOptions: form.pricingOptions,
  });
  if (validationError) {
    return { service: null, error: validationError };
  }

  const primaryPrice = form.pricingOptions[0]?.price ?? 0;
  if (primaryPrice <= 0) {
    return { service: null, error: "Enter a valid service price." };
  }

  const payload = buildServicePayload({
    name: form.name,
    categoryId: form.categoryId || categoryName.trim(),
    serviceType: "basic",
    description: form.description,
    aftercareDescription: form.aftercareDescription,
    availableFor: form.availableFor,
    onlineBookable: form.onlineBookable,
    teamMemberIds: [],
    teamMemberCommissionEnabled: false,
    pricingOptions: form.pricingOptions,
    advancedPricingRules: [],
    extraTimeEnabled: form.extraTimeEnabled,
    extraTimeDuration: parseInt(form.extraTimeDuration, 10) || 0,
    reminderToRebookEnabled: false,
    reminderToRebookWeeks: 4,
    serviceCostPercentage: 0,
    taxRate: parseFloat(form.taxRate) || 0,
    includedServices: [],
    isActive: true,
    supportsAtSalon: form.supportsAtSalon,
    supportsAtHome: form.supportsAtHome,
    atHomeRadiusKm:
      form.supportsAtHome && form.atHomeRadiusKm ? parseFloat(form.atHomeRadiusKm) : null,
    atHomePriceAdjustment: form.supportsAtHome ? parseFloat(form.atHomePriceAdjustment) || 0 : 0,
    addonCategory: "general",
    applicableServiceIds: [],
    isRecommended: false,
    parentServiceId: "",
    variantName: "",
    variantSortOrder: 0,
  });

  const supportsAtHome = payload.supports_at_home === true;
  const parsedRadius = payload.at_home_radius_km;

  return {
    service: {
      title: payload.title ?? payload.name,
      provider_category_name: categoryName.trim(),
      category_id: globalCategoryId,
      description: payload.description ?? undefined,
      duration_minutes: payload.duration_minutes,
      price: payload.price,
      currency,
      supports_at_home: supportsAtHome,
      supports_at_salon: payload.supports_at_salon !== false,
      service_type: "basic",
      pricing_name: payload.pricing_name ?? undefined,
      pricing_options: payload.pricing_options,
      aftercare_description: payload.aftercare_description ?? undefined,
      service_available_for: payload.service_available_for ?? "everyone",
      online_booking_enabled: payload.online_booking_enabled !== false,
      at_home_radius_km:
        supportsAtHome && parsedRadius != null && parsedRadius > 0 ? parsedRadius : undefined,
      at_home_price_adjustment: supportsAtHome ? payload.at_home_price_adjustment ?? 0 : 0,
      tax_rate: payload.tax_rate ?? 0,
      extra_time_enabled: payload.extra_time_enabled === true,
      extra_time_duration:
        payload.extra_time_enabled === true ? payload.extra_time_duration ?? 0 : 0,
    },
    error: null,
  };
}

export function defaultOnboardingFormState(businessType: BusinessType): ServiceFormState {
  const form = DEFAULT_SERVICE_FORM_STATE();
  form.serviceType = "basic";
  form.supportsAtSalon = businessType !== "mobile";
  form.supportsAtHome = businessType !== "salon";
  return form;
}
