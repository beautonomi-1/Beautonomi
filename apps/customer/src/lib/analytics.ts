import { Platform } from "react-native";

/**
 * Analytics event tracking utilities for the customer mobile app.
 * Event names are standardized with the web app (noun_action pattern).
 */

let amplitudeInstance: {
  logEvent: (name: string, props?: Record<string, unknown>) => void;
  identify?: (userId: string, props?: Record<string, unknown>) => void;
} | null = null;

/** Initialize with the Amplitude instance from AnalyticsProvider (null to clear). */
export function setAnalyticsInstance(instance: typeof amplitudeInstance) {
  amplitudeInstance = instance;
}

function track(event: string, properties?: Record<string, unknown>) {
  try {
    amplitudeInstance?.logEvent(event, {
      ...properties,
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

// ── Auth Events ──────────────────────────────────────────────────────────────

export function trackSignUp(method: "phone" | "email" | "google" | "apple") {
  track("signup_complete", { method });
}

export function trackLogin(method: "phone" | "email" | "google" | "apple") {
  track("login_success", { method });
}

export function trackLogout() {
  track("logout");
}

// ── Booking Events ───────────────────────────────────────────────────────────

export function trackBookingStarted(providerId: string, providerName: string) {
  track("booking_start", { provider_id: providerId, provider_name: providerName });
}

export function trackServiceSelected(serviceId: string, serviceName: string, price: number) {
  track("service_selected", { service_id: serviceId, service_name: serviceName, price });
}

export function trackBookingHoldCreated(holdId: string) {
  track("booking_hold_created", { hold_id: holdId });
}

export function trackCheckoutStarted(bookingId: string, total: number) {
  track("checkout_start", { booking_id: bookingId, total_amount: total });
}

export function trackPaymentInitiated(bookingId: string, method: string, amount: number) {
  track("payment_initiated", { booking_id: bookingId, method, amount });
}

export function trackBookingConfirmed(bookingId: string, paymentMethod: string, total: number) {
  track("booking_confirmed", {
    booking_id: bookingId,
    payment_method: paymentMethod,
    total_amount: total,
  });
}

export function trackPaymentSuccess(bookingId: string, amount: number) {
  track("payment_success", { booking_id: bookingId, amount });
}

export function trackPaymentFailed(error: string) {
  track("payment_failed", { error });
}

export function trackBookingCancelled(bookingId: string, reason?: string) {
  track("booking_cancelled", { booking_id: bookingId, reason });
}

export function trackBookingRescheduled(bookingId: string) {
  track("booking_rescheduled", { booking_id: bookingId });
}

// ── Search & Browse Events ───────────────────────────────────────────────────

export function trackSearch(query: string, category?: string, resultCount?: number) {
  track("search_view", { query, category, result_count: resultCount });
}

export function trackCategoryFilter(category: string) {
  track("search_filters_applied", { category });
}

export function trackProviderViewed(providerId: string, providerName: string) {
  track("provider_profile_view", { provider_id: providerId, provider_name: providerName });
}

export function trackHomeView() {
  track("home_view");
}

// ── Engagement Events ────────────────────────────────────────────────────────

export function trackWishlistToggle(providerId: string, added: boolean) {
  track("wishlist_toggle", { provider_id: providerId, action: added ? "add" : "remove" });
}

export function trackReviewSubmitted(providerId: string, rating: number) {
  track("review_submitted", { provider_id: providerId, rating });
}

export function trackShareProvider(providerId: string) {
  track("share_provider", { provider_id: providerId });
}

export function trackExplorePostViewed(postId: string) {
  track("explore_post_impression", { post_id: postId });
}

export function trackExplorePostLiked(postId: string) {
  track("explore_post_liked", { post_id: postId });
}

export function trackExploreSaved(postId: string) {
  track("explore_post_save", { post_id: postId });
}

// ── Payment Events ───────────────────────────────────────────────────────────

export function trackPaymentMethodSelected(method: "card" | "cash" | "wallet" | "gift_card") {
  track("payment_method_selected", { method });
}

export function trackGiftCardPurchased(amount: number) {
  track("gift_card_purchased", { amount });
}

// ── Custom Request Events ────────────────────────────────────────────────────

export function trackCustomRequestCreated(providerId: string) {
  track("custom_request_created", { provider_id: providerId });
}

// ── Messaging ────────────────────────────────────────────────────────────────

export function trackMessageThreadOpen(conversationId: string) {
  track("message_thread_open", { conversation_id: conversationId });
}

export function trackMessageSent(conversationId: string) {
  track("message_sent", { conversation_id: conversationId });
}

// ── Notification Events ──────────────────────────────────────────────────────

export function trackNotificationOpened(type: string, data?: Record<string, unknown>) {
  track("notification_opened", { notification_type: type, ...data });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

export function trackLoyaltyPointsEarned(points: number, action: string) {
  track("loyalty_points_earned", { points, action });
}

export function trackLoyaltyRedeemed(points: number, discount: number) {
  track("loyalty_redeemed", { points, discount });
}

// ── Referrals ────────────────────────────────────────────────────────────────

export function trackReferralShared(channel: string) {
  track("referral_shared", { channel });
}

// ── E-Commerce Events ────────────────────────────────────────────────────────

export function trackProductViewed(productId: string, productName: string, price: number, providerId: string) {
  track("product_viewed", { product_id: productId, product_name: productName, price, provider_id: providerId });
}

export function trackAddToCart(productId: string, productName: string, quantity: number, price: number) {
  track("add_to_cart", { product_id: productId, product_name: productName, quantity, price, value: price * quantity });
}

export function trackRemoveFromCart(productId: string) {
  track("remove_from_cart", { product_id: productId });
}

export function trackCartViewed(itemCount: number, total: number) {
  track("cart_viewed", { item_count: itemCount, cart_total: total });
}

export function trackProductCheckoutStarted(providerId: string, itemCount: number, subtotal: number) {
  track("product_checkout_started", { provider_id: providerId, item_count: itemCount, subtotal });
}

export function trackProductOrderPlaced(orderId: string, orderNumber: string, total: number, paymentMethod: string, fulfillmentType: string) {
  track("product_order_placed", {
    order_id: orderId,
    order_number: orderNumber,
    total_amount: total,
    payment_method: paymentMethod,
    fulfillment_type: fulfillmentType,
  });
}

export function trackProductOrderPaid(orderId: string, total: number, paymentMethod: string) {
  track("product_order_paid", { order_id: orderId, total_amount: total, payment_method: paymentMethod });
}

export function trackReturnRequested(orderId: string, reason: string, refundAmount: number) {
  track("product_return_requested", { order_id: orderId, reason, refund_amount: refundAmount });
}

export function trackShopBrowsed(category?: string, searchQuery?: string) {
  track("shop_browsed", { category, search_query: searchQuery });
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function trackScreenView(screenName: string) {
  track("page_view", { screen_name: screenName, platform: Platform.OS });
}

export function trackMarketAutoSwitch(input: {
  fromHost: string;
  toHost: string;
  source: string;
  confidence: string;
  countryCode?: string;
}) {
  track("market_auto_switch_attempted", {
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
  track("market_auto_switch_suppressed", {
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
  reason: "unsupported" | "restricted" | "manual";
  countryCode?: string;
}) {
  track("market_manual_switch", {
    from_host: input.fromHost,
    to_host: input.toHost,
    reason: input.reason,
    country_code: input.countryCode,
  });
}

export function trackMarketSwitchDeclined(input: {
  host: string;
  reason: "unsupported" | "restricted";
  countryCode?: string;
}) {
  track("market_switch_declined", {
    host: input.host,
    reason: input.reason,
    country_code: input.countryCode,
  });
}

// ── Support tickets (customer app) ───────────────────────────────────────────

export function trackSupportTicketsView() {
  track("customer_support_tickets_view");
}

export function trackSupportTicketDetailView(ticketId: string, ticketNumber?: string) {
  track("customer_support_ticket_detail_view", { ticket_id: ticketId, ticket_number: ticketNumber });
}

export function trackSupportTicketCreated(ticketNumber?: string) {
  track("customer_support_ticket_created", { ticket_number: ticketNumber });
}

export function trackSupportTicketReply(ticketId: string) {
  track("customer_support_ticket_reply", { ticket_id: ticketId });
}
