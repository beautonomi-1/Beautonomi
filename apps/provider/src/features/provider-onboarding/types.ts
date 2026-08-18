/**
 * Provider onboarding draft + submit shape (aligned with web /api/provider/onboarding).
 */

export type TeamSize = "freelancer" | "small" | "medium" | "large";
export type BusinessType = "salon" | "mobile" | "both";
/** @deprecated Use TerminalOwnershipStatus from terminal types. Kept for backcompat during migration. */
export type YocoMachine = "yes" | "no" | "other";
export type PayrollType = "commission" | "hourly" | "both" | "other";

// ── Terminal capture types (replaces YocoMachine) ─────────────────────────────
export type TerminalOwnershipStatus =
  | "has_terminal"
  | "no_terminal"
  | "planning_to_get_terminal"
  | "unsure";

export type TerminalVendor =
  | "yoco"
  | "ikhokha"
  | "capitec"
  | "fnb"
  | "nedbank"
  | "absa"
  | "standard_bank"
  | "psp"
  | "other"
  | "unsure";

export type TerminalCountRange =
  | "one"
  | "two_to_three"
  | "four_to_ten"
  | "more_than_ten"
  | "unsure";

export type TerminalActiveUsageStatus = "yes" | "no" | "sometimes" | "unsure";
export type TerminalInterestLevel = "yes" | "maybe_later" | "no";

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
  /**
   * Provider-owned menu category name this service belongs to (from the
   * wizard's category step). The server resolves/creates the matching
   * `provider_categories` row and sets `provider_category_id`.
   */
  provider_category_name?: string;
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
  pricing_options?: {
    id?: string;
    duration: number;
    priceType?: string;
    price_type?: string;
    price: number;
    pricingName?: string;
    pricing_name?: string;
  }[];
  team_member_ids?: string[];
  /** @deprecated Legacy inline add-ons; use `service_addons` on onboarding form data. */
  addons?: OnboardingServiceAddon[];
}

export interface OnboardingTravelFeeTier {
  max_km: number;
  fee: number;
}

/**
 * Travel-fee intent captured in the wizard for mobile / both providers.
 * When `use_platform_default` is true (or the step is skipped) the server
 * seeds the platform standard. Custom values are re-validated server-side
 * against platform limits on submit.
 */
export interface OnboardingTravelFees {
  enabled: boolean;
  use_platform_default: boolean;
  pricing_model?: "per_km" | "tiered" | null;
  rate_per_km?: number | null;
  minimum_fee?: number | null;
  maximum_fee?: number | null;
  free_within_km?: number | null;
  tiers?: OnboardingTravelFeeTier[];
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
  email_verified: boolean;
  owner_phone: string;
  phone_verified: boolean;
  /** Declared date of birth (YYYY-MM-DD) for age assurance. */
  date_of_birth?: string;
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
  /** @deprecated Replaced by terminal_ownership_status. */
  yoco_machine?: YocoMachine;
  /** @deprecated Replaced by terminal_provider_other. */
  yoco_machine_other?: string;
  // Terminal capture (new generic fields)
  terminal_ownership_status?: TerminalOwnershipStatus;
  terminal_provider?: TerminalVendor;
  terminal_provider_other?: string;
  terminal_count_range?: TerminalCountRange;
  terminal_active_usage_status?: TerminalActiveUsageStatus;
  interested_in_platform_terminal?: TerminalInterestLevel;
  interested_in_terminal_subscription?: boolean;
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
  /** Travel-fee configuration for mobile / both providers (mirrors the settings screen). */
  travel_fees?: OnboardingTravelFees;
  global_category_ids: string[];
  /**
   * Provider-owned menu categories created in the wizard's category step.
   * Each may optionally map to a global category for marketplace discovery.
   * Created as `provider_categories` rows on submit.
   */
  provider_categories?: { name: string; global_category_id?: string }[];
  services: OnboardingService[];
  /** Add-ons created after parent services; mapped by parent_service_index. */
  service_addons?: OnboardingServiceAddon[];
  operating_hours: Record<string, { open: string; close: string; closed: boolean }>;
  selected_plan_id?: string;
  selected_plan_name?: string;
  selected_plan_is_free?: boolean;
  selected_billing_period?: "monthly" | "yearly";
  no_plans_available?: boolean;
  /** Client-only snapshot from platform-limits API; not sent on submit. */
  platform_travel_limits?: {
    provider_min_rate_per_km: number;
    provider_max_rate_per_km: number;
    provider_min_minimum_fee: number;
    provider_max_minimum_fee: number;
    allow_provider_customization: boolean;
    allow_provider_tiered: boolean;
  };
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
