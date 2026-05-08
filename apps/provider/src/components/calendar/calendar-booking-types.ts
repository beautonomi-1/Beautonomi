/**
 * Shared booking shapes for the provider calendar UI (tab grid + booking cards).
 * Keep aligned with `apps/provider/app/(app)/(tabs)/calendar.tsx` API expectations.
 */

export interface BookingService {
  name: string;
  offering_name?: string;
  offering_id?: string | null;
  scheduled_start_at?: string | null;
  duration_minutes: number;
  price?: number | null;
  staff_name: string | null;
  staff_id: string | null;
  guest_name?: string | null;
}

export interface BookingProduct {
  id: string;
  quantity: number;
  total_price: number;
  products?: { name: string } | null;
}

export interface Booking {
  id: string;
  booking_number: string;
  status: string;
  db_status?: string;
  scheduled_at: string;
  subtotal?: number;
  tax_amount?: number;
  total_amount: number;
  total_paid?: number;
  total_refunded?: number;
  payment_status?: string | null;
  currency: string;
  location_type: string;
  created_at?: string;
  notes?: string;
  services: BookingService[];
  booking_products?: BookingProduct[] | null;
  customers: { full_name: string; phone: string } | null;
  locations: { id: string; name: string } | null;
  /** Salon branch; null/missing for at-home rows from some API shapes. */
  location_id?: string | null;
  /** At-home address hint when `location_type` is ambiguous. */
  address?: { line1?: string | null } | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  group_booking_ref?: string | null;
  package_id?: string | null;
  service_packages?: { id: string; name: string } | null;
  recurring_series_id?: string | null;
  recurring_appointments?: { recurrence_rule?: string } | null;
  booking_source?: string;
  /** At-home lifecycle / verification (when returned by provider booking APIs). */
  current_stage?: string | null;
  arrival_otp_verified?: boolean;
  qr_code_verified?: boolean;
  arrival_otp_pending?: boolean;
  qr_arrival_pending?: boolean;
}

export type CalendarBooking = Booking & {
  calendar_item_id: string;
  calendar_parent_booking_id: string;
  calendar_service_index: number;
  calendar_service_name: string;
  calendar_staff_id: string | null;
  calendar_staff_name: string | null;
  calendar_price: number;
};

export interface CalendarBookingDropContext {
  staffColumns: { staffId: string; staffName: string; bookings: CalendarBooking[] }[];
  dayColumnWidth: number;
  day: Date;
}
