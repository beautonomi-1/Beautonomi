/**
 * Types for the provider online booking engine (multi-step, high-conversion flow).
 * Single bookingData state drives the entire flow.
 */

export type BookingStep =
  | "venue"
  | "category"
  | "services"
  | "addons"
  | "group"
  | "staff"
  | "schedule"
  | "resources"
  | "intake"
  | "review";

/** One participant in a group booking (additional guests; primary = booker) */
export interface GroupParticipant {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Offering IDs for this participant's services */
  service_ids: string[];
  notes?: string | null;
}

export type VenueType = "at_salon" | "at_home";

export interface LocationOption {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  country: string;
  is_primary?: boolean;
  /** 'salon' = physical venue for at_salon; 'base' = distance/travel reference only (mobile-only) */
  location_type?: "salon" | "base";
}

export interface AtHomeAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
  /** Set by map/geocode for distance and travel fee calculation */
  latitude?: number | null;
  longitude?: number | null;
}

export interface ServiceOption {
  id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  master_service_name?: string;
  supports_at_home?: boolean;
  at_home_price_adjustment?: number | null;
}

export interface ServiceVariant {
  id: string;
  title: string;
  variant_name?: string;
  price: number;
  duration: number;
  currency: string;
}

export interface PackageOption {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  discount_percentage?: number | null;
  items?: Array<{
    id: string;
    title: string;
    type: "service" | "product";
    duration_minutes?: number;
    quantity?: number;
  }>;
  services?: Array<{ id: string; title: string; duration_minutes?: number; quantity?: number }>;
}

export interface AddonOption {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  duration_minutes?: number;
  currency: string;
  is_recommended?: boolean;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  rating?: number | null;
}

export interface BookingServiceEntry {
  offering_id: string;
  title: string;
  duration_minutes: number;
  price: number;
  currency: string;
  staff_id?: string | null;
}

export interface ClientIntake {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests: string;
}

/** Provider intake/consent form response: formId -> { fieldId -> value } */
export type ProviderFormResponses = Record<
  string,
  Record<string, string | number | boolean | null>
>;

/** Platform booking custom field values: field name -> value */
export type CustomFieldValues = Record<string, string | number | boolean | null>;

export interface ProviderCategoryOption {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  display_order?: number;
}

export interface BookingData {
  // Venue
  venueType: VenueType;
  selectedLocation: LocationOption | null;
  atHomeAddress: AtHomeAddress;

  // Category (for service grouping)
  selectedCategory: ProviderCategoryOption | null;

  // Services: either package (with multiple offerings) or single service/variant
  selectedPackage: PackageOption | null;
  selectedServices: BookingServiceEntry[]; // flattened for hold/API
  selectedAddonIds: string[];
  addonsSubtotal: number;

  // Staff
  selectedStaff: StaffOption | null; // null = "No Preference" (anyone)

  // Schedule
  selectedDate: Date | null;
  selectedSlot: { start: string; end: string; staff_id?: string } | null;

  // Resources (when services require rooms/equipment)
  selectedResourceIds: string[];

  // Client (intake)
  client: ClientIntake;

  // Provider forms and platform booking custom fields (from intake step)
  provider_form_responses?: ProviderFormResponses;
  custom_field_values?: CustomFieldValues;

  // Policy acceptance (review step)
  policyAccepted?: boolean;

  // Group booking (when provider has online_group_booking_enabled)
  isGroupBooking?: boolean;
  groupParticipants?: GroupParticipant[];

  // Computed
  currency: string;
  servicesSubtotal: number;
  totalDurationMinutes: number;
}

export const STEP_ORDER: BookingStep[] = [
  "venue",
  "category",
  "services",
  "addons",
  "group",
  "staff",
  "schedule",
  "resources",
  "intake",
  "review",
];

export function getStepIndex(step: BookingStep): number {
  const i = STEP_ORDER.indexOf(step);
  return i === -1 ? 0 : i;
}

export function getStepLabel(step: BookingStep): string {
  const labels: Record<BookingStep, string> = {
    venue: "Where",
    category: "Category",
    services: "What",
    addons: "Extras",
    group: "Group",
    staff: "Who",
  schedule: "When",
  resources: "Resources",
  intake: "Details",
  review: "Review",
};
  return labels[step];
}
