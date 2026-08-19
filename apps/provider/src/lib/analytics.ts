import { Platform } from "react-native";

/**
 * Analytics event tracking utilities for the provider mobile app.
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
 * Identify provider user with properties for segmentation.
 * Call after login or when provider data changes.
 */
export function identifyProvider(
  userId: string,
  properties: {
    role?: string;
    provider_id?: string;
    provider_status?: string;
    business_type?: string;
    is_verified?: boolean;
    subscription_tier?: string;
    locations_count?: number;
    staff_count?: number;
    yoco_enabled?: boolean;
    total_bookings?: number;
    total_revenue?: number;
    country?: string;
    city?: string;
    preferred_language?: string | null;
    signup_source?: string | null;
    portal?: string;
    active_tenant_id?: string;
    booking_tenant_id?: string;
  }
) {
  try {
    amplitudeInstance?.identify?.(userId, {
      ...properties,
      platform: Platform.OS,
      device_type: Platform.OS,
      portal: properties.portal ?? "provider",
    });
  } catch {
    // Silently fail
  }
}

// ── Auth Events ──────────────────────────────────────────────────────────────

export function trackSignUp(method: "phone" | "email") {
  track("signup_complete", { method, portal: "provider" });
}

export function trackLogin(method: "phone" | "email") {
  track("login_success", { method, portal: "provider" });
}

export function trackLogout() {
  track("logout", { portal: "provider" });
}

// ── Dashboard Events ─────────────────────────────────────────────────────────

export function trackDashboardView() {
  track("provider_dashboard_view");
}

export function trackCalendarView() {
  track("provider_calendar_view");
}

export function trackCalendarAction(action: string, bookingId?: string) {
  track("provider_calendar_action", { action, booking_id: bookingId });
}

// ── Booking Events ───────────────────────────────────────────────────────────

export function trackFrontDeskView() {
  track("front_desk_view");
}

export function trackFrontDeskStatusChange(bookingId: string, newStatus: string) {
  track("front_desk_status_change", { booking_id: bookingId, new_status: newStatus });
}

export function trackWalkInCreated(bookingId: string) {
  track("walkin_created", { booking_id: bookingId });
}

export function trackBookingCompleted(bookingId: string, revenue: number) {
  track("provider_booking_completed", { booking_id: bookingId, revenue });
}

export function trackBookingCancelled(bookingId: string, reason?: string) {
  track("booking_cancelled", { booking_id: bookingId, reason });
}

// ── Waitlist Events ──────────────────────────────────────────────────────────

export function trackWaitlistAdd(serviceId?: string) {
  track("waitlist_add", { service_id: serviceId });
}

export function trackWaitlistNotify(waitlistEntryId: string) {
  track("waitlist_notify", { entry_id: waitlistEntryId });
}

// ── Payment Events ───────────────────────────────────────────────────────────

export function trackPaymentLinkSent(bookingId: string) {
  track("payment_link_sent", { booking_id: bookingId });
}

export function trackMarkPaidClicked(bookingId: string, method: string) {
  track("mark_paid_clicked", { booking_id: bookingId, payment_method: method });
}

export function trackYocoTerminalRecorded(amount: number) {
  track("yoco_terminal_recorded", { amount });
}

export function trackInvoiceGenerated(invoiceId: string) {
  track("invoice_generated", { invoice_id: invoiceId });
}

// ── Staff Events ─────────────────────────────────────────────────────────────

export function trackStaffCreated() {
  track("staff_created");
}

export function trackStaffInvited() {
  track("staff_invited");
}

export function trackStaffRoleChanged(staffId: string, newRole: string) {
  track("staff_role_changed", { staff_id: staffId, new_role: newRole });
}

export function trackPermissionChanged(staffId: string, permission: string) {
  track("permission_changed", { staff_id: staffId, permission });
}

// ── Explore Events ───────────────────────────────────────────────────────────

export function trackExplorePostCreated(postId: string) {
  track("explore_post_created", { post_id: postId });
}

export function trackExplorePostPublished(postId: string) {
  track("explore_post_published", { post_id: postId });
}

export function trackExplorePostDeleted(postId: string) {
  track("explore_post_deleted", { post_id: postId });
}

// ── Marketing Events ─────────────────────────────────────────────────────────

export function trackAutomationCreated(automationId: string) {
  track("marketing_automation_created", { automation_id: automationId });
}

