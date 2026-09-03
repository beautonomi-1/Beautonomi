import { Platform } from "react-native";
import {
  EVENT_ADS_CAMPAIGN_CHECKOUT_START,
  EVENT_ADS_CAMPAIGN_FILTER,
  EVENT_APP_OPEN,
  EVENT_BOOKING_CANCELLED,
  EVENT_BOOKING_RESCHEDULED,
  EVENT_CAMPAIGN_SENT,
  EVENT_CONTENT_REPORT_SUBMITTED,
  EVENT_CONTENT_SAFETY_TOGGLE,
  EVENT_DEEP_LINK_OPENED,
  EVENT_EMERGENCY_CONTACT_SAVED,
  EVENT_EXPLORE_POST_CREATED,
  EVENT_EXPLORE_POST_DELETED,
  EVENT_EXPLORE_POST_PUBLISHED,
  EVENT_FRONT_DESK_STATUS_CHANGE,
  EVENT_FRONT_DESK_VIEW,
  EVENT_INVOICE_GENERATED,
  EVENT_LOGIN_SUCCESS,
  EVENT_LOGOUT,
  EVENT_MARK_PAID_CLICKED,
  EVENT_MARKET_AUTO_SWITCH_ATTEMPTED,
  EVENT_MARKET_AUTO_SWITCH_SUPPRESSED,
  EVENT_MARKET_MANUAL_SWITCH,
  EVENT_MARKET_SWITCH_DECLINED,
  EVENT_MARKETING_AUTOMATION_CREATED,
  EVENT_MARKETING_AUTOMATION_EXECUTED,
  EVENT_MESSAGE_SENT,
  EVENT_MESSAGE_THREAD_OPEN,
  EVENT_PAGE_VIEW,
  EVENT_PAYMENT_LINK_SENT,
  EVENT_PERMISSION_CHANGED,
  EVENT_PRODUCT_CREATED,
  EVENT_PRODUCT_ORDER_FULFILLED,
  EVENT_PRODUCT_RETURN_PROCESSED,
  EVENT_PRODUCT_UPDATED,
  EVENT_PROVIDER_ARRIVED,
  EVENT_PROVIDER_BOOKING_COMPLETED,
  EVENT_PROVIDER_CALENDAR_ACTION,
  EVENT_PROVIDER_CALENDAR_VIEW,
  EVENT_PROVIDER_DASHBOARD_VIEW,
  EVENT_PROVIDER_ETA_UPDATED,
  EVENT_PROVIDER_JOURNEY_STARTED,
  EVENT_PROVIDER_ONBOARDING_STEP_COMPLETED,
  EVENT_PROVIDER_SETTINGS_UPDATED,
  EVENT_PROVIDER_SUBSCRIPTION_CHECKOUT_START,
  EVENT_PROVIDER_SUPPORT_TICKET_CREATED,
  EVENT_PROVIDER_SUPPORT_TICKET_DETAIL_VIEW,
  EVENT_PROVIDER_SUPPORT_TICKET_REPLY,
  EVENT_PROVIDER_SUPPORT_TICKETS_VIEW,
  EVENT_PUSH_NOTIFICATION_OPENED,
  EVENT_SAFETY_HUB_NAV,
  EVENT_SAFETY_HUB_VIEW,
  EVENT_SHIPPING_CONFIG_UPDATED,
  EVENT_SIGNUP_COMPLETE,
  EVENT_SIGNUP_START,
  EVENT_STAFF_CREATED,
  EVENT_STAFF_INVITE_ACCEPTED,
  EVENT_STAFF_INVITED,
  EVENT_STAFF_ROLE_CHANGED,
  EVENT_USER_REPORT_SUBMITTED,
  EVENT_WAITLIST_ADD,
  EVENT_WAITLIST_NOTIFY,
  EVENT_WALK_IN_SALE_COMPLETED,
  EVENT_WALKIN_CREATED,
  EVENT_YOCO_TERMINAL_RECORDED,
} from "@beautonomi/analytics";

/**
 * Analytics event tracking utilities for the provider mobile app.
 * Event names come from the shared taxonomy (`@beautonomi/analytics`); properties are ids only —
 * never customer/product names (PII + cardinality; see docs/analytics/EVENT_TAXONOMY.md).
 */

