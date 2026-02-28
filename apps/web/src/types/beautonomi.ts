// Beautonomi Type Definitions
// All data models used across the application

export type UserRole = 'customer' | 'provider_owner' | 'provider_staff' | 'superadmin' | 'support_agent';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  rating_average?: number | null; // Average rating from providers (0-5)
  review_count?: number | null; // Total number of ratings received
  created_at: string;
  updated_at: string;
}

/** Extended profile data from user_profiles (profile questions, etc.) */
export interface UserProfile {
  id?: string;
  user_id: string;
  avatar_url?: string | null;
  about?: string | null;
  school?: string | null;
  work?: string | null;
  location?: string | null;
  languages?: string[] | null;
  interests?: string[] | null;
  decade_born?: string | null;
  favorite_song?: string | null;
  obsessed_with?: string | null;
  fun_fact?: string | null;
  useless_skill?: string | null;
  biography_title?: string | null;
  spend_time?: string | null;
  pets?: string | null;
  travel_destinations?: string[] | null;
  show_travel_history?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

// Gamification Types
export interface ProviderBadge {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  tier: number;
  color: string | null;
  requirements: {
    points?: number;
    min_rating?: number;
    min_reviews?: number;
    min_bookings?: number;
  };
  benefits: {
    free_subscription?: boolean;
    featured?: boolean;
  };
  is_active: boolean;
  display_order: number;
}

export interface ProviderPoints {
  id: string;
  provider_id: string;
  total_points: number;
  current_tier_points: number;
  lifetime_points: number;
  current_badge_id: string | null;
  current_badge?: ProviderBadge | null;
  badge_earned_at: string | null;
  badge_expires_at: string | null;
  last_calculated_at: string;
}

export interface ProviderPointTransaction {
  id: string;
  provider_id: string;
  points: number;
  source: string;
  source_id: string | null;
  description: string | null;
  created_at: string;
}

export interface ProviderMilestone {
  id: string;
  provider_id: string;
  milestone_type: string;
  achieved_at: string;
  metadata: Record<string, any>;
}

// Public Provider Types
export interface PublicProviderCard {
  id: string;
  slug: string;
  business_name: string;
  business_type: 'freelancer' | 'salon';
  rating: number;
  review_count: number;
  thumbnail_url: string | null;
  city: string;
  country: string;
  is_featured: boolean;
  is_verified: boolean;
  starting_price?: number;
  currency: string;
  description?: string | null;
  distance_km?: number | null;
  supports_house_calls?: boolean;
  supports_salon?: boolean;
  current_badge?: ProviderBadge | null;
  total_points?: number;
  /** True when provider appears in search due to sponsored/boosted campaign */
  is_sponsored?: boolean;
  /** Set when is_sponsored; used for click attribution */
  campaign_id?: string | null;
}

export interface PublicProviderDetail extends PublicProviderCard {
  description: string | null;
  gallery: string[];
  categories: string[];
  locations: ProviderLocation[];
  policies: ProviderPolicies;
  staff_count?: number;
  years_in_business?: number;
  website?: string | null;
  social_media_links?: {
    facebook?: string | null;
    instagram?: string | null;
    twitter?: string | null;
    linkedin?: string | null;
  };
  accepts_custom_requests?: boolean;
  response_rate?: number;
  response_time_hours?: number;
  languages_spoken?: string[];
  current_badge?: ProviderBadge | null;
  total_points?: number;
}

// Service/Offering Types
export interface PublicServiceCard {
  id: string;
  title: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  thumbnail_url: string | null;
  provider: {
    id: string;
    business_name: string;
    slug: string;
    rating: number;
  };
}

export interface OfferingCard {
  id: string;
  master_service_id: string;
  master_service_name: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  at_home_radius_km?: number;
  at_home_price_adjustment?: number;
  is_active: boolean;
  provider_id: string;
  created_at: string;
  updated_at: string;
}

// Provider Types
export interface ProviderProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_type: 'freelancer' | 'salon';
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: 'draft' | 'pending_approval' | 'active' | 'suspended';
  is_verified: boolean;
  is_featured: boolean;
  gallery: string[];
  created_at: string;
  updated_at: string;
}

