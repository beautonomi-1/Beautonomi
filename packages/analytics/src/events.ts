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
export const EVENT_ADDITIONAL_CHARGE_PAID = "additional_charge_paid";
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

// App lifecycle & attribution (mobile-first; web emits page_view instead of app_open)
export const EVENT_APP_OPEN = "app_open";
export const EVENT_PAGE_VIEW = "page_view";
export const EVENT_PUSH_NOTIFICATION_OPENED = "push_notification_opened";
export const EVENT_DEEP_LINK_OPENED = "deep_link_opened";

// Server-authoritative money events (emit via trackServer with insert_id = `${reference}:${event}`)
export const EVENT_WALLET_TOPUP = "wallet_topup";
export const EVENT_GIFT_CARD_PURCHASED = "gift_card_purchased";
export const EVENT_GIFT_CARD_REDEEMED = "gift_card_redeemed";
export const EVENT_MEMBERSHIP_PURCHASED = "membership_purchased";
export const EVENT_MEMBERSHIP_RENEWED = "membership_renewed";
export const EVENT_PRODUCT_ORDER_PAID = "product_order_paid";
export const EVENT_PROVIDER_SUBSCRIPTION_PAID = "provider_subscription_paid";
export const EVENT_ADS_BUDGET_PAID = "ads_budget_paid";
export const EVENT_APPLE_IAP_VERIFIED = "apple_iap_verified";

// Client-side commerce funnel (server owns the paid events above)
export const EVENT_PAYMENT_METHOD_SELECTED = "payment_method_selected";
export const EVENT_PRODUCT_VIEWED = "product_viewed";
export const EVENT_ADD_TO_CART = "add_to_cart";
export const EVENT_REMOVE_FROM_CART = "remove_from_cart";
export const EVENT_CART_VIEWED = "cart_viewed";
export const EVENT_PRODUCT_CHECKOUT_STARTED = "product_checkout_started";
export const EVENT_PRODUCT_ORDER_PLACED = "product_order_placed";
export const EVENT_PRODUCT_RETURN_REQUESTED = "product_return_requested";
export const EVENT_SHOP_BROWSED = "shop_browsed";
export const EVENT_GIFT_CARD_CHECKOUT_START = "gift_card_checkout_start";
export const EVENT_CUSTOM_REQUEST_CREATED = "custom_request_created";
export const EVENT_SHARE_PROVIDER = "share_provider";

// Provider growth funnel
export const EVENT_PROVIDER_ONBOARDING_STEP_COMPLETED = "provider_onboarding_step_completed";
export const EVENT_PROVIDER_SUBSCRIPTION_CHECKOUT_START = "provider_subscription_checkout_start";
export const EVENT_ADS_CAMPAIGN_CHECKOUT_START = "ads_campaign_checkout_start";
export const EVENT_ADS_CAMPAIGN_FILTER = "ads_campaign_filter";
export const EVENT_STAFF_INVITED = "staff_invited";
export const EVENT_STAFF_INVITE_ACCEPTED = "staff_invite_accepted";
export const EVENT_STAFF_CREATED = "staff_created";
export const EVENT_STAFF_ROLE_CHANGED = "staff_role_changed";
export const EVENT_PERMISSION_CHANGED = "permission_changed";

// Provider operations (mobile + web provider portal)
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
export const EVENT_EXPLORE_POST_CREATED = "explore_post_created";
export const EVENT_EXPLORE_POST_PUBLISHED = "explore_post_published";
export const EVENT_EXPLORE_POST_DELETED = "explore_post_deleted";
export const EVENT_MARKETING_AUTOMATION_CREATED = "marketing_automation_created";
export const EVENT_MARKETING_AUTOMATION_EXECUTED = "marketing_automation_executed";
export const EVENT_CAMPAIGN_SENT = "campaign_sent";
export const EVENT_PRODUCT_CREATED = "product_created";
export const EVENT_PRODUCT_UPDATED = "product_updated";
export const EVENT_PRODUCT_ORDER_FULFILLED = "product_order_fulfilled";
export const EVENT_WALK_IN_SALE_COMPLETED = "walk_in_sale_completed";
export const EVENT_PRODUCT_RETURN_PROCESSED = "product_return_processed";
export const EVENT_SHIPPING_CONFIG_UPDATED = "shipping_config_updated";

