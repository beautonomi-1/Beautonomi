import { Platform } from "react-native";
import {
  EVENT_ADD_TO_CART,
  EVENT_ADDITIONAL_CHARGE_PAID,
  EVENT_APP_OPEN,
  EVENT_BOOKING_CANCELLED,
  EVENT_BOOKING_CONFIRMED,
  EVENT_BOOKING_HOLD_CREATED,
  EVENT_BOOKING_RESCHEDULED,
  EVENT_BOOKING_START,
  EVENT_CART_VIEWED,
  EVENT_CHECKOUT_START,
  EVENT_CONTENT_REPORT_SUBMITTED,
  EVENT_CONTENT_SAFETY_TOGGLE,
  EVENT_CUSTOM_REQUEST_CREATED,
  EVENT_CUSTOMER_SUPPORT_TICKET_CREATED,
  EVENT_CUSTOMER_SUPPORT_TICKET_DETAIL_VIEW,
  EVENT_CUSTOMER_SUPPORT_TICKET_REPLY,
  EVENT_CUSTOMER_SUPPORT_TICKETS_VIEW,
  EVENT_DEEP_LINK_OPENED,
  EVENT_EMERGENCY_CONTACT_SAVED,
  EVENT_EXPLORE_POST_CLICK,
  EVENT_EXPLORE_POST_IMPRESSION,
  EVENT_EXPLORE_POST_SAVE,
  EVENT_GIFT_CARD_CHECKOUT_START,
  EVENT_HOME_VIEW,
  EVENT_LOGIN_SUCCESS,
  EVENT_LOGOUT,
  EVENT_LOYALTY_POINTS_EARNED,
  EVENT_LOYALTY_REDEEMED,
  EVENT_MARKET_AUTO_SWITCH_ATTEMPTED,
  EVENT_MARKET_AUTO_SWITCH_SUPPRESSED,
  EVENT_MARKET_MANUAL_SWITCH,
  EVENT_MARKET_SWITCH_DECLINED,
  EVENT_MESSAGE_SENT,
  EVENT_MESSAGE_THREAD_OPEN,
  EVENT_PAGE_VIEW,
  EVENT_PAYMENT_FAILED,
  EVENT_PAYMENT_INITIATED,
  EVENT_PAYMENT_METHOD_SELECTED,
  EVENT_PAYMENT_SUCCESS,
  EVENT_PRODUCT_CHECKOUT_STARTED,
  EVENT_PRODUCT_ORDER_PAID,
  EVENT_PRODUCT_ORDER_PLACED,
  EVENT_PRODUCT_RETURN_REQUESTED,
  EVENT_PRODUCT_VIEWED,
  EVENT_PROVIDER_PROFILE_VIEW,
  EVENT_PUSH_NOTIFICATION_OPENED,
  EVENT_REFERRAL_SHARED,
  EVENT_REMOVE_FROM_CART,
  EVENT_REVIEW_SUBMITTED,
  EVENT_SAFETY_HUB_NAV,
  EVENT_SAFETY_HUB_VIEW,
  EVENT_SEARCH_FILTERS_APPLIED,
  EVENT_SEARCH_PERFORMED,
  EVENT_SERVICE_SELECTED,
  EVENT_SHARE_PROVIDER,
  EVENT_SHOP_BROWSED,
  EVENT_SIGNUP_COMPLETE,
  EVENT_SIGNUP_START,
  EVENT_USER_REPORT_SUBMITTED,
  EVENT_WISHLIST_TOGGLE,
} from "@beautonomi/analytics";

/**
 * Analytics event tracking utilities for the customer mobile app.
 * Event names come from the shared taxonomy (`@beautonomi/analytics`); properties are ids only —
 * never provider/service/product names (PII + cardinality; see docs/analytics/EVENT_TAXONOMY.md).
 */

let amplitudeInstance: {
  logEvent: (name: string, props?: Record<string, unknown>) => void;
  identify?: (userId: string, props?: Record<string, unknown>) => void;
} | null = null;

/** Initialize with the Amplitude instance from AnalyticsProvider (null to clear). */
export function setAnalyticsInstance(instance: typeof amplitudeInstance) {
  amplitudeInstance = instance;
}

/**
 * Property denylist mirroring web `plugins/privacy.ts`: free-text names and contact details
 * never leave the device inside event properties. Ids are fine.
 */
const PII_PROPERTY_KEYS = new Set([
  "provider_name",
  "service_name",
  "product_name",
  "customer_name",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_number",
  "address",
  "address_line1",
  "address_line2",
  "notes",
]);

export function stripPiiProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!properties) return properties;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_PROPERTY_KEYS.has(key)) {
      changed = true;
      continue;
    }
    out[key] = value;
  }
  return changed ? out : properties;
}

