/**
 * Provider onboarding draft + submit shape (aligned with web /api/provider/onboarding).
 */

export type TeamSize = "freelancer" | "small" | "medium" | "large";
export type BusinessType = "salon" | "mobile" | "both";
export type YocoMachine = "yes" | "no" | "other";
export type PayrollType = "commission" | "hourly" | "both" | "other";

export interface OnboardingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface OnboardingService {
  id?: string;
  title: string;
  description?: string;
  duration_minutes: number;
  price: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  category_id?: string;
  /** Service classification (basic, addon, package, variant). */
  service_type?: string;
  /** Pricing label shown to customers, e.g. "Standard", "Hour 1". */
  pricing_name?: string;
  /** Optional aftercare instructions sent to customers post-service. */
  aftercare_description?: string;
  /** Who this service is for: "everyone" | "women" | "men" | etc. */
  service_available_for?: string;
  /** Whether the service is bookable online (in-app/web). Default true. */
  online_booking_enabled?: boolean;
  /** Maximum travel radius (km) for at-home services. */
  at_home_radius_km?: number;
  /** Currency adjustment added to the base price for at-home requests. */
  at_home_price_adjustment?: number;
  /** Tax rate percent (0 = no tax). */
  tax_rate?: number;
  /** When true, extra buffer time is reserved on the calendar after the service. */
  extra_time_enabled?: boolean;
  /** Buffer duration in minutes when `extra_time_enabled` is true. */
  extra_time_duration?: number;
  /** Multi-row pricing options; server auto-syncs named rows to variant offerings. */
  pricing_options?: Array<{
    id?: string;
    duration: number;
    priceType?: string;
    price_type?: string;
    price: number;
    pricingName?: string;
    pricing_name?: string;
  }>;
  team_member_ids?: string[];
  /** @deprecated Legacy inline add-ons; use `service_addons` on onboarding form data. */
  addons?: OnboardingServiceAddon[];
}

export interface OnboardingServiceAddon {
  parent_service_index: number;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  duration_minutes?: number;
  addon_category?: string;
}

export interface OnboardingFormData {
  team_size?: TeamSize;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  phone_verified: boolean;
  business_name: string;
  business_type: BusinessType;
  description: string;
  website?: string;
  years_in_business?: number;
  languages_spoken?: string[];
  social_media_links?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  yoco_machine?: YocoMachine;
  yoco_machine_other?: string;
  payout_setup_complete?: boolean;
  is_vat_registered?: boolean;
  vat_number?: string;
  previous_software?: string;
  previous_software_other?: string;
  payroll_type?: PayrollType;
  payroll_details?: string;
  address: OnboardingAddress;
  thumbnail_url?: string;
  avatar_url?: string;
  gallery?: string[];
  phone?: string;
  email?: string;
  selected_zone_ids?: string[];
  global_category_ids: string[];
  services: OnboardingService[];
  /** Add-ons created after parent services; mapped by parent_service_index. */
  service_addons?: OnboardingServiceAddon[];
  operating_hours: Record<string, { open: string; close: string; closed: boolean }>;
  selected_plan_id?: string;
  selected_plan_name?: string;
  no_plans_available?: boolean;
  /** When true, provider accepts ad-hoc / custom booking requests (defaults true in API). */
  accepts_custom_requests?: boolean;
  /**
   * When true, customers can leave tips on bookings for this provider. Defaults
   * to `true` server-side; the wizard preserves any explicit choice the
   * provider made on the sales-settings step.
   */
  tips_enabled?: boolean;
}

export interface OnboardingStepMeta {
  id: number;
  title: string;
  description: string;
  canSkip?: boolean;
  conditional?: (data: Partial<OnboardingFormData>) => boolean;
}