export interface ProviderLocation {
  id: string;
  provider_id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  country: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  is_active: boolean;
  /** 'salon' = physical venue, clients can book in-studio; 'base' = distance/travel reference only (mobile-only) */
  location_type?: "salon" | "base";
  working_hours: WorkingHours;
  created_at: string;
  updated_at: string;
}

export interface WorkingHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  is_open: boolean;
  open_time: string; // HH:mm format
  close_time: string; // HH:mm format
  breaks?: TimeBreak[];
}

export interface TimeBreak {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface ProviderStaff {
  id: string;
  provider_id: string;
  user_id: string | null; // null if not a registered user
  name: string;
  email: string | null;
  phone: string | null;
  role: 'owner' | 'manager' | 'employee';
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  working_hours: WorkingHours;
  service_ids: string[]; // Offering IDs this staff can perform
  created_at: string;
  updated_at: string;
}

export interface ProviderPolicies {
  cancellation_window_hours: number;
  requires_deposit: boolean;
  deposit_percentage?: number;
  no_show_fee_enabled: boolean;
  no_show_fee_amount?: number;
  currency: string;
}

// Booking Types
export interface BookingDraft {
  provider_id: string;
  services: BookingService[];
  location_type: 'at_home' | 'at_salon';
  location_id?: string; // for at_salon
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    country: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    // House call specific optional fields
    apartment_unit?: string | null;
    building_name?: string | null;
    floor_number?: string | null;
    access_codes?: { gate?: string; buzzer?: string; door?: string } | null;
    parking_instructions?: string | null;
    location_landmarks?: string | null;
  }; // for at_home
  selected_datetime: string; // ISO string
  guests: Guest[];
  addons: string[]; // Offering IDs
  products?: Array<{ product_id?: string; productId?: string; quantity: number; totalPrice?: number }>; // Product line items
  package_id?: string;
  tip_amount: number;
  travel_fee?: number; // Travel fee for at-home services only
  special_requests?: string;
  client_info?: ClientInfo;
  payment_method?: 'card' | 'cash' | 'giftcard' | 'paypal';
  payment_option?: 'deposit' | 'full';
  promotion_code?: string;
  gift_card_code?: string;
  use_wallet?: boolean;
  /** Resource IDs to assign (ordered: one per required slot per service). When set, used for validation and assignment. */
  resource_ids?: string[];
}

export interface BookingService {
  offering_id: string;
  staff_id?: string; // null means any available staff
  guest_id?: string; // if multiple guests
}

export interface Guest {
  id: string;
  name: string;
  age?: number;
  email?: string;
  phone?: string;
}

export interface ClientInfo {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth?: string;
}

export interface Booking {
  id: string;
  booking_number: string;
  customer_id: string;
  provider_id: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  location_type: 'at_home' | 'at_salon';
  location_id: string | null;
  address: BookingAddress | null;
  scheduled_at: string; // ISO string
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  services: BookingServiceDetail[];
  addons: BookingAddon[];
  package_id: string | null;
  subtotal: number;
  tip_amount: number;
  total_amount: number;
  currency: string;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  house_call_instructions?: string | null; // Separate from special_requests for house calls
  payment_method: string | null;
  special_requests: string | null;
  loyalty_points_earned: number;
  created_at: string;
  updated_at: string;
  version?: number; // Optional version field for conflict detection (optimistic locking)
  // At-home booking specific fields
  events?: BookingEvent[];
  current_stage?: 'confirmed' | 'provider_on_way' | 'provider_arrived' | 'service_started' | 'service_completed';
  additional_charges?: AdditionalCharge[];
  arrival_otp?: string | null;
  arrival_otp_expires_at?: string | null;
  arrival_otp_verified?: boolean;
  products?: Array<{ id?: string; product_name?: string; quantity: number; total_price: number }>;
  /** Provider form responses (intake/consent/waiver) filled at checkout */
  provider_form_responses?: Record<string, Record<string, unknown>> | null;
  /** Platform booking custom field values (from custom_field_values) */
  custom_field_values?: Record<string, string | number | boolean | null> | null;
  /** Group booking ref (e.g. GB-xxx) when this booking is part of a group */
  is_group_booking?: boolean;
  group_booking_ref?: string | null;
}