// At-home journey (B3) — provider surfaces
export const EVENT_PROVIDER_JOURNEY_STARTED = "provider_journey_started";
export const EVENT_PROVIDER_ETA_UPDATED = "provider_eta_updated";
export const EVENT_PROVIDER_ARRIVED = "provider_arrived";

// Support tickets (names are portal-prefixed for historical dashboard continuity)
export const EVENT_CUSTOMER_SUPPORT_TICKETS_VIEW = "customer_support_tickets_view";
export const EVENT_CUSTOMER_SUPPORT_TICKET_DETAIL_VIEW = "customer_support_ticket_detail_view";
export const EVENT_CUSTOMER_SUPPORT_TICKET_CREATED = "customer_support_ticket_created";
export const EVENT_CUSTOMER_SUPPORT_TICKET_REPLY = "customer_support_ticket_reply";
export const EVENT_PROVIDER_SUPPORT_TICKETS_VIEW = "provider_support_tickets_view";
export const EVENT_PROVIDER_SUPPORT_TICKET_DETAIL_VIEW = "provider_support_ticket_detail_view";
export const EVENT_PROVIDER_SUPPORT_TICKET_CREATED = "provider_support_ticket_created";
export const EVENT_PROVIDER_SUPPORT_TICKET_REPLY = "provider_support_ticket_reply";

// Trust & Safety (portal property distinguishes customer/provider)
export const EVENT_SAFETY_HUB_VIEW = "safety_hub_view";
export const EVENT_SAFETY_HUB_NAV = "safety_hub_nav";
export const EVENT_EMERGENCY_CONTACT_SAVED = "emergency_contact_saved";
export const EVENT_CONTENT_SAFETY_TOGGLE = "content_safety_toggle";
export const EVENT_CONTENT_REPORT_SUBMITTED = "content_report_submitted";
export const EVENT_USER_REPORT_SUBMITTED = "user_report_submitted";

// Web portal only (legacy names kept for dashboard continuity)
export const EVENT_SESSION_START = "session_start";
export const EVENT_SESSION_END = "session_end";
export const EVENT_SEARCH_VIEW = "search_view";
export const EVENT_SEARCH_FILTERS_APPLIED = "search_filters_applied";
export const EVENT_SEARCH_RESULT_IMPRESSION = "search_result_impression";
export const EVENT_BOOKING_DETAILS_COMPLETED = "booking_details_completed";
export const EVENT_REFUND_REQUESTED = "refund_requested";
/** Web identifier aliases (same values as the canonical constants above). */
export const EVENT_SEARCH_RESULT_CLICK = EVENT_SEARCH_RESULT_CLICKED;
export const EVENT_EXPLORE_SAVE = EVENT_EXPLORE_POST_SAVE;
export const EVENT_EXPLORE_UNSAVE = EVENT_EXPLORE_POST_UNSAVE;

// Admin portal
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

// Market routing
export const EVENT_MARKET_AUTO_SWITCH_ATTEMPTED = "market_auto_switch_attempted";
export const EVENT_MARKET_AUTO_SWITCH_SUPPRESSED = "market_auto_switch_suppressed";
export const EVENT_MARKET_MANUAL_SWITCH = "market_manual_switch";
export const EVENT_MARKET_SWITCH_DECLINED = "market_switch_declined";

/**
 * Typed property schemas for the canonical events. Property keys are ids only —
 * never `provider_name` / `service_name` / `product_name` (PII / cardinality).
 * Money events carry `amount` (major units) + `currency`; the server helper
 * mirrors them into Amplitude Revenue (`$revenue`, `$revenueType`, `$productId`).
 */
export type MoneyEventProperties = {
  amount: number;
  currency?: string;
  payment_method?: string;
  payment_provider?: string;
  /** Gateway / ledger reference; also the insert_id root. */
  transaction_id: string;
  portal?: "client" | "provider" | "admin";
};

