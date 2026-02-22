/**
 * Provider Portal Type Definitions
 * All types for the service provider portal
 */

export interface Provider {
  id: string;
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  setup_completion: number; // 0-100
  selected_location_id?: string;
  business_type?: "freelancer" | "salon";
}

export interface Salon {
  id: string;
  name: string;
  address: string;
  city: string;
  is_primary: boolean;
}

/** Day key in working_hours: monday, tuesday, ... */
export type WorkingHoursDay = {
  open: string;
  close: string;
  closed?: boolean;
};

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  mobile: string;
  avatar_url?: string;
  role: "owner" | "manager" | "employee";
  rating?: number;
  is_active: boolean;
  time_clock_enabled?: boolean;
  time_clock_pin?: string;
  /** Staff-specific working hours (day key -> { open, close, closed }). From provider_staff.working_hours. */
  working_hours?: Record<string, WorkingHoursDay> | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
  order: number;
  services: ServiceItem[];
  color?: string; // Appointment color for visual identification
  description?: string; // Category description for clients
  slug?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category_id: string;
  provider_category_id?: string; // Provider-specific category
  duration_minutes: number;
  price: number;
  description?: string;
  is_active: boolean;
  order: number;
  // Service type and classification
  service_type?: "basic" | "package" | "addon" | "variant";
  // Location support (at salon vs at home)
  supports_at_home?: boolean;
  supports_at_salon?: boolean;
  at_home_radius_km?: number; // Maximum radius for at-home services
  at_home_price_adjustment?: number; // Price adjustment for at-home services
  // New fields
  aftercare_description?: string;
  online_booking_enabled?: boolean;
  team_member_commission_enabled?: boolean;
  team_member_ids?: string[]; // IDs of team members assigned to this service
  extra_time_enabled?: boolean;
  extra_time_duration?: number;
  reminder_to_rebook_enabled?: boolean;
  reminder_to_rebook_weeks?: number;
  tax_rate?: number;
  pricing_name?: string;
  price_type?: "fixed" | "from" | "varies" | "free";
  pricing_options?: any[]; // Multiple pricing options
  included_services?: string[];
  service_available_for?: "everyone" | "women" | "men";
  service_cost_percentage?: number; // Cost as % of sale price
  // Variant specific
  variant_name?: string | null;
  parent_service_id?: string | null;
}

export interface ProductItem {
  id: string;
  name: string;
  barcode?: string;
  sku?: string;
  category: string;
  supplier?: string;
  quantity: number;
  retail_price: number;
  image_url?: string;
  // New fields
  brand?: string;
  measure?: string;
  amount?: number;
  short_description?: string;
  description?: string;
  supply_price?: number;
  retail_sales_enabled?: boolean;
  markup?: number;
  tax_rate?: number;
  team_member_commission_enabled?: boolean;
  track_stock_quantity?: boolean;
  low_stock_level?: number;
  reorder_quantity?: number;
  receive_low_stock_notifications?: boolean;
  image_urls?: string[];
  is_active?: boolean;
}

export interface Appointment {
  id: string;
  /** Root booking id when this is an expanded calendar block (id may be composite) */
  booking_id?: string;
  ref_number: string;
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_since?: string; // Date when client first joined (for "Client since" display)
  // Payment info
  payment_status?: string;
  tip_amount?: number;
  // Pricing breakdown (Mangomint-style)
  original_price?: number; // Original price before discounts
  discount_amount?: number; // Discount applied
  discount_code?: string; // Discount code used
  discount_reason?: string; // Reason for discount
  subtotal?: number; // Price after discount, before tax/fees
  tax_amount?: number; // Tax amount
  tax_rate?: number;
  total_amount?: number; // Final total including all fees
  total_paid?: number;
  total_refunded?: number;
  service_id: string;
  services?: any[];
  products?: any[];
  cart_items?: Array<{
    id: string;
    type: string;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    service_id?: string;
    product_id?: string;
    duration_minutes?: number;
  }>;
  service_name: string;
  service_customization?: string; // Service customization/request notes
  team_member_id: string;
  team_member_name: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  price: number;
  status: "booked" | "pending" | "started" | "completed" | "cancelled" | "no_show" | "confirmed" | "in_progress";
  // Updated tracking (for booking details timeline)
  updated_date?: string;
  // Group booking fields
  is_group_booking?: boolean;
  group_booking_id?: string | null;
  group_booking_ref?: string | null;
  participants?: Array<{
    id: string;
    participant_name: string;
    participant_email?: string | null;
    participant_phone?: string | null;
    service_name?: string;
    price?: number;
    is_primary_contact?: boolean;
    checked_in?: boolean;
    checked_out?: boolean;
  }>;
  updated_by?: string;
  updated_by_name?: string;
  created_by: string;
  created_date: string;
  notes?: string;
  notes_history?: AppointmentNote[];
  internal_notes?: string;
  // Location (at salon vs at home)
  location_type?: "at_salon" | "at_home";
  location_id?: string; // For at_salon - references provider_locations
  location_name?: string; // Salon name for at_salon
  address_line1?: string; // For at_home
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  address_postal_code?: string;
  address_latitude?: number;
  address_longitude?: number;
  travel_fee?: number; // Travel fee for at_home services
  // At-home tracking
  current_stage?: "confirmed" | "client_arrived" | "provider_on_way" | "provider_arrived" | "service_started" | "service_completed";
  arrival_otp?: string | null;
  arrival_otp_expires_at?: string | null;
  arrival_otp_verified?: boolean;
  // QR code support (fallback when OTP is disabled)
  qr_code_data?: any; // QRCodeData JSON
  qr_code_verification_code?: string | null;
  qr_code_expires_at?: string | null;
  qr_code_verified?: boolean;
  otp_enabled?: boolean; // Whether OTP is enabled for this appointment
  // Calendar customization
  color?: string;
  icon?: string;
  // Cancellation
  cancellation_reason?: string;
  cancellation_fee?: number;
  cancellation_policy_id?: string;
  service_fee_percentage?: number;
  service_fee_amount?: number;
}

