import { parseLegalDobIso, validateLegalDobParts } from "@beautonomi/utils";
import type { OnboardingFormData } from "./types";
import { coerceOwnerPhoneToE164ForForm, isValidOwnerPhoneE164 } from "./onboarding-phone";

export type ValidateStepOptions = {
  /** Skip Apple-provided identity fields (name, email, email OTP). */
  appleIdentity?: boolean;
  /** App Review demo account — contacts already verified. */
  demoIdentity?: boolean;
};

export function validateStep(
  step: number,
  formData: Partial<OnboardingFormData>,
  options?: ValidateStepOptions,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const skipIdentityFields = options?.appleIdentity === true || options?.demoIdentity === true;

  switch (step) {
    case 1:
      if (!formData.team_size) errors.push("Please select your team size");
      break;
    case 2:
      if (!skipIdentityFields) {
        if (!formData.owner_name?.trim()) errors.push("Your name is required");
        if (!formData.owner_email?.trim()) errors.push("Email is required");
        if (!formData.email_verified) errors.push("Please verify your email address");
      }
      if (!isValidOwnerPhoneE164(formData.owner_phone)) errors.push("Phone number is required");
      if (!formData.phone_verified) errors.push("Please verify your phone number");
      if (!formData.date_of_birth?.trim()) {
        errors.push("Date of birth is required");
      } else {
        const dobError = validateLegalDobParts(parseLegalDobIso(formData.date_of_birth), {
          minAge: 13,
        });
        if (dobError) errors.push(dobError);
      }
      break;
    case 3:
      if (!formData.business_name?.trim()) errors.push("Business name is required");
      break;
    case 4:
      if (formData.is_vat_registered === true) {
        if (!formData.vat_number?.trim()) errors.push("VAT number is required when VAT registered");
        else if (formData.vat_number.length !== 10) errors.push("VAT number must be 10 digits");
        else if (!formData.vat_number.startsWith("4")) {
          errors.push("South African VAT numbers must start with 4");
        }
      }
      break;
    case 7:
      if (!formData.address?.line1?.trim()) errors.push("Street address is required");
      if (!formData.address?.city?.trim()) errors.push("City is required");
      if (!formData.address?.country?.trim()) errors.push("Country is required");
      break;
    case 8:
      if (!formData.thumbnail_url?.trim()) {
        errors.push("Please upload a main thumbnail photo for your provider card");
      }
      if (!formData.avatar_url?.trim()) {
        errors.push("Please upload a profile image/avatar for your provider card");
      }
      break;
    case 9:
      if (formData.business_type === "mobile" || formData.business_type === "both") {
        if (!formData.selected_zone_ids?.length) {
          errors.push("Please select at least one service zone");
        }
      }
      break;
    case 10: {
      // Travel fees — optional/skippable. Only validate when the provider opts
      // into custom pricing (server re-checks against platform limits on submit).
      const tf = formData.travel_fees;
      const limits = formData.platform_travel_limits;
      if (tf && tf.enabled && tf.use_platform_default === false) {
        if (tf.pricing_model === "tiered") {
          if (limits && limits.allow_provider_tiered === false) {
            errors.push("Tiered travel fees are not available — use per-km pricing or platform defaults");
          }
          const tiers = tf.tiers || [];
          if (tiers.length === 0) {
            errors.push("Add at least one distance tier or use platform defaults");
          } else {
            for (let i = 1; i < tiers.length; i++) {
              if (tiers[i].max_km <= tiers[i - 1].max_km) {
                errors.push("Travel-fee tiers must be in ascending order by max km");
                break;
              }
            }
          }
        } else {
          if (tf.rate_per_km == null || !Number.isFinite(tf.rate_per_km) || tf.rate_per_km < 0) {
            errors.push("Enter a valid rate per km or use platform defaults");
          } else if (limits) {
            if (
              tf.rate_per_km < limits.provider_min_rate_per_km ||
              tf.rate_per_km > limits.provider_max_rate_per_km
            ) {
              errors.push(
                `Rate per km must be between ${limits.provider_min_rate_per_km} and ${limits.provider_max_rate_per_km}`,
              );
            }
          }
          if (tf.minimum_fee != null && Number.isFinite(tf.minimum_fee) && limits) {
            if (
              tf.minimum_fee < limits.provider_min_minimum_fee ||
              tf.minimum_fee > limits.provider_max_minimum_fee
            ) {
              errors.push(
                `Minimum fee must be between ${limits.provider_min_minimum_fee} and ${limits.provider_max_minimum_fee}`,
              );
            }
          }
        }
      }
      break;
    }
    case 11:
      if (!formData.global_category_ids?.length) {
        errors.push("Please select at least one service category");
      }
      break;
    case 12: {
      const services = formData.services || [];
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const label = `Service ${i + 1}`;
        if (!service?.title?.trim()) errors.push(`${label}: title is required`);
        if (!service?.provider_category_name?.trim() && !service?.category_id?.trim()) {
          errors.push(`${label}: category is required`);
        }
        if (!Number.isFinite(service?.duration_minutes) || Number(service?.duration_minutes) <= 0) {
          errors.push(`${label}: duration must be greater than 0`);
        }
        if (!Number.isFinite(service?.price) || Number(service?.price) < 0) {
          errors.push(`${label}: price must be 0 or higher`);
        }
        if (!service?.supports_at_home && !service?.supports_at_salon) {
          errors.push(`${label}: select at least one availability option`);
        }
        if (service?.extra_time_enabled) {
          if (!Number.isFinite(service?.extra_time_duration) || Number(service?.extra_time_duration) <= 0) {
            errors.push(`${label}: extra time duration must be greater than 0`);
          }
        }
        if (service?.at_home_radius_km != null && !Number.isFinite(service.at_home_radius_km)) {
          errors.push(`${label}: at-home radius must be a number`);
        }
        const addons = formData.service_addons || [];
        for (let j = 0; j < addons.length; j++) {
          const addon = addons[j];
          const addonLabel = `Add-on ${j + 1}`;
          if (!addon?.name?.trim()) errors.push(`${addonLabel}: name is required`);
          if (!Number.isFinite(addon?.price) || Number(addon?.price) < 0) {
            errors.push(`${addonLabel}: price must be 0 or higher`);
          }
          if (!Number.isFinite(addon?.parent_service_index) || addon.parent_service_index < 0) {
            errors.push(`${addonLabel}: parent service reference is invalid`);
          }
        }
      }
      break;
    }
    case 13: {
      const hours = formData.operating_hours;
      if (!hours || Object.keys(hours).length === 0) {
        errors.push("Please set your operating hours");
      } else {
        const hasOpenDay = Object.values(hours).some(
          (h: any) => h && !h.closed,
        );
        if (!hasOpenDay) {
          errors.push("At least one day must be open");
        }
      }
      break;
    }
    case 15:
      if (!formData.selected_plan_id?.trim() && !formData.no_plans_available) {
        errors.push("Please select a subscription plan");
      }
      break;
    default:
      break;
  }

  return { valid: errors.length === 0, errors };
}