export type AnalyticsEventProperties = {
  [EVENT_SIGNUP_START]: { method?: string; portal?: string };
  [EVENT_SIGNUP_COMPLETE]: { method: string; role?: string; portal?: string };
  [EVENT_LOGIN_SUCCESS]: { method: string; portal?: string };
  [EVENT_LOGOUT]: { portal?: string };
  [EVENT_APP_OPEN]: { portal: "client" | "provider"; cold_start: boolean; source?: "push" | "deep_link" | "direct" };
  [EVENT_PUSH_NOTIFICATION_OPENED]: { notification_type?: string; portal: "client" | "provider" };
  [EVENT_DEEP_LINK_OPENED]: { host?: string; path?: string; source?: string; portal: "client" | "provider" };
  [EVENT_HOME_VIEW]: { referrer?: string };
  [EVENT_CATEGORY_VIEW]: { category_id?: string; category_name?: string };
  [EVENT_SEARCH_PERFORMED]: { query?: string; category?: string; results_count?: number };
  [EVENT_SEARCH_RESULT_CLICKED]: { provider_id: string; position?: number };
  [EVENT_PROVIDER_PROFILE_VIEW]: { provider_id: string; source?: string };
  [EVENT_SERVICE_SELECTED]: { service_id: string; provider_id?: string; price?: number };
  [EVENT_WISHLIST_TOGGLE]: { provider_id: string; action: "add" | "remove" };
  [EVENT_BOOKING_START]: { provider_id: string; service_ids?: string[] };
  [EVENT_BOOKING_HOLD_CREATED]: { hold_id: string; duration_minutes?: number };
  [EVENT_CHECKOUT_START]: { booking_id?: string; total?: number; payment_method?: string };
  [EVENT_PAYMENT_INITIATED]: { booking_id?: string; method: string; amount: number };
  [EVENT_PAYMENT_SUCCESS]: MoneyEventProperties & { booking_id: string };
  [EVENT_PAYMENT_FAILED]: { booking_id?: string; error?: string; transaction_id?: string };
  [EVENT_ADDITIONAL_CHARGE_PAID]: MoneyEventProperties & { booking_id: string; charge_id: string };
  [EVENT_BOOKING_CONFIRMED]: { booking_id: string; total?: number; services_count?: number; payment_method?: string };
  [EVENT_BOOKING_CANCELLED]: { booking_id: string; reason?: string; cancelled_by?: "customer" | "provider" };
  [EVENT_BOOKING_RESCHEDULED]: { booking_id: string; new_date?: string; rescheduled_by?: "customer" | "provider"; notify_customer?: boolean };
  [EVENT_REVIEW_SUBMITTED]: { booking_id?: string; provider_id: string; rating: number };
  [EVENT_WALLET_TOPUP]: MoneyEventProperties & { wallet_id?: string };
  [EVENT_GIFT_CARD_PURCHASED]: MoneyEventProperties & { gift_card_id: string };
  [EVENT_GIFT_CARD_REDEEMED]: MoneyEventProperties & { gift_card_id: string; booking_id?: string; order_id?: string };
  [EVENT_MEMBERSHIP_PURCHASED]: MoneyEventProperties & { membership_id: string; plan_id?: string };
  [EVENT_MEMBERSHIP_RENEWED]: MoneyEventProperties & { membership_id: string; plan_id?: string };
  [EVENT_PRODUCT_ORDER_PAID]: MoneyEventProperties & { order_id: string; item_count?: number };
  [EVENT_PROVIDER_SUBSCRIPTION_PAID]: MoneyEventProperties & { subscription_id: string; plan_id?: string; provider_id: string };
  [EVENT_ADS_BUDGET_PAID]: MoneyEventProperties & { campaign_id: string; provider_id: string };
  [EVENT_APPLE_IAP_VERIFIED]: MoneyEventProperties & { product_id: string; original_transaction_id?: string };
  [EVENT_PROVIDER_ONBOARDING_STEP_COMPLETED]: { step: string; step_index?: number; portal: "provider" };
  [EVENT_PROVIDER_SUBSCRIPTION_CHECKOUT_START]: { plan_id: string; billing_cycle?: string; portal: "provider" };
  [EVENT_ADS_CAMPAIGN_CHECKOUT_START]: { campaign_id?: string; budget: number; currency?: string; portal: "provider" };
  [EVENT_STAFF_INVITE_ACCEPTED]: { staff_id?: string; provider_id?: string; portal: "provider" };
  [EVENT_PROVIDER_JOURNEY_STARTED]: { booking_id: string; eta_minutes?: number | null; portal: "provider" };
  [EVENT_PROVIDER_ETA_UPDATED]: { booking_id: string; eta_minutes: number; previous_eta_minutes?: number | null; running_late: boolean; portal: "provider" };
  [EVENT_PROVIDER_ARRIVED]: { booking_id: string; portal: "provider" };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties | string;
