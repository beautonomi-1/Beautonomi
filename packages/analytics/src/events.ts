/**
 * Canonical analytics event names.
 * Aligns with docs/analytics/EVENT_TAXONOMY.md for consistent funnels and provider ROI across web and mobile.
 * Use these constants when tracking so Amplitude reports stay consistent.
 */

// Authentication
export const EVENT_SIGNUP_START = "signup_start";
export const EVENT_SIGNUP_COMPLETE = "signup_complete";
export const EVENT_LOGIN_SUCCESS = "login_success";
export const EVENT_LOGOUT = "logout";

// Browsing & Discovery
export const EVENT_HOME_VIEW = "home_view";
export const EVENT_CATEGORY_VIEW = "category_view";
export const EVENT_SEARCH_PERFORMED = "search_performed";
export const EVENT_SEARCH_RESULT_CLICKED = "search_result_clicked";
export const EVENT_PROVIDER_PROFILE_VIEW = "provider_profile_view";
export const EVENT_SERVICE_SELECTED = "service_selected";
export const EVENT_WISHLIST_TOGGLE = "wishlist_toggle";

// Booking Flow
export const EVENT_BOOKING_START = "booking_start";
export const EVENT_BOOKING_HOLD_CREATED = "booking_hold_created";
export const EVENT_CHECKOUT_START = "checkout_start";
export const EVENT_PAYMENT_INITIATED = "payment_initiated";
export const EVENT_PAYMENT_SUCCESS = "payment_success";
export const EVENT_PAYMENT_FAILED = "payment_failed";
export const EVENT_BOOKING_CONFIRMED = "booking_confirmed";
export const EVENT_BOOKING_CANCELLED = "booking_cancelled";

// Retention & Loyalty
export const EVENT_BOOKING_RESCHEDULED = "booking_rescheduled";
export const EVENT_REVIEW_SUBMITTED = "review_submitted";
export const EVENT_LOYALTY_POINTS_EARNED = "loyalty_points_earned";
export const EVENT_LOYALTY_REDEEMED = "loyalty_redeemed";
export const EVENT_REFERRAL_SHARED = "referral_shared";

// Explore Feed
export const EVENT_EXPLORE_FEED_VIEW = "explore_feed_view";
export const EVENT_EXPLORE_POST_IMPRESSION = "explore_post_impression";
export const EVENT_EXPLORE_POST_CLICK = "explore_post_click";
export const EVENT_EXPLORE_POST_SAVE = "explore_post_save";
export const EVENT_EXPLORE_POST_UNSAVE = "explore_post_unsave";

// Provider Dashboard
export const EVENT_PROVIDER_DASHBOARD_VIEW = "provider_dashboard_view";
export const EVENT_PROVIDER_BOOKING_ACCEPTED = "provider_booking_accepted";
export const EVENT_PROVIDER_BOOKING_REJECTED = "provider_booking_rejected";
export const EVENT_PROVIDER_BOOKING_COMPLETED = "provider_booking_completed";
export const EVENT_PROVIDER_CALENDAR_VIEW = "provider_calendar_view";
export const EVENT_PROVIDER_STAFF_CREATED = "provider_staff_created";
export const EVENT_PROVIDER_SERVICE_CREATED = "provider_service_created";
export const EVENT_PROVIDER_PAYOUT_REQUESTED = "provider_payout_requested";
export const EVENT_PROVIDER_SETTINGS_UPDATED = "provider_settings_updated";
export const EVENT_PROVIDER_ANALYTICS_VIEW = "provider_analytics_view";

// Messaging
export const EVENT_MESSAGE_THREAD_OPEN = "message_thread_open";
export const EVENT_MESSAGE_SENT = "message_sent";