export function buildSubmitPayload(formData: Partial<OnboardingFormData>): Record<string, unknown> {
  const ownerE164 = coerceOwnerPhoneToE164ForForm(formData.owner_phone) || formData.owner_phone || "";
  return {
    team_size: formData.team_size ?? null,
    owner_name: formData.owner_name,
    owner_email: formData.owner_email,
    owner_phone: ownerE164,
    date_of_birth: formData.date_of_birth ?? null,
    terminal_ownership_status: formData.terminal_ownership_status ?? null,
    terminal_provider: formData.terminal_provider ?? null,
    terminal_provider_other: formData.terminal_provider_other ?? null,
    terminal_count_range: formData.terminal_count_range ?? null,
    terminal_active_usage_status: formData.terminal_active_usage_status ?? null,
    interested_in_platform_terminal: formData.interested_in_platform_terminal ?? null,
    interested_in_terminal_subscription: formData.interested_in_terminal_subscription ?? null,
    payroll_type: formData.payroll_type ?? null,
    payroll_details: formData.payroll_details ?? null,
    is_vat_registered: formData.is_vat_registered ?? null,
    vat_number: formData.vat_number ?? null,
    business_name: formData.business_name,
    business_type: formData.business_type,
    description: formData.description || null,
    previous_software: formData.previous_software ?? null,
    previous_software_other: formData.previous_software_other ?? null,
    phone: ownerE164,
    email: formData.owner_email,
    address: {
      line1: formData.address?.line1 || "",
      line2: formData.address?.line2 ?? null,
      city: formData.address?.city || "",
      state: formData.address?.state ?? null,
      postal_code: formData.address?.postal_code ?? null,
      country: formData.address?.country || "",
      latitude: formData.address?.latitude ?? null,
      longitude: formData.address?.longitude ?? null,
    },
    global_category_ids: formData.global_category_ids || [],
    provider_categories: (formData.provider_categories || [])
      .map((c) => ({ name: (c.name || "").trim(), global_category_id: c.global_category_id }))
      .filter((c) => c.name.length > 0),
    selected_zone_ids: formData.selected_zone_ids || [],
    travel_fees: formData.travel_fees ?? { enabled: true, use_platform_default: true },
    operating_hours: formData.operating_hours || {},
    services: (formData.services || []).map(({ addons: _legacy, ...svc }) => svc),
    service_addons: formData.service_addons || [],
    thumbnail_url: formData.thumbnail_url ?? null,
    avatar_url: formData.avatar_url ?? null,
    gallery: formData.gallery || [],
    years_in_business: formData.years_in_business ?? null,
    accepts_custom_requests: formData.accepts_custom_requests ?? true,
    response_rate: 100,
    response_time_hours: 1,
    languages_spoken: formData.languages_spoken?.length ? formData.languages_spoken : ["English"],
    social_media_links: formData.social_media_links || {},
    website: formData.website ?? null,
    tax_rate_percent: null,
    tips_enabled: formData.tips_enabled ?? true,
    cancellation_window_hours: 24,
    requires_deposit: false,
    deposit_percentage: null,
    no_show_fee_enabled: false,
    no_show_fee_amount: null,
    include_in_search_engines: true,
    selected_plan_id: formData.selected_plan_id ?? null,
  };
}
