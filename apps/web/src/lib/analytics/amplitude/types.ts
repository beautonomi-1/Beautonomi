/**
 * Amplitude Analytics Types
 */

export interface AmplitudeConfig {
  api_key_public: string | null;
  environment: "production" | "staging" | "development";
  enabled_client_portal: boolean;
  enabled_provider_portal: boolean;
  enabled_admin_portal: boolean;
  guides_enabled: boolean;
  surveys_enabled: boolean;
  sampling_rate: number;
  debug_mode: boolean;
}

export interface AmplitudeEvent {
  event_type: string;
  user_id?: string;
  device_id?: string;
  event_properties?: Record<string, any>;
  user_properties?: Record<string, any>;
  groups?: Record<string, any>;
  app_version?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  device_brand?: string;
  device_model?: string;
  carrier?: string;
  country?: string;
  region?: string;
  city?: string;
  language?: string;
  price?: number;
  quantity?: number;
  revenue?: number;
  productId?: string;
  revenueType?: string;
  location_lat?: number;
  location_lng?: number;
  ip?: string;
  idfa?: string;
  idfv?: string;
  adid?: string;
  event_id?: number;
  session_id?: number;
  insert_id?: string;
  time?: number;
}

// Event name constants
export const EVENT_SESSION_START = "session_start";
export const EVENT_SESSION_END = "session_end";
export const EVENT_SIGNUP_START = "signup_start";
export const EVENT_SIGNUP_COMPLETE = "signup_complete";
export const EVENT_LOGIN_SUCCESS = "login_success";
export const EVENT_LOGOUT = "logout";
export const EVENT_HOME_VIEW = "home_view";
export const EVENT_CATEGORY_VIEW = "category_view";
export const EVENT_SEARCH_VIEW = "search_view";
export const EVENT_SEARCH_FILTERS_APPLIED = "search_filters_applied";
export const EVENT_SEARCH_RESULT_IMPRESSION = "search_result_impression";
export const EVENT_SEARCH_RESULT_CLICK = "search_result_click";
export const EVENT_PROVIDER_PROFILE_VIEW = "provider_profile_view";
export const EVENT_EXPLORE_FEED_VIEW = "explore_feed_view";
export const EVENT_EXPLORE_POST_IMPRESSION = "explore_post_impression";
export const EVENT_EXPLORE_POST_CLICK = "explore_post_click";
export const EVENT_EXPLORE_SAVE = "explore_save";
export const EVENT_EXPLORE_UNSAVE = "explore_unsave";
export const EVENT_BOOKING_START = "booking_start";
export const EVENT_BOOKING_HOLD_CREATED = "booking_hold_created";
export const EVENT_BOOKING_DETAILS_COMPLETED = "booking_details_completed";
export const EVENT_BOOKING_CONFIRMED = "booking_confirmed";
export const EVENT_BOOKING_CANCELLED = "booking_cancelled";
export const EVENT_BOOKING_RESCHEDULED = "booking_rescheduled";
export const EVENT_CHECKOUT_START = "checkout_start";
export const EVENT_PAYMENT_INITIATED = "payment_initiated";
export const EVENT_PAYMENT_SUCCESS = "payment_success";
export const EVENT_PAYMENT_FAILED = "payment_failed";
export const EVENT_REFUND_REQUESTED = "refund_requested";
export const EVENT_MESSAGE_THREAD_OPEN = "message_thread_open";
export const EVENT_MESSAGE_SENT = "message_sent";
export const EVENT_REVIEW_SUBMITTED = "review_submitted";
export const EVENT_PAGE_VIEW = "page_view";

// Provider portal events
export const EVENT_PROVIDER_DASHBOARD_VIEW = "provider_dashboard_view";
export const EVENT_PROVIDER_CALENDAR_VIEW = "provider_calendar_view";
export const EVENT_PROVIDER_CALENDAR_ACTION = "provider_calendar_action";
export const EVENT_FRONT_DESK_VIEW = "front_desk_view";
export const EVENT_FRONT_DESK_STATUS_CHANGE = "front_desk_status_change";
export const EVENT_WALKIN_CREATED = "walkin_created";
export const EVENT_WAITLIST_ADD = "waitlist_add";
export const EVENT_WAITLIST_NOTIFY = "waitlist_notify";
export const EVENT_PAYMENT_LINK_SENT = "payment_link_sent";
export const EVENT_MARK_PAID_CLICKED = "mark_paid_clicked";
export const EVENT_YOCO_TERMINAL_RECORDED = "yoco_terminal_recorded";
export const EVENT_INVOICE_GENERATED = "invoice_generated";
export const EVENT_STAFF_CREATED = "staff_created";
export const EVENT_STAFF_INVITED = "staff_invited";
export const EVENT_STAFF_ROLE_CHANGED = "staff_role_changed";
export const EVENT_PERMISSION_CHANGED = "permission_changed";
export const EVENT_EXPLORE_POST_CREATED = "explore_post_created";
export const EVENT_EXPLORE_POST_PUBLISHED = "explore_post_published";
export const EVENT_EXPLORE_POST_DELETED = "explore_post_deleted";
export const EVENT_MARKETING_AUTOMATION_CREATED = "marketing_automation_created";
export const EVENT_MARKETING_AUTOMATION_EXECUTED = "marketing_automation_executed";
export const EVENT_CAMPAIGN_SENT = "campaign_sent";
export const EVENT_PROVIDER_SETTINGS_UPDATED = "provider_settings_updated";

// Admin portal events
export const EVENT_ADMIN_DASHBOARD_VIEW = "admin_dashboard_view";
export const EVENT_PROVIDER_VERIFIED = "provider_verified";
export const EVENT_PROVIDER_STATUS_CHANGED = "provider_status_changed";
export const EVENT_IMPERSONATION_STARTED = "impersonation_started";
export const EVENT_IMPERSONATION_ENDED = "impersonation_ended";
export const EVENT_PAYOUT_APPROVED = "payout_approved";
export const EVENT_PAYOUT_REJECTED = "payout_rejected";
export const EVENT_REFUND_APPROVED = "refund_approved";
export const EVENT_API_KEY_CREATED = "api_key_created";
export const EVENT_API_KEY_UPDATED = "api_key_updated";
export const EVENT_API_KEY_DISABLED = "api_key_disabled";
export const EVENT_FEATURE_FLAG_CREATED = "feature_flag_created";
export const EVENT_FEATURE_FLAG_UPDATED = "feature_flag_updated";
export const EVENT_EXPLORE_POST_MODERATED = "explore_post_moderated";
export const EVENT_USER_REPORT_RESOLVED = "user_report_resolved";
export const EVENT_SYSTEM_HEALTH_VIEW = "system_health_view";
export const EVENT_MONITORING_ERROR_VIEW = "monitoring_error_view";