/**
 * Enhanced Appointment Notes Types
 */
export type NoteType = "internal" | "client_visible" | "system";

export interface AppointmentNote {
  id: string;
  appointment_id: string;
  type: NoteType;
  content: string;
  created_by: string;
  created_by_name: string;
  created_date: string;
  is_edited: boolean;
  edited_date?: string;
}

export interface NoteTemplate {
  id: string;
  name: string;
  content: string;
  type: NoteType;
  category?: string;
  is_active: boolean;
  created_date: string;
}

/**
 * Appointment History Types
 */
export interface AppointmentHistoryEntry {
  id: string;
  appointment_id: string;
  action: "created" | "updated" | "status_changed" | "rescheduled" | "cancelled" | "note_added" | "payment_added";
  description: string;
  performed_by: string;
  performed_by_name: string;
  performed_date: string;
  changes?: Record<string, { from: any; to: any }>;
  metadata?: Record<string, any>;
}

export interface Sale {
  id: string;
  ref_number: string;
  client_name?: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  payment_status?: string;
  team_member_id?: string;
  team_member_name?: string;
  location_id?: string;
  service_location_type?: string;
  house_call_address?: Record<string, unknown>;
  coupon_code?: string;
  gift_card_code?: string;
  gift_card_amount?: number;
}

