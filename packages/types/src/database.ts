/**
 * Supabase Database Types
 *
 * Manually maintained type definitions based on actual schema usage across the codebase.
 * To regenerate from a live schema:
 *   npx supabase gen types typescript --project-id <id> > src/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamp = string;
type UUID = string;

interface TableDefinition<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface BookingsRow {
  id: UUID;
  booking_number: string | null;
  tenant_id: UUID | null;
  customer_id: UUID | null;
  provider_id: UUID;
  status: string;
  location_type: string | null;
  location_id: UUID | null;
  booking_source: string | null;
  scheduled_at: Timestamp;
  package_id: UUID | null;
  subtotal: number | null;
  travel_fee: number | null;
  platform_fee_config_id: UUID | null;
  platform_fee_percentage: number | null;
  platform_fee_amount: number | null;
  platform_fee_paid_by: string | null;
  service_fee_config_id: UUID | null;
  service_fee_percentage: number | null;
  service_fee_amount: number | null;
  service_fee_paid_by: string | null;
  tip_amount: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  discount_amount: number | null;
  discount_code: string | null;
  discount_reason: string | null;
  promotion_discount_amount: number | null;
  membership_discount_amount: number | null;
  total_amount: number;
  currency: string;
  payment_status: string | null;
  payment_method: string | null;
  payment_option: string | null;
  special_requests: string | null;
  loyalty_points_earned: number | null;
  loyalty_points_used: number | null;
  loyalty_discount_amount: number | null;
  promotion_id: UUID | null;
  membership_plan_id: UUID | null;
  is_group_booking: boolean | null;
  guest_name: string | null;
  group_booking_id: UUID | null;
  /** Public checkout hold (`booking_holds.id`) — persisted for payment-time overlap exclusion. */
  hold_id: UUID | null;
  /** When set, booking originated from a paid custom offer (webhook). */
  custom_offer_id: UUID | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  apartment_unit: string | null;
  building_name: string | null;
  floor_number: string | null;
  parking_instructions: string | null;
  location_landmarks: string | null;
  access_codes: Json | null;
  house_call_instructions: string | null;
  deposit_required: boolean | null;
  deposit_percentage: number | null;
  deposit_amount: number | null;
  gift_card_id: UUID | null;
  gift_card_amount: number | null;
  wallet_amount: number | null;
  payment_reference: string | null;
  payment_provider: string | null;
  payment_date: Timestamp | null;
  payment_method_id: string | null;
  cancelled_at: Timestamp | null;
  cancelled_by: UUID | null;
  cancellation_reason: string | null;
  completed_at: Timestamp | null;
  current_stage: string | null;
  arrival_otp: string | null;
  arrival_otp_verified: boolean | null;
  qr_code_data: Json | null;
  qr_code_verified: boolean | null;
  provider_form_responses: Json | null;
  custom_field_values: Json | null;
  version: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface BookingServicesRow {
  id: UUID;
  booking_id: UUID;
  offering_id: UUID;
  staff_id: UUID | null;
  duration_minutes: number;
  price: number;
  currency: string | null;
  customization: string | null;
  scheduled_start_at: Timestamp | null;
  scheduled_end_at: Timestamp | null;
  created_at: Timestamp;
}

