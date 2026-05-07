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
  operating_hours: Record<string, { open: string; close: string; closed: boolean }>;
  selected_plan_id?: string;
  selected_plan_name?: string;
  no_plans_available?: boolean;
  /** When true, provider accepts ad-hoc / custom booking requests (defaults true in API). */
  accepts_custom_requests?: boolean;
}

export interface OnboardingStepMeta {
  id: number;
  title: string;
  description: string;
  canSkip?: boolean;
  conditional?: (data: Partial<OnboardingFormData>) => boolean;
}