export interface BookingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  // House call specific optional fields
  apartment_unit?: string | null;
  building_name?: string | null;
  floor_number?: string | null;
  access_codes?: { gate?: string; buzzer?: string; door?: string } | null;
  parking_instructions?: string | null;
  location_landmarks?: string | null;
}

export interface BookingServiceDetail {
  id: string;
  offering_id: string;
  offering_name: string;
  staff_id: string | null;
  staff_name: string | null;
  duration_minutes: number;
  price: number;
  guest_name?: string;
}

export interface BookingAddon {
  id: string;
  offering_id: string;
  offering_name: string;
  price: number;
}

export interface BookingEvent {
  id: string;
  booking_id: string;
  event_type: 'confirmed' | 'provider_on_way' | 'provider_arrived' | 'service_started' | 'service_completed' | 'otp_sent' | 'otp_verified' | 'additional_payment_requested' | 'additional_payment_approved' | 'additional_payment_initiated' | 'additional_payment_paid' | 'additional_payment_failed';
  event_data?: {
    otp?: string;
    location?: { lat: number; lng: number };
    additional_amount?: number;
    description?: string;
    [key: string]: any;
  };
  created_at: string;
  created_by: string; // User ID who triggered the event
}

export interface AdditionalCharge {
  id: string;
  booking_id: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requested_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  requested_by: string; // Provider user ID
}

// Availability Types
export interface AvailabilitySlot {
  start: string; // ISO string
  end: string; // ISO string
  staff_id?: string;
  location_id?: string;
  is_available: boolean;
}

export interface AvailabilityRequest {
  provider_id: string;
  date: string; // YYYY-MM-DD
  service_id?: string; // Offering ID
  staff_id?: string;
  location_id?: string;
  duration_minutes: number;
}

// Messaging Types
export interface Conversation {
  id: string;
  booking_id: string | null;
  customer_id: string;
  provider_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count_customer: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  avatar?: string | null;
  customer_avatar?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: UserRole;
  content: string;
  is_read: boolean;
  created_at: string;
}

// Review Types
export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number; // 1-5 (customer rating of provider)
  comment: string | null;
  customer_rating?: number | null; // 1-5 (provider rating of customer)
  customer_comment?: string | null; // Provider's comment about customer
  service_ratings?: {
    offering_id: string;
    rating: number;
  }[];
  staff_rating?: {
    staff_id: string;
    rating: number;
  };
  provider_response: string | null;
  provider_response_at: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Search & Filter Types
export interface SearchFilters {
  category?: string;
  subcategory?: string;
  service?: string;
  location?: {
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    radius_km?: number;
  };
  at_home?: boolean;
  date?: string; // YYYY-MM-DD
  time_preference?: 'any' | 'morning' | 'afternoon' | 'evening' | 'custom';
  custom_time_start?: string; // HH:mm
  custom_time_end?: string; // HH:mm
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  availability?: 'now' | 'soon' | 'any';
  sort_by?: 'relevance' | 'price_low' | 'price_high' | 'rating' | 'distance' | 'soonest';
  page?: number;
  limit?: number;
}

export interface SearchResult {
  providers: PublicProviderCard[];
  services: PublicServiceCard[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// Category Types
export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  subcategories: Subcategory[];
  created_at: string;
  updated_at: string;
}

export interface Subcategory {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

// Master Catalog Types (Admin)
export interface MasterService {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  description: string | null;
  default_duration_minutes: number;
  default_buffer_minutes: number;
  allowed_location_types: ('at_home' | 'at_salon')[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Promotion & Loyalty Types
export interface Promotion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'percentage' | 'fixed';
  value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  valid_from: string;
  valid_until: string;
  usage_limit?: number;
  usage_count: number;
  is_active: boolean;
  applicable_categories?: string[];
  applicable_providers?: string[];
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRule {
  id: string;
  points_per_currency_unit: number; // e.g., 1 point per 1 ZAR
  currency: string;
  redemption_rate: number; // e.g., 100 points = 10 ZAR
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// Pagination Types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