interface BookingPaymentsRow {
  id: UUID;
  booking_id: UUID;
  tenant_id: UUID | null;
  amount: number;
  payment_method: string;
  payment_provider: string | null;
  payment_provider_id: string | null;
  status: string;
  notes: string | null;
  payment_provider_data: Json | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

interface BookingEventsRow {
  id: UUID;
  booking_id: UUID;
  event_type: string;
  event_data: Json | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

interface ProvidersRow {
  id: UUID;
  tenant_id: UUID | null;
  user_id: UUID;
  business_name: string | null;
  slug: string | null;
  currency: string | null;
  status: string;
  requires_deposit: boolean | null;
  deposit_percentage: number | null;
  tax_rate_percent: number | null;
  tips_enabled: boolean | null;
  customer_fee_config_id: UUID | null;
  minimum_mobile_booking_amount: number | null;
  gift_cards_enabled: boolean | null;
  /** When set, platform booking commission uses this % instead of tenant default (0–100). */
  commission_override: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ProviderSettingsRow {
  id: UUID;
  provider_id: UUID;
  calendar_preferences: Json | null;
  notification_preferences: Json | null;
  updated_at: Timestamp;
}

interface ProviderStaffRow {
  id: UUID;
  provider_id: UUID;
  user_id: UUID | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  commission_percentage: number | null;
  /** 866: per-staff commission config (rate %, enabled flags). */
  commission_rate: number | null;
  service_commission_rate: number | null;
  commission_enabled: boolean | null;
  tips_enabled: boolean | null;
  /** JSON permission pack; includes `calendar_scope: "own" | "all"` (866). */
  permissions: Json | null;
  /** 497: soft delete — rows are never hard-deleted (FKs are RESTRICT since 872). */
  deleted_at: Timestamp | null;
  /** 872: set when auto-deactivated by a plan downgrade over the staff cap. */
  over_cap_grace_until: Timestamp | null;
  /** 810: legacy invite columns kept for shipped mobile builds; staff_invitations is canonical. */
  invite_token: UUID | null;
  invite_token_expires_at: Timestamp | null;
  invite_sent_at: Timestamp | null;
  invite_accepted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** 872: first-class staff invite lifecycle. */
export type StaffInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface StaffInvitationsRow {
  id: UUID;
  provider_id: UUID;
  staff_id: UUID | null;
  email: string;
  phone: string | null;
  /** sha256 hex of the raw invite token (raw token only lives in the join link). */
  token_hash: string;
  status: StaffInvitationStatus;
  channels: string[];
  invited_by: UUID | null;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  revoked_at: Timestamp | null;
  revoked_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** 866/872: per-line staff earnings derived from finance_transactions. */
export type StaffEarningsLineKind = "commission" | "tip" | "cancellation_fee_share" | "reversal" | "adjustment";
export type StaffEarningsRateSource = "staff" | "offering_override" | "tier" | "backfill" | "reassign" | "manual";

interface StaffEarningsLinesRow {
  id: UUID;
  booking_id: UUID | null;
  booking_service_id: UUID | null;
  staff_id: UUID;
  provider_id: UUID;
  tenant_id: UUID | null;
  source_finance_transaction_id: UUID;
  kind: StaffEarningsLineKind;
  base_amount: number;
  rate: number;
  amount: number;
  rate_source: StaffEarningsRateSource;
  backfilled: boolean;
  /** 872: shown in My earnings for reversal/adjustment lines. */
  reason: string | null;
  metadata: Json;
  created_by: UUID | null;
  created_at: Timestamp;
}

interface ProviderRolesRow {
  id: UUID;
  provider_id: UUID;
  name: string;
  description: string | null;
  permissions: Json;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface UsersRow {
  id: UUID;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  is_active: boolean | null;
  tenant_id: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface UserProfilesRow {
  user_id: UUID;
  beauty_preferences: Json | null;
  privacy_settings: Json | null;
  business_preferences: Json | null;
  about: string | null;
  interests: Json | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface OfferingsRow {
  id: UUID;
  provider_id: UUID;
  title: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number | null;
  price: number;
  currency: string | null;
  service_type: string | null;
  supports_at_home: boolean | null;
  at_home_price_adjustment: number | null;
  is_active: boolean;
  is_bookable: boolean | null;
  category_id: UUID | null;
  variant_name: string | null;
  parent_service_id: UUID | null;
  display_order: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ProductsRow {
  id: UUID;
  provider_id: UUID;
  name: string;
  description: string | null;
  retail_price: number | null;
  quantity: number | null;
  currency: string | null;
  is_active: boolean;
  retail_sales_enabled: boolean | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ProductOrdersRow {
  id: UUID;
  order_number: string | null;
  customer_id: UUID | null;
  provider_id: UUID;
  tenant_id: UUID | null;
  status: string;
  payment_status: string | null;
  fulfillment_type: string | null;
  total_amount: number;
  currency: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ReviewsRow {
  id: UUID;
  booking_id: UUID | null;
  customer_id: UUID | null;
  provider_id: UUID;
  rating: number;
  customer_rating: number | null;
  comment: string | null;
  service_ratings: Json | null;
  staff_rating: number | null;
  provider_response: string | null;
  provider_response_at: Timestamp | null;
  is_verified: boolean | null;
  is_flagged: boolean | null;
  flagged_reason: string | null;
  flagged_by: UUID | null;
  is_visible: boolean | null;
  helpful_count: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface SubscriptionPlansRow {
  id: UUID;
  name: string;
  description: string | null;
  is_active: boolean;
  is_popular: boolean | null;
  is_free: boolean | null;
  display_order: number | null;
  features: Json | null;
  limits: Json | null;
  price_monthly: number | null;
  price_yearly: number | null;
  amount: number | null;
  interval: string | null;
  currency: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface ProviderSubscriptionsRow {
  id: UUID;
  provider_id: UUID;
  tenant_id: UUID | null;
  plan_id: UUID;
  status: string;
  started_at: Timestamp | null;
  expires_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  billing_period: string | null;
  auto_renew: boolean | null;
  paystack_authorization_code: string | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  next_payment_date: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface FinanceTransactionsRow {
  id: UUID;
  booking_id: UUID | null;
  provider_id: UUID;
  tenant_id: UUID | null;
  transaction_type: string;
  amount: number;
  fees: number | null;
  commission: number | null;
  net: number | null;
  description: string | null;
  created_at: Timestamp;
}

interface TenantsRow {
  id: UUID;
  slug: string;
  name: string;
  region_code: string | null;
  lifecycle: string;
  default_currency: string | null;
  default_language: string | null;
  default_timezone: string | null;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface PlatformZonesRow {
  id: UUID;
  name: string;
  zone_type: string | null;
  postal_codes: Json | null;
  cities: Json | null;
  polygon_coordinates: Json | null;
  center_latitude: number | null;
  center_longitude: number | null;
  radius_km: number | null;
  description: string | null;
  is_active: boolean;
  created_by: UUID | null;
  created_at: Timestamp;
}

interface CustomFieldsRow {
  id: UUID;
  name: string;
  label: string;
  field_type: string;
  entity_type: string;
  is_required: boolean | null;
  is_active: boolean;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  display_order: number | null;
  validation_rules: Json | null;
  created_at: Timestamp;
}

interface NotificationTemplatesRow {
  id: UUID;
  tenant_id: UUID | null;
  key: string;
  title: string;
  body: string;
  channels: string[] | null;
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  variables: Json | null;
  url: string | null;
  enabled: boolean;
  description: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface GiftCardsRow {
  id: UUID;
  tenant_id: UUID | null;
  code: string;
  balance: number;
  original_amount: number;
  currency: string | null;
  expires_at: Timestamp | null;
  is_active: boolean;
  metadata: Json | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

interface StaffServicesRow {
  staff_id: UUID;
  offering_id: UUID;
  provider_id: UUID;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Database definition
// ---------------------------------------------------------------------------

type InsertOf<T> = Partial<T> & { [K in keyof T]?: T[K] };
type UpdateOf<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      bookings: TableDefinition<BookingsRow, InsertOf<BookingsRow>, UpdateOf<BookingsRow>>;
      booking_services: TableDefinition<BookingServicesRow, InsertOf<BookingServicesRow>, UpdateOf<BookingServicesRow>>;
      booking_payments: TableDefinition<BookingPaymentsRow, InsertOf<BookingPaymentsRow>, UpdateOf<BookingPaymentsRow>>;
      booking_events: TableDefinition<BookingEventsRow, InsertOf<BookingEventsRow>, UpdateOf<BookingEventsRow>>;
      providers: TableDefinition<ProvidersRow, InsertOf<ProvidersRow>, UpdateOf<ProvidersRow>>;
      provider_settings: TableDefinition<ProviderSettingsRow, InsertOf<ProviderSettingsRow>, UpdateOf<ProviderSettingsRow>>;
      provider_staff: TableDefinition<ProviderStaffRow, InsertOf<ProviderStaffRow>, UpdateOf<ProviderStaffRow>>;
      provider_roles: TableDefinition<ProviderRolesRow, InsertOf<ProviderRolesRow>, UpdateOf<ProviderRolesRow>>;
      users: TableDefinition<UsersRow, InsertOf<UsersRow>, UpdateOf<UsersRow>>;
      user_profiles: TableDefinition<UserProfilesRow, InsertOf<UserProfilesRow>, UpdateOf<UserProfilesRow>>;
      offerings: TableDefinition<OfferingsRow, InsertOf<OfferingsRow>, UpdateOf<OfferingsRow>>;
      products: TableDefinition<ProductsRow, InsertOf<ProductsRow>, UpdateOf<ProductsRow>>;
      product_orders: TableDefinition<ProductOrdersRow, InsertOf<ProductOrdersRow>, UpdateOf<ProductOrdersRow>>;
      reviews: TableDefinition<ReviewsRow, InsertOf<ReviewsRow>, UpdateOf<ReviewsRow>>;
      subscription_plans: TableDefinition<SubscriptionPlansRow, InsertOf<SubscriptionPlansRow>, UpdateOf<SubscriptionPlansRow>>;
      provider_subscriptions: TableDefinition<ProviderSubscriptionsRow, InsertOf<ProviderSubscriptionsRow>, UpdateOf<ProviderSubscriptionsRow>>;
      finance_transactions: TableDefinition<FinanceTransactionsRow, InsertOf<FinanceTransactionsRow>, UpdateOf<FinanceTransactionsRow>>;
      tenants: TableDefinition<TenantsRow, InsertOf<TenantsRow>, UpdateOf<TenantsRow>>;
      platform_zones: TableDefinition<PlatformZonesRow, InsertOf<PlatformZonesRow>, UpdateOf<PlatformZonesRow>>;
      custom_fields: TableDefinition<CustomFieldsRow, InsertOf<CustomFieldsRow>, UpdateOf<CustomFieldsRow>>;
      notification_templates: TableDefinition<NotificationTemplatesRow, InsertOf<NotificationTemplatesRow>, UpdateOf<NotificationTemplatesRow>>;
      gift_cards: TableDefinition<GiftCardsRow, InsertOf<GiftCardsRow>, UpdateOf<GiftCardsRow>>;
      staff_services: TableDefinition<StaffServicesRow, InsertOf<StaffServicesRow>, UpdateOf<StaffServicesRow>>;
      staff_invitations: TableDefinition<StaffInvitationsRow, InsertOf<StaffInvitationsRow>, UpdateOf<StaffInvitationsRow>>;
      staff_earnings_lines: TableDefinition<StaffEarningsLinesRow, InsertOf<StaffEarningsLinesRow>, UpdateOf<StaffEarningsLinesRow>>;
      [key: string]: TableDefinition<any, any, any>;
    };
    Views: {
      offering_staff: { Row: StaffServicesRow };
      [key: string]: { Row: any };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [key: string]: string;
    };
  };
}