export function trackAutomationExecuted(automationId: string) {
  track("marketing_automation_executed", { automation_id: automationId });
}

export function trackCampaignSent(campaignId: string) {
  track("campaign_sent", { campaign_id: campaignId });
}

// ── Settings Events ──────────────────────────────────────────────────────────

export function trackSettingsUpdated(section: string) {
  track("provider_settings_updated", { section });
}

// ── Messaging ────────────────────────────────────────────────────────────────

export function trackMessageThreadOpen(conversationId: string) {
  track("message_thread_open", { conversation_id: conversationId });
}

export function trackMessageSent(conversationId: string) {
  track("message_sent", { conversation_id: conversationId });
}

// ── E-Commerce Events ────────────────────────────────────────────────────────

export function trackProductCreated(productId: string, productName: string, retailEnabled: boolean) {
  track("product_created", { product_id: productId, product_name: productName, retail_sales_enabled: retailEnabled });
}

export function trackProductUpdated(productId: string, changes: string[]) {
  track("product_updated", { product_id: productId, changed_fields: changes });
}

export function trackProductOrderFulfilled(orderId: string, orderNumber: string, status: string) {
  track("product_order_fulfilled", { order_id: orderId, order_number: orderNumber, new_status: status });
}

export function trackWalkInSaleCompleted(orderId: string, total: number, paymentMethod: string, itemCount: number) {
  track("walk_in_sale_completed", {
    order_id: orderId,
    total_amount: total,
    payment_method: paymentMethod,
    item_count: itemCount,
  });
}

export function trackReturnProcessed(returnId: string, action: string, refundAmount?: number) {
  track("product_return_processed", { return_id: returnId, action, refund_amount: refundAmount });
}

export function trackShippingConfigUpdated(deliveryEnabled: boolean, collectionEnabled: boolean) {
  track("shipping_config_updated", { delivery_enabled: deliveryEnabled, collection_enabled: collectionEnabled });
}

// ── Support Tickets ──────────────────────────────────────────────────────────

export function trackSupportTicketsView() {
  track("provider_support_tickets_view");
}

export function trackSupportTicketDetailView(ticketId: string, ticketNumber?: string) {
  track("provider_support_ticket_detail_view", { ticket_id: ticketId, ticket_number: ticketNumber });
}

export function trackSupportTicketCreated(ticketNumber?: string) {
  track("provider_support_ticket_created", { ticket_number: ticketNumber });
}

export function trackSupportTicketReply(ticketId: string) {
  track("provider_support_ticket_reply", { ticket_id: ticketId });
}

// ── Trust & Safety ───────────────────────────────────────────────────────────

export function trackSafetyHubView() {
  track("safety_hub_view", { portal: "provider" });
}

export function trackSafetyHubNav(destination: string, from: "hub" | "settings") {
  track("safety_hub_nav", { destination, from, portal: "provider" });
}

export function trackEmergencyContactSaved() {
  track("emergency_contact_saved", { portal: "provider" });
}

export function trackContentSafetyToggle(key: string, value: boolean) {
  track("content_safety_toggle", { key, value, portal: "provider" });
}

export function trackAdsCampaignFilter(chip: string) {
  track("ads_campaign_filter", { chip, portal: "provider" });
}

export function trackContentReportSubmitted(targetType: string) {
  track("content_report_submitted", { target_type: targetType, portal: "provider" });
}

export function trackUserReportSubmitted(reportType: string) {
  track("user_report_submitted", { report_type: reportType, portal: "provider" });
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function trackScreenView(screenName: string) {
  track("page_view", { screen_name: screenName, platform: Platform.OS, portal: "provider" });
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
    portal: "provider",
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
    portal: "provider",
  });
}

export function trackMarketManualSwitch(input: {
  fromHost: string;
  toHost: string;
  reason: "unsupported" | "restricted" | "manual" | "za_banner";
  countryCode?: string;
}) {
  track("market_manual_switch", {
    from_host: input.fromHost,
    to_host: input.toHost,
    reason: input.reason,
    country_code: input.countryCode,
    portal: "provider",
  });
}

export function trackMarketSwitchDeclined(input: {
  host: string;
  reason: "unsupported" | "restricted" | "za_banner_stay";
  countryCode?: string;
}) {
  track("market_switch_declined", {
    host: input.host,
    reason: input.reason,
    country_code: input.countryCode,
    portal: "provider",
  });
}