function track(event: string, properties?: Record<string, unknown>) {
  try {
    amplitudeInstance?.logEvent(event, {
      ...stripPiiProperties(properties),
      platform: Platform.OS,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Silently fail - analytics should never crash the app
  }
}

/**
 * Identify user with properties for segmentation.
 * Call after login or when user data changes.
 */
export function identifyUser(
  userId: string,
  properties: {
    role?: string;
    phone?: string;
    email?: string;
    country?: string;
    city?: string;
    lifetime_bookings?: number;
    last_booking_date?: string;
    favorite_categories?: string[];
    loyalty_points?: number;
    membership_plan_id?: string;
    device_type?: string;
    /** Spec §14.7 — active market / discovery tenant */
    active_tenant_id?: string;
    /** Booking financial tenant when known */
    booking_tenant_id?: string;
  }
) {
  try {
    amplitudeInstance?.identify?.(userId, {
      ...properties,
      platform: Platform.OS,
      device_type: Platform.OS,
    });
  } catch {
    // Silently fail
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────

export function trackAppOpen(coldStart: boolean, source: "push" | "deep_link" | "direct" = "direct") {
  track(EVENT_APP_OPEN, { portal: "client", cold_start: coldStart, source });
}

export function trackDeepLinkOpened(url: string, source?: string) {
  let host: string | undefined;
  let pathname: string | undefined;
  try {
    const parsed = new URL(url);
    host = parsed.host || undefined;
    pathname = parsed.pathname || undefined;
  } catch {
    // Custom scheme without authority; keep the raw path portion only.
    pathname = url.replace(/^[a-z][a-z0-9+.-]*:\/*/i, "").split("?")[0] || undefined;
  }
  track(EVENT_DEEP_LINK_OPENED, { portal: "client", host, path: pathname, source });
}

// ── Auth Events ──────────────────────────────────────────────────────────────

export function trackSignUpStart(method?: "phone" | "email" | "google" | "apple") {
  track(EVENT_SIGNUP_START, { method, portal: "client" });
}

export function trackSignUp(method: "phone" | "email" | "google" | "apple") {
  track(EVENT_SIGNUP_COMPLETE, { method, role: "customer", portal: "client" });
}

export function trackLogin(method: "phone" | "email" | "google" | "apple") {
  track(EVENT_LOGIN_SUCCESS, { method, portal: "client" });
}

export function trackLogout() {
  track(EVENT_LOGOUT, { portal: "client" });
}

// ── Booking Events ───────────────────────────────────────────────────────────

/** `providerName` is accepted for backwards compatibility but intentionally not sent (PII). */
export function trackBookingStarted(providerId: string, _providerName?: string, serviceIds?: string[]) {
  track(EVENT_BOOKING_START, { provider_id: providerId, service_ids: serviceIds });
}

export function trackServiceSelected(serviceId: string, _serviceName: string | undefined, price: number, providerId?: string) {
  track(EVENT_SERVICE_SELECTED, { service_id: serviceId, provider_id: providerId, price });
}

export function trackBookingHoldCreated(holdId: string, durationMinutes?: number) {
  track(EVENT_BOOKING_HOLD_CREATED, { hold_id: holdId, duration_minutes: durationMinutes });
}

export function trackCheckoutStarted(bookingId: string, total: number, paymentMethod?: string) {
  track(EVENT_CHECKOUT_START, { booking_id: bookingId, total, payment_method: paymentMethod });
}

export function trackPaymentInitiated(bookingId: string, method: string, amount: number) {
  track(EVENT_PAYMENT_INITIATED, { booking_id: bookingId, method, amount });
}

export function trackBookingConfirmed(bookingId: string, paymentMethod: string, total: number, servicesCount?: number) {
  track(EVENT_BOOKING_CONFIRMED, {
    booking_id: bookingId,
    payment_method: paymentMethod,
    total,
    services_count: servicesCount,
  });
}

/**
 * Client-side echo of a booking payment. The server is authoritative for revenue
 * (`trackPaymentSuccessServer` with insert_id); this exists for in-session funnels only.
 */
export function trackPaymentSuccess(bookingId: string, amount: number, method?: string) {
  track(EVENT_PAYMENT_SUCCESS, { booking_id: bookingId, amount, method, source: "client" });
}

export function trackAdditionalChargePaid(bookingId: string, chargeId: string, amount: number) {
  track(EVENT_ADDITIONAL_CHARGE_PAID, { booking_id: bookingId, charge_id: chargeId, amount, source: "client" });
}

export function trackPaymentFailed(error: string, bookingId?: string) {
  track(EVENT_PAYMENT_FAILED, { error, booking_id: bookingId });
}

export function trackBookingCancelled(bookingId: string, reason?: string) {
  track(EVENT_BOOKING_CANCELLED, { booking_id: bookingId, reason, cancelled_by: "customer" });
}

export function trackBookingRescheduled(bookingId: string, newDate?: string) {
  track(EVENT_BOOKING_RESCHEDULED, { booking_id: bookingId, new_date: newDate, rescheduled_by: "customer" });
}

// ── Search & Browse Events ───────────────────────────────────────────────────

export function trackSearch(query: string, category?: string, resultCount?: number) {
  track(EVENT_SEARCH_PERFORMED, { query, category, results_count: resultCount });
}

export function trackCategoryFilter(category: string) {
  track(EVENT_SEARCH_FILTERS_APPLIED, { category });
}

/** `providerName` is accepted for backwards compatibility but intentionally not sent (PII). */
export function trackProviderViewed(providerId: string, _providerName?: string, source?: string) {
  track(EVENT_PROVIDER_PROFILE_VIEW, { provider_id: providerId, source });
}

export function trackHomeView() {
  track(EVENT_HOME_VIEW);
}

// ── Engagement Events ────────────────────────────────────────────────────────

export function trackWishlistToggle(providerId: string, added: boolean) {
  track(EVENT_WISHLIST_TOGGLE, { provider_id: providerId, action: added ? "add" : "remove" });
}

export function trackReviewSubmitted(providerId: string, rating: number, bookingId?: string) {
  track(EVENT_REVIEW_SUBMITTED, { provider_id: providerId, rating, booking_id: bookingId });
}

export function trackShareProvider(providerId: string) {
  track(EVENT_SHARE_PROVIDER, { provider_id: providerId });
}

export function trackExplorePostViewed(postId: string, position?: number) {
  track(EVENT_EXPLORE_POST_IMPRESSION, { post_id: postId, position });
}

export function trackExplorePostLiked(postId: string) {
  track(EVENT_EXPLORE_POST_CLICK, { post_id: postId, action: "like" });
}

export function trackExploreSaved(postId: string) {
  track(EVENT_EXPLORE_POST_SAVE, { post_id: postId });
}

// ── Payment Events ───────────────────────────────────────────────────────────

export function trackPaymentMethodSelected(method: "card" | "cash" | "wallet" | "gift_card") {
  track(EVENT_PAYMENT_METHOD_SELECTED, { method });
}

/**
 * Gift card checkout started on the client. `gift_card_purchased` (revenue) is server-owned —
 * see `track-gift-card-server.ts`.
 */
export function trackGiftCardPurchased(amount: number, currency?: string) {
  track(EVENT_GIFT_CARD_CHECKOUT_START, { amount, currency });
}

// ── Custom Request Events ────────────────────────────────────────────────────

export function trackCustomRequestCreated(providerId: string) {
  track(EVENT_CUSTOM_REQUEST_CREATED, { provider_id: providerId });
}

// ── Messaging ────────────────────────────────────────────────────────────────

export function trackMessageThreadOpen(conversationId: string) {
  track(EVENT_MESSAGE_THREAD_OPEN, { conversation_id: conversationId });
}

export function trackMessageSent(conversationId: string) {
  track(EVENT_MESSAGE_SENT, { conversation_id: conversationId });
}

// ── Notification Events ──────────────────────────────────────────────────────

export function trackNotificationOpened(type: string, data?: Record<string, unknown>) {
  track(EVENT_PUSH_NOTIFICATION_OPENED, { notification_type: type, portal: "client", ...data });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

export function trackLoyaltyPointsEarned(points: number, action: string) {
  track(EVENT_LOYALTY_POINTS_EARNED, { points, action });
}

export function trackLoyaltyRedeemed(points: number, discount: number) {
  track(EVENT_LOYALTY_REDEEMED, { points, discount_amount: discount });
}

// ── Referrals ────────────────────────────────────────────────────────────────

export function trackReferralShared(channel: string) {
  track(EVENT_REFERRAL_SHARED, { channel });
}

// ── E-Commerce Events ────────────────────────────────────────────────────────

export function trackProductViewed(productId: string, _productName: string | undefined, price: number, providerId: string) {
  track(EVENT_PRODUCT_VIEWED, { product_id: productId, price, provider_id: providerId });
}

export function trackAddToCart(productId: string, _productName: string | undefined, quantity: number, price: number) {
  track(EVENT_ADD_TO_CART, { product_id: productId, quantity, price, value: price * quantity });
}

export function trackRemoveFromCart(productId: string) {
  track(EVENT_REMOVE_FROM_CART, { product_id: productId });
}

export function trackCartViewed(itemCount: number, total: number) {
  track(EVENT_CART_VIEWED, { item_count: itemCount, cart_total: total });
}

export function trackProductCheckoutStarted(providerId: string, itemCount: number, subtotal: number) {
  track(EVENT_PRODUCT_CHECKOUT_STARTED, { provider_id: providerId, item_count: itemCount, subtotal });
}

export function trackProductOrderPlaced(orderId: string, orderNumber: string, total: number, paymentMethod: string, fulfillmentType: string) {
  track(EVENT_PRODUCT_ORDER_PLACED, {
    order_id: orderId,
    order_number: orderNumber,
    total_amount: total,
    payment_method: paymentMethod,
    fulfillment_type: fulfillmentType,
  });
}

/** Client echo only; revenue is server-owned (`trackProductOrderPaidServer`). */
export function trackProductOrderPaid(orderId: string, total: number, paymentMethod: string) {
  track(EVENT_PRODUCT_ORDER_PAID, { order_id: orderId, total_amount: total, payment_method: paymentMethod, source: "client" });
}

export function trackReturnRequested(orderId: string, reason: string, refundAmount: number) {
  track(EVENT_PRODUCT_RETURN_REQUESTED, { order_id: orderId, reason, refund_amount: refundAmount });
}

export function trackShopBrowsed(category?: string, searchQuery?: string) {
  track(EVENT_SHOP_BROWSED, { category, search_query: searchQuery });
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function trackScreenView(screenName: string) {
  track(EVENT_PAGE_VIEW, { screen_name: screenName, platform: Platform.OS });
}

export function trackMarketAutoSwitch(input: {
  fromHost: string;
  toHost: string;
  source: string;
  confidence: string;
  countryCode?: string;
}) {
  track(EVENT_MARKET_AUTO_SWITCH_ATTEMPTED, {
    from_host: input.fromHost,
    to_host: input.toHost,
    source: input.source,
    confidence: input.confidence,
    country_code: input.countryCode,
  });
}

export function trackMarketAutoSwitchSuppressed(input: {
  fromHost: string;
  toHost: string;
  reason: "manual_override";
  source: string;
  confidence: string;
  countryCode?: string;
}) {
  track(EVENT_MARKET_AUTO_SWITCH_SUPPRESSED, {
    from_host: input.fromHost,
    to_host: input.toHost,
    reason: input.reason,
    source: input.source,
    confidence: input.confidence,
    country_code: input.countryCode,
  });
}

export function trackMarketManualSwitch(input: {
  fromHost: string;
  toHost: string;
  reason: "unsupported" | "restricted" | "manual" | "za_banner";
  countryCode?: string;
}) {
  track(EVENT_MARKET_MANUAL_SWITCH, {
    from_host: input.fromHost,
    to_host: input.toHost,
    reason: input.reason,
    country_code: input.countryCode,
  });
}

export function trackMarketSwitchDeclined(input: {
  host: string;
  reason: "unsupported" | "restricted" | "za_banner_stay";
  countryCode?: string;
}) {
  track(EVENT_MARKET_SWITCH_DECLINED, {
    host: input.host,
    reason: input.reason,
    country_code: input.countryCode,
  });
}

// ── Support tickets (customer app) ───────────────────────────────────────────

export function trackSupportTicketsView() {
  track(EVENT_CUSTOMER_SUPPORT_TICKETS_VIEW);
}

export function trackSupportTicketDetailView(ticketId: string, ticketNumber?: string) {
  track(EVENT_CUSTOMER_SUPPORT_TICKET_DETAIL_VIEW, { ticket_id: ticketId, ticket_number: ticketNumber });
}

export function trackSupportTicketCreated(ticketNumber?: string) {
  track(EVENT_CUSTOMER_SUPPORT_TICKET_CREATED, { ticket_number: ticketNumber });
}

export function trackSupportTicketReply(ticketId: string) {
  track(EVENT_CUSTOMER_SUPPORT_TICKET_REPLY, { ticket_id: ticketId });
}

// ── Trust & Safety ───────────────────────────────────────────────────────────

export function trackSafetyHubView() {
  track(EVENT_SAFETY_HUB_VIEW, { portal: "customer" });
}

export function trackSafetyHubNav(destination: string, from: "hub" | "settings") {
  track(EVENT_SAFETY_HUB_NAV, { destination, from, portal: "customer" });
}

export function trackEmergencyContactSaved() {
  track(EVENT_EMERGENCY_CONTACT_SAVED, { portal: "customer" });
}

export function trackContentSafetyToggle(key: string, value: boolean) {
  track(EVENT_CONTENT_SAFETY_TOGGLE, { key, value, portal: "customer" });
}

export function trackContentReportSubmitted(targetType: string) {
  track(EVENT_CONTENT_REPORT_SUBMITTED, { target_type: targetType, portal: "customer" });
}

export function trackUserReportSubmitted(reportType: string) {
  track(EVENT_USER_REPORT_SUBMITTED, { report_type: reportType, portal: "customer" });
}