let amplitudeInstance: {
  logEvent: (name: string, props?: Record<string, unknown>) => void;
  identify?: (userId: string, props?: Record<string, unknown>) => void;
} | null = null;

/** Initialize with the Amplitude instance from AnalyticsProvider (null to clear). */
export function setAnalyticsInstance(instance: typeof amplitudeInstance) {
  amplitudeInstance = instance;
}

/** Property denylist mirroring web `plugins/privacy.ts`. */
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

// ── App lifecycle ────────────────────────────────────────────────────────────

export function trackAppOpen(coldStart: boolean, source: "push" | "deep_link" | "direct" = "direct") {
  track(EVENT_APP_OPEN, { portal: "provider", cold_start: coldStart, source });
}

export function trackDeepLinkOpened(url: string, source?: string) {
  let host: string | undefined;
  let pathname: string | undefined;
  try {
    const parsed = new URL(url);
    host = parsed.host || undefined;
    pathname = parsed.pathname || undefined;
  } catch {
    pathname = url.replace(/^[a-z][a-z0-9+.-]*:\/*/i, "").split("?")[0] || undefined;
  }
  track(EVENT_DEEP_LINK_OPENED, { portal: "provider", host, path: pathname, source });
}

export function trackNotificationOpened(type: string, data?: Record<string, unknown>) {
  track(EVENT_PUSH_NOTIFICATION_OPENED, { notification_type: type, portal: "provider", ...data });
}

// ── Auth Events ──────────────────────────────────────────────────────────────

export function trackSignUpStart(method?: "phone" | "email") {
  track(EVENT_SIGNUP_START, { method, portal: "provider" });
}

export function trackSignUp(method: "phone" | "email") {
  track(EVENT_SIGNUP_COMPLETE, { method, role: "provider_owner", portal: "provider" });
}

export function trackLogin(method: "phone" | "email") {
  track(EVENT_LOGIN_SUCCESS, { method, portal: "provider" });
}

export function trackLogout() {
  track(EVENT_LOGOUT, { portal: "provider" });
}

// ── Onboarding / growth ──────────────────────────────────────────────────────

export function trackOnboardingStepCompleted(step: string, stepIndex?: number) {
  track(EVENT_PROVIDER_ONBOARDING_STEP_COMPLETED, { step, step_index: stepIndex, portal: "provider" });
}

/** Subscription checkout started on the client; `provider_subscription_paid` is server-owned. */
export function trackSubscriptionCheckoutStart(planId: string, billingCycle?: string) {
  track(EVENT_PROVIDER_SUBSCRIPTION_CHECKOUT_START, { plan_id: planId, billing_cycle: billingCycle, portal: "provider" });
}

/** Ads budget checkout started on the client; `ads_budget_paid` is server-owned. */
export function trackAdsCampaignCheckoutStart(budget: number, currency?: string, campaignId?: string) {
  track(EVENT_ADS_CAMPAIGN_CHECKOUT_START, { campaign_id: campaignId, budget, currency, portal: "provider" });
}

export function trackStaffInviteAccepted(staffId?: string, providerId?: string) {
  track(EVENT_STAFF_INVITE_ACCEPTED, { staff_id: staffId, provider_id: providerId, portal: "provider" });
}

// ── Dashboard Events ─────────────────────────────────────────────────────────

export function trackDashboardView() {
  track(EVENT_PROVIDER_DASHBOARD_VIEW);
}

export function trackCalendarView() {
  track(EVENT_PROVIDER_CALENDAR_VIEW);
}

export function trackCalendarAction(action: string, bookingId?: string) {
  track(EVENT_PROVIDER_CALENDAR_ACTION, { action, booking_id: bookingId });
}

// ── Booking Events ───────────────────────────────────────────────────────────

export function trackFrontDeskView() {
  track(EVENT_FRONT_DESK_VIEW);
}

export function trackFrontDeskStatusChange(bookingId: string, newStatus: string) {
  track(EVENT_FRONT_DESK_STATUS_CHANGE, { booking_id: bookingId, new_status: newStatus });
}

export function trackWalkInCreated(bookingId: string) {
  track(EVENT_WALKIN_CREATED, { booking_id: bookingId });
}

export function trackBookingCompleted(bookingId: string, revenue: number) {
  track(EVENT_PROVIDER_BOOKING_COMPLETED, { booking_id: bookingId, revenue });
}

export function trackBookingCancelled(bookingId: string, reason?: string) {
  track(EVENT_BOOKING_CANCELLED, { booking_id: bookingId, reason, cancelled_by: "provider" });
}

export function trackBookingRescheduled(bookingId: string, newDate?: string, notifyCustomer?: boolean) {
  track(EVENT_BOOKING_RESCHEDULED, {
    booking_id: bookingId,
    new_date: newDate,
    rescheduled_by: "provider",
    notify_customer: notifyCustomer,
  });
}

// ── At-home journey (B3) ─────────────────────────────────────────────────────

export function trackJourneyStarted(bookingId: string, etaMinutes: number | null) {
  track(EVENT_PROVIDER_JOURNEY_STARTED, { booking_id: bookingId, eta_minutes: etaMinutes, portal: "provider" });
}

export function trackEtaUpdated(bookingId: string, etaMinutes: number, previousEtaMinutes: number | null, runningLate: boolean) {
  track(EVENT_PROVIDER_ETA_UPDATED, {
    booking_id: bookingId,
    eta_minutes: etaMinutes,
    previous_eta_minutes: previousEtaMinutes,
    running_late: runningLate,
    portal: "provider",
  });
}

export function trackArrived(bookingId: string) {
  track(EVENT_PROVIDER_ARRIVED, { booking_id: bookingId, portal: "provider" });
}

// ── Waitlist Events ──────────────────────────────────────────────────────────

export function trackWaitlistAdd(serviceId?: string) {
  track(EVENT_WAITLIST_ADD, { service_id: serviceId });
}

export function trackWaitlistNotify(waitlistEntryId: string) {
  track(EVENT_WAITLIST_NOTIFY, { entry_id: waitlistEntryId });
}

// ── Payment Events ───────────────────────────────────────────────────────────

export function trackPaymentLinkSent(bookingId: string) {
  track(EVENT_PAYMENT_LINK_SENT, { booking_id: bookingId });
}

export function trackMarkPaidClicked(bookingId: string, method: string) {
  track(EVENT_MARK_PAID_CLICKED, { booking_id: bookingId, payment_method: method });
}

export function trackYocoTerminalRecorded(amount: number) {
  track(EVENT_YOCO_TERMINAL_RECORDED, { amount });
}

export function trackInvoiceGenerated(invoiceId: string) {
  track(EVENT_INVOICE_GENERATED, { invoice_id: invoiceId });
}

// ── Staff Events ─────────────────────────────────────────────────────────────

export function trackStaffCreated() {
  track(EVENT_STAFF_CREATED);
}

export function trackStaffInvited() {
  track(EVENT_STAFF_INVITED);
}

export function trackStaffRoleChanged(staffId: string, newRole: string) {
  track(EVENT_STAFF_ROLE_CHANGED, { staff_id: staffId, new_role: newRole });
}

export function trackPermissionChanged(staffId: string, permission: string) {
  track(EVENT_PERMISSION_CHANGED, { staff_id: staffId, permission });
}

// ── Explore Events ───────────────────────────────────────────────────────────

export function trackExplorePostCreated(postId: string) {
  track(EVENT_EXPLORE_POST_CREATED, { post_id: postId });
}

export function trackExplorePostPublished(postId: string) {
  track(EVENT_EXPLORE_POST_PUBLISHED, { post_id: postId });
}

export function trackExplorePostDeleted(postId: string) {
  track(EVENT_EXPLORE_POST_DELETED, { post_id: postId });
}

// ── Marketing Events ─────────────────────────────────────────────────────────

export function trackAutomationCreated(automationId: string) {
  track(EVENT_MARKETING_AUTOMATION_CREATED, { automation_id: automationId });
}

export function trackAutomationExecuted(automationId: string) {
  track(EVENT_MARKETING_AUTOMATION_EXECUTED, { automation_id: automationId });
}

export function trackCampaignSent(campaignId: string) {
  track(EVENT_CAMPAIGN_SENT, { campaign_id: campaignId });
}

// ── Settings Events ──────────────────────────────────────────────────────────

export function trackSettingsUpdated(section: string) {
  track(EVENT_PROVIDER_SETTINGS_UPDATED, { setting_key: section });
}

// ── Messaging ────────────────────────────────────────────────────────────────

export function trackMessageThreadOpen(conversationId: string) {
  track(EVENT_MESSAGE_THREAD_OPEN, { conversation_id: conversationId });
}

export function trackMessageSent(conversationId: string) {
  track(EVENT_MESSAGE_SENT, { conversation_id: conversationId });
}

// ── E-Commerce Events ────────────────────────────────────────────────────────

export function trackProductCreated(productId: string, _productName: string | undefined, retailEnabled: boolean) {
  track(EVENT_PRODUCT_CREATED, { product_id: productId, retail_sales_enabled: retailEnabled });
}

export function trackProductUpdated(productId: string, changes: string[]) {
  track(EVENT_PRODUCT_UPDATED, { product_id: productId, changed_fields: changes });
}

export function trackProductOrderFulfilled(orderId: string, orderNumber: string, status: string) {
  track(EVENT_PRODUCT_ORDER_FULFILLED, { order_id: orderId, order_number: orderNumber, new_status: status });
}

export function trackWalkInSaleCompleted(orderId: string, total: number, paymentMethod: string, itemCount: number) {
  track(EVENT_WALK_IN_SALE_COMPLETED, {
    order_id: orderId,
    total_amount: total,
    payment_method: paymentMethod,
    item_count: itemCount,
  });
}

export function trackReturnProcessed(returnId: string, action: string, refundAmount?: number) {
  track(EVENT_PRODUCT_RETURN_PROCESSED, { return_id: returnId, action, refund_amount: refundAmount });
}

export function trackShippingConfigUpdated(deliveryEnabled: boolean, collectionEnabled: boolean) {
  track(EVENT_SHIPPING_CONFIG_UPDATED, { delivery_enabled: deliveryEnabled, collection_enabled: collectionEnabled });
}

// ── Support Tickets ──────────────────────────────────────────────────────────

export function trackSupportTicketsView() {
  track(EVENT_PROVIDER_SUPPORT_TICKETS_VIEW);
}

export function trackSupportTicketDetailView(ticketId: string, ticketNumber?: string) {
  track(EVENT_PROVIDER_SUPPORT_TICKET_DETAIL_VIEW, { ticket_id: ticketId, ticket_number: ticketNumber });
}

export function trackSupportTicketCreated(ticketNumber?: string) {
  track(EVENT_PROVIDER_SUPPORT_TICKET_CREATED, { ticket_number: ticketNumber });
}

export function trackSupportTicketReply(ticketId: string) {
  track(EVENT_PROVIDER_SUPPORT_TICKET_REPLY, { ticket_id: ticketId });
}

// ── Trust & Safety ───────────────────────────────────────────────────────────

export function trackSafetyHubView() {
  track(EVENT_SAFETY_HUB_VIEW, { portal: "provider" });
}

export function trackSafetyHubNav(destination: string, from: "hub" | "settings") {
  track(EVENT_SAFETY_HUB_NAV, { destination, from, portal: "provider" });
}

export function trackEmergencyContactSaved() {
  track(EVENT_EMERGENCY_CONTACT_SAVED, { portal: "provider" });
}

export function trackContentSafetyToggle(key: string, value: boolean) {
  track(EVENT_CONTENT_SAFETY_TOGGLE, { key, value, portal: "provider" });
}

export function trackAdsCampaignFilter(chip: string) {
  track(EVENT_ADS_CAMPAIGN_FILTER, { chip, portal: "provider" });
}

export function trackContentReportSubmitted(targetType: string) {
  track(EVENT_CONTENT_REPORT_SUBMITTED, { target_type: targetType, portal: "provider" });
}

export function trackUserReportSubmitted(reportType: string) {
  track(EVENT_USER_REPORT_SUBMITTED, { report_type: reportType, portal: "provider" });
}

// ── Navigation ───────────────────────────────────────────────────────────────

export function trackScreenView(screenName: string) {
  track(EVENT_PAGE_VIEW, { screen_name: screenName, platform: Platform.OS, portal: "provider" });
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
  track(EVENT_MARKET_AUTO_SWITCH_SUPPRESSED, {
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
  track(EVENT_MARKET_MANUAL_SWITCH, {
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
  track(EVENT_MARKET_SWITCH_DECLINED, {
    host: input.host,
    reason: input.reason,
    country_code: input.countryCode,
    portal: "provider",
  });
}
