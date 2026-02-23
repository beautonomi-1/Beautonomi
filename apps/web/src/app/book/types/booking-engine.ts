/**
 * Types for the provider online booking engine (multi-step, high-conversion flow).
 * Single bookingData state drives the entire flow.
 */

export type BookingStep =
  | "venue"
  | "services"
  | "addons"
  | "staff"
  | "schedule"
  | "intake"
  | "review";

export type VenueType = "at_salon" | "at_home";

export interface LocationOption {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  country: string;
  is_primary?: boolean;
}

export interface AtHomeAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
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

export interface BookingData {
  // Venue
  venueType: VenueType;
  selectedLocation: LocationOption | null;
  atHomeAddress: AtHomeAddress;

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

  // Client (intake)
  client: ClientIntake;

  // Computed
  currency: string;
  servicesSubtotal: number;
  totalDurationMinutes: number;
}

export const STEP_ORDER: BookingStep[] = [
  "venue",
  "services",
  "addons",
  "staff",
  "schedule",
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
    services: "What",
    addons: "Extras",
    staff: "Who",
    schedule: "When",
    intake: "Details",
    review: "Review",
  };
  return labels[step];
}
