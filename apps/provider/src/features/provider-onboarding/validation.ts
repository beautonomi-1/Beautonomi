import type { OnboardingFormData } from "./types";
import { coerceOwnerPhoneToE164ForForm, isValidOwnerPhoneE164 } from "./onboarding-phone";

export function validateStep(
  step: number,
  formData: Partial<OnboardingFormData>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (step) {
    case 1:
      if (!formData.team_size) errors.push("Please select your team size");
      break;
    case 2:
      if (!formData.owner_name?.trim()) errors.push("Your name is required");
      if (!formData.owner_email?.trim()) errors.push("Email is required");
      if (formData.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.owner_email)) {
        errors.push("Invalid email address");
      }
      if (!isValidOwnerPhoneE164(formData.owner_phone)) errors.push("Phone number is required");
      if (!formData.phone_verified) errors.push("Please verify your phone number");
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
    case 10:
      if (!formData.global_category_ids?.length) {
        errors.push("Please select at least one service category");
      }
      break;
    case 12: {
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
    case 14:
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
    yoco_machine: formData.yoco_machine ?? null,
    yoco_machine_other: formData.yoco_machine_other ?? null,
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
    selected_zone_ids: formData.selected_zone_ids || [],
    operating_hours: formData.operating_hours || {},
    services: formData.services || [],
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
    tips_enabled: false,
    cancellation_window_hours: 24,
    requires_deposit: false,
    deposit_percentage: null,
    no_show_fee_enabled: false,
    no_show_fee_amount: null,
    include_in_search_engines: true,
    selected_plan_id: formData.selected_plan_id ?? null,
  };
}