export interface SaleItem {
  id: string;
  type: "service" | "product";
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface PaymentTransaction {
  id: string;
  ref_number: string;
  payment_date: string;
  appointment_id?: string;
  appointment_duration?: number;
  team_member_id?: string;
  team_member_name?: string;
  method: "cash" | "card" | "mobile" | "gift_card" | "deposit" | "yoco";
  amount: number;
  status: "completed" | "pending" | "failed";
  yoco_payment_id?: string;
  yoco_device_id?: string;
}

/**
 * Yoco Web POS Integration Types
 * Based on Yoco API: https://developer.yoco.com/api-reference
 */
export interface YocoDevice {
  id: string;
  name: string;
  device_id: string; // Yoco Web POS device ID
  location_id?: string;
  location_name?: string;
  is_active: boolean;
  created_date: string;
  last_used?: string;
  total_transactions?: number;
  total_amount?: number;
}

export interface YocoPayment {
  id: string;
  yoco_payment_id: string; // Yoco API payment ID
  device_id: string;
  device_name?: string;
  amount: number; // Amount in cents (ZAR)
  currency: string; // Default: "ZAR"
  status: "pending" | "successful" | "failed" | "cancelled";
  payment_date: string;
  appointment_id?: string;
  sale_id?: string;
  metadata?: Record<string, any>;
  error_message?: string;
}

export interface YocoIntegration {
  is_enabled: boolean;
  secret_key?: string; // Encrypted in production
  public_key?: string;
  webhook_secret?: string;
  connected_date?: string;
  last_sync?: string;
}

export interface Shift {
  id: string;
  team_member_id: string;
  team_member_name: string;
  date: string;
  start_time: string;
  end_time: string;
  location_id?: string;
  notes?: string;
  is_recurring?: boolean;
  recurring_pattern?: { type?: "alternating" | "weekly" | string; [key: string]: unknown };
}

export interface Campaign {
  id: string;
  name: string;
  type: "blast" | "automation";
  status: "active" | "paused" | "completed";
  created_date: string;
  sent_count?: number;
  open_count?: number;
}

export interface Automation {
  id: string;
  name: string;
  type: "reminder" | "update" | "booking" | "milestone";
  trigger: string; // e.g., "24h before", "1h before"
  is_active: boolean;
  description?: string;
  is_template?: boolean; // Whether this is a template
  _raw?: any; // Store raw database data for template activation
}

export interface DashboardMetrics {
  earnings: number;
  earnings_this_month: number;
  sales: number;
  sales_delta: number;
  today_appointments: number;
  weekly_appointments: number;
  monthly_earnings_data: { date: string; amount: number }[];
  upcoming_appointments_data: { date: string; count: number }[];
  top_services: { service_name: string; count: number; revenue: number }[];
  top_team_members: { name: string; appointments: number; revenue: number }[];
  recent_activity: Appointment[];
}

export interface FilterParams {
  search?: string;
  date_from?: string;
  date_to?: string;
  /** When true, expand multi-service bookings to one appointment per service (for calendar display) */
  expand_for_calendar?: boolean;
  status?: string;
  team_member_id?: string;
  service_id?: string;
  category_id?: string;
  location_id?: string;
  payment_method?: string;
  amount_min?: number;
  amount_max?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Waitlist Management Types
 */
export interface WaitlistEntry {
  id: string;
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_id: string;
  service_name: string;
  team_member_id?: string;
  staff_id?: string;
  team_member_name?: string;
  preferred_date?: string;
  preferred_time?: string;
  preferred_time_start?: string;
  preferred_time_end?: string;
  priority: "high" | "normal" | "low";
  status: "active" | "notified" | "booked" | "cancelled";
  created_date: string;
  notified_date?: string;
  notes?: string;
}

/**
 * Recurring Appointment Types
 */
export type RecurrencePattern = 
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "custom";

export interface RecurrenceRule {
  pattern: RecurrencePattern;
  interval: number; // For custom patterns
  days_of_week?: number[]; // 0-6, Sunday-Saturday
  day_of_month?: number; // For monthly
  end_date?: string; // Optional end date
  occurrences?: number; // Optional number of occurrences
}

export interface RecurringAppointment {
  id: string;
  series_id: string; // Groups related appointments
  client_id?: string;
  client_name: string;
  service_id: string;
  service_name: string;
  team_member_id: string;
  team_member_name: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  price: number;
  recurrence_rule: RecurrenceRule;
  status: "booked" | "started" | "completed" | "cancelled";
  is_exception: boolean; // True if this instance was modified
  created_date: string;
  notes?: string;
}

/**
 * Resource Management Types
 */
export interface Resource {
  id: string;
  name: string;
  type: "room" | "chair" | "equipment" | "other";
  description?: string;
  capacity?: number; // For rooms/chairs
  location_id?: string;
  group_id?: string;
  is_active: boolean;
  color?: string; // For calendar display
}

export interface ResourceGroup {
  id: string;
  name: string;
  description?: string;
  resource_ids: string[];
  is_active: boolean;
  color?: string;
}

export interface ResourceAssignment {
  id: string;
  appointment_id: string;
  resource_id: string;
  resource_name: string;
  start_time: string;
  end_time: string;
}

/**
 * Express Booking Link Types
 */
export interface ExpressBookingLink {
  id: string;
  name: string;
  short_code: string;
  full_url: string;
  service_id?: string; // Pre-selected service
  team_member_id?: string; // Pre-selected team member
  location_id?: string;
  expires_at?: string;
  is_active: boolean;
  usage_count: number;
  created_date: string;
  metadata?: Record<string, any>;
}

/**
 * Cancellation Policy Types
 */
export interface CancellationPolicy {
  id: string;
  name: string;
  description?: string;
  cancellation_window_hours: number; // Hours before appointment
  refund_percentage: number; // 0-100
  allow_reschedule: boolean;
  reschedule_window_hours?: number;
  is_default: boolean;
  applies_to_services?: string[]; // Service IDs
  applies_to_categories?: string[]; // Category IDs
}

/**
 * Membership Types
 */
export interface Membership {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_days: number;
  benefits: MembershipBenefit[];
  is_active: boolean;
}

export interface MembershipBenefit {
  type: "discount" | "free_service" | "priority_booking" | "other";
  value: number; // Percentage or fixed amount
  description: string;
  service_ids?: string[];
}

export interface ClientMembership {
  id: string;
  client_id: string;
  membership_id: string;
  membership_name: string;
  start_date: string;
  end_date: string;
  status: "active" | "expired" | "cancelled";
  remaining_benefits?: Record<string, number>;
}

/**
 * Calendar Integration Types
 */
export type CalendarProvider = "google" | "apple" | "outlook";

export interface CalendarSync {
  id: string;
  provider: CalendarProvider;
  calendar_id?: string; // Google Calendar ID or iCal URL
  access_token?: string; // Encrypted
  refresh_token?: string; // Encrypted
  expires_at?: string;
  is_active: boolean;
  sync_direction: "one_way" | "two_way";
  last_sync_date?: string;
  sync_errors?: string[];
  created_date: string;
}

export interface CalendarEvent {
  id: string;
  appointment_id: string;
  calendar_provider: CalendarProvider;
  calendar_event_id: string; // External calendar event ID
  sync_status: "synced" | "pending" | "failed";
  last_sync_date: string;
  error_message?: string;
}

/**
 * Group Booking Types
 */
export interface GroupBooking {
  id: string;
  ref_number: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  team_member_id: string;
  team_member_name: string;
  service_id: string;
  service_name: string;
  total_price: number;
  status: "booked" | "started" | "completed" | "cancelled";
  created_date: string;
  participants: GroupBookingParticipant[];
  notes?: string;
  // Location support
  location_type?: "at_salon" | "at_home";
  location_id?: string;
  location_name?: string;
  address_line1?: string;
  address_city?: string;
  address_postal_code?: string;
  travel_fee?: number;
}

export interface GroupBookingParticipant {
  id: string;
  group_booking_id: string;
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_id: string;
  service_name: string;
  price: number;
  checked_in: boolean;
  checked_in_time?: string;
  checked_out: boolean;
  checked_out_time?: string;
}

/**
 * Time Block Types
 */
export interface TimeBlock {
  id: string;
  name: string;
  description?: string;
  team_member_id?: string; // If null, applies to all team members
  team_member_name?: string;
  date: string; // For single time blocks
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  recurrence_rule?: RecurrenceRule;
  blocked_time_type_id?: string;
  blocked_time_type_name?: string;
  is_active: boolean;
  created_date: string;
}

/** Raw availability block from API (date-specific closed/break/maintenance). */
export interface AvailabilityBlockRaw {
  id: string;
  provider_id: string;
  staff_id: string | null;
  location_id?: string | null;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string; // ISO
  end_at: string; // ISO
  reason?: string | null;
}

/** Normalized for calendar: one entry per day (split if block spans days). */
export interface AvailabilityBlockDisplay {
  id: string;
  date: string; // yyyy-MM-dd
  start_time: string;
  end_time: string;
  team_member_id: string | null; // null = applies to all staff
  location_id: string | null; // null = all locations
  block_type: "unavailable" | "break" | "maintenance";
  reason?: string | null;
  _source: "availability_block";
}

export interface BlockedTimeType {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  is_active: boolean;
  created_date: string;
}

/**
 * Virtual Waiting Room Types
 */
export interface WaitingRoomEntry {
  id: string;
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  appointment_id?: string;
  service_id?: string;
  service_name?: string;
  team_member_id?: string;
  team_member_name?: string;
  checked_in_time: string;
  checked_in_method: "self" | "staff" | "online";
  estimated_wait_time?: number; // minutes
  status: "waiting" | "in_service" | "completed" | "left";
  notes?: string;
  position?: number; // Queue position
}

/**
 * Calendar Colors & Icons Types
 */
export interface CalendarColorScheme {
  id: string;
  name: string;
  description?: string;
  color: string; // Hex color
  icon?: string; // Icon name or URL
  applies_to: "service" | "status" | "team_member" | "custom";
  service_id?: string;
  status?: Appointment["status"];
  team_member_id?: string;
  is_default: boolean;
  created_date: string;
}

export interface CalendarDisplayPreferences {
  id: string;
  week_starts_on: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, etc.
  start_hour: number; // 0-23
  end_hour: number; // 0-23
  time_slot_interval: number; // minutes (15, 30, 60)
  show_weekends: boolean;
  show_time_labels: boolean;
  show_duration: boolean;
  default_view: "day" | "3-days" | "week" | "month";
  appointment_height: "compact" | "normal" | "expanded";
  color_by: "service" | "status" | "team_member";
  show_resource_assignments: boolean;
  show_waitlist_entries: boolean;
  show_time_blocks: boolean;
}

/**
 * Calendar Link Sharing Types
 */
export interface CalendarLink {
  id: string;
  name: string;
  link_token: string;
  full_url: string;
  calendar_type: "public" | "subscription";
  provider: CalendarProvider;
  is_active: boolean;
  expires_at?: string;
  access_count: number;
  created_date: string;
  settings: {
    show_client_names: boolean;
    show_service_details: boolean;
    show_team_member_names: boolean;
    include_cancelled: boolean;
  };
}

/**
 * Rescheduling Types
 */
export interface RescheduleRequest {
  id: string;
  appointment_id: string;
  original_date: string;
  original_time: string;
  new_date: string;
  new_time: string;
  requested_by: string;
  requested_by_name: string;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_date: string;
  processed_date?: string;
  cancellation_fee?: number;
}
