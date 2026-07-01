/**
 * Notification Service
 * 
 * Comprehensive service for triggering all notification templates
 * This service provides functions for every notification scenario in the platform
 */

import { type NotificationChannel } from "./onesignal";
import {
  dispatchTemplateNotification,
  withTenantVariable,
} from "./dispatch-template-notification";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderTeamUserIds } from "@/lib/notifications/notify-provider-team";
import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { formatInTimeZone } from "date-fns-tz";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import {
  computePackageAppliedForDisplay,
  DEFAULT_BOOKING_DISPLAY_TIMEZONE,
} from "@/lib/bookings/display-invariants";

/**
 * §Cross-app audit 2026-04 (multi-staff push): historically every
 * `notifyProvider*` helper fanned push + in-app notifications to
 * `providers.user_id` (the owner) only. On multi-staff teams, a front-
 * desk or co-owner logged in to the provider mobile app would never
 * receive a push for a new online booking, a cancellation, a dispute
 * opened, etc. — they'd only see it on next pull-to-refresh.
 *
 * This helper resolves the FULL set of authenticated team members for a
 * provider (owner + active linked `provider_staff.user_id`) so every
 * booking-lifecycle notification targets the whole team. Owner remains
 * first in the list, and duplicates are de-duped inside
 * `getProviderTeamUserIds`. If the resolver fails or returns empty (e.g.
 * transient DB hiccup, or a provider with no linked staff and a null
 * `user_id`), we fall back to the original owner id so we never silently
 * drop the notification entirely.
 */
async function resolveProviderRecipients(
  providerId: string | null | undefined,
  ownerUserId: string | null | undefined,
): Promise<string[]> {
  if (!providerId) {
    return ownerUserId ? [ownerUserId] : [];
  }
  try {
    const team = await getProviderTeamUserIds(providerId);
    if (team.length > 0) return team;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[notification-service] getProviderTeamUserIds(${providerId}) failed — falling back to owner only`,
      err,
    );
  }
  return ownerUserId ? [ownerUserId] : [];
}

/**
 * B13: IANA timezone used when a booking row doesn't carry its provider's
 * zone yet (older rows, or callers that haven't joined `providers.timezone`).
 *
 * §Timezone-parity audit 2026-06: this previously defaulted to "UTC", which
 * diverged from EVERY other booking-time surface. The receipt/invoice and
 * booking-detail paths fall back to {@link DEFAULT_BOOKING_DISPLAY_TIMEZONE}
 * ("Africa/Johannesburg") via `resolveTz` (`@/lib/dates/provider-tz`) and
 * `safeTimezone` (`@/lib/bookings/display-datetime`). For a provider whose
 * `timezone` column is NULL/blank, a 05:00 (UTC+2) appointment rendered as
 * 05:00 on the receipt but 03:00 in the push/SMS/email/in-app notification —
 * the exact UTC-offset gap the customer reported. We now share the SAME
 * platform-default fallback so notifications match the receipt/invoice in
 * every zone. The stored UTC `scheduled_at` is never mutated — only display.
 */
const FALLBACK_NOTIFICATION_TIMEZONE = DEFAULT_BOOKING_DISPLAY_TIMEZONE;

/**
 * §Launch-audit 2026-04-18: legacy provider rows can carry offset-style
 * timezone strings (e.g. "GMT+2"), which throw inside `formatInTimeZone`
 * because `date-fns-tz` ultimately calls `Intl.DateTimeFormat`. We
 * canonicalise them to IANA / `Etc/GMT±N` first; if we can't parse the
 * input we fall back to UTC (matching the historical fallback for a
 * missing zone) so notification templates still render — just without
 * the provider-local perspective. Bad data is fixed by supabase
 * migration 511; this keeps the emitter resilient while ops cleans up.
 */
function resolveTimezone(
  tz: string | null | undefined,
): string {
  const normalised = normalizeProviderTimezone(tz);
  if (normalised) return normalised;
  const trimmed = typeof tz === "string" ? tz.trim() : "";
  return trimmed || FALLBACK_NOTIFICATION_TIMEZONE;
}

/** B13: `toLocaleDateString()` equivalent pinned to the provider timezone. */
export function formatBookingDate(
  iso: string | Date | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return formatInTimeZone(d, resolveTimezone(timezone), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

/** B13: `toLocaleTimeString()` equivalent pinned to the provider timezone. */
export function formatBookingTime(
  iso: string | Date | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return formatInTimeZone(d, resolveTimezone(timezone), "HH:mm");
  } catch {
    return "";
  }
}

/** B13: `toLocaleString()` (date + time) pinned to the provider timezone. */
export function formatBookingDateTime(
  iso: string | Date | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return "";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return formatInTimeZone(
      d,
      resolveTimezone(timezone),
      "yyyy-MM-dd HH:mm",
    );
  } catch {
    return "";
  }
}

function providerTimezoneOf(
  booking:
    | { provider?: { timezone?: string | null } | null; timezone?: string | null }
    | null
    | undefined,
): string | null | undefined {
  return booking?.provider?.timezone ?? booking?.timezone ?? null;
}

/** ISO currency from a booking row; defaults to platform last-resort. */
function bookingCurrency(booking: { currency?: string | null } | null | undefined): string {
  const c = booking?.currency;
  return typeof c === "string" && c.trim() ? c.trim().toUpperCase() : LAST_RESORT_CURRENCY;
}

/** Format amounts for OneSignal / email template variables (locale-aware). */
function fmt(amount: number | string | null | undefined, currency?: string | null): string {
  const n = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
  const code = (currency && currency.trim()) || LAST_RESORT_CURRENCY;
  return formatCurrency(Number.isFinite(n) ? n : 0, code);
}

/**
 * Helper to get user IDs from booking data
 */
async function _getBookingUserIds(bookingId: string): Promise<{ customerId: string; providerId: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, provider_id")
    .eq("id", bookingId)
    .single();
  
  return {
    customerId: booking?.customer_id || "",
    providerId: booking?.provider_id || null,
  };
}

/**
 * Helper to get booking details
 */
async function getBookingDetails(bookingId: string): Promise<any> {
  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from("bookings")
    .select(`
      *,
      customer:users!bookings_customer_id_fkey(id, full_name, email, phone),
      provider:providers!bookings_provider_id_fkey(id, business_name, user_id, timezone),
      package:service_packages!package_id(id, name),
      booking_services(
        *,
        offerings!inner(
          title,
          price,
          duration_minutes
        )
      )
    `)
    .eq("id", bookingId)
    .single();
  
  type BookingServiceRow = { offerings?: { title?: string; price?: number; duration_minutes?: number } };
  if (booking) {
    if (booking.booking_services && Array.isArray(booking.booking_services)) {
      booking.services = (booking.booking_services as BookingServiceRow[]).map((bs) => ({
        ...bs,
        service: {
          name: bs.offerings?.title ?? "Service",
          price: bs.offerings?.price ?? 0,
          duration: bs.offerings?.duration_minutes ?? 60,
        },
      }));
    } else {
      // Fallback if booking_services is not loaded or empty
      booking.services = [];
    }
  }
  
  return booking;
}

/** Services line for email/push templates; prefixes package only when a package actually applied. */
function formatBookingServicesLineForTemplates(booking: {
  services?: { service?: { name?: string } }[];
  package?: { name?: string } | null;
  package_id?: string | null;
  customer_package_entitlement_id?: string | null;
  discount_amount?: number | null;
  promotion_discount_amount?: number | null;
}): string {
  const servicesList =
    booking.services?.map((s) => s.service?.name).join(", ") ?? "Services";
  const pkgName = booking.package?.name?.trim();
  const pkgApplied = computePackageAppliedForDisplay({
    package_id: booking.package_id ?? null,
    customer_package_entitlement_id: booking.customer_package_entitlement_id ?? null,
    discount_amount: booking.discount_amount ?? null,
    promotion_discount_amount: booking.promotion_discount_amount ?? null,
  });
  return pkgApplied && pkgName ? `Package: ${pkgName} — ${servicesList}` : servicesList;
}

/**
 * Helper to replace variables in URL
 */
function replaceUrlVariables(url: string, variables: Record<string, string>): string {
  let result = url;
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replace(`{{${key}}}`, value);
  });
  return result;
}

/** Rich HTML block for email templates (empty string when nothing to show). */
function buildCustomerPricingBreakdownHtml(booking: Record<string, unknown>, currency: string): string {
  const rows: string[] = [];
  const pf = Number(booking.platform_fee_amount ?? booking.service_fee_amount ?? 0);
  const sub = Number(booking.subtotal ?? 0);
  const tax = Number(booking.tax_amount ?? 0);
  const tip = Number(booking.tip_amount ?? 0);
  const travel = Number(booking.travel_fee ?? 0);
  const mem = Number(booking.membership_discount_amount ?? 0);
  const loy = Number(booking.loyalty_discount_amount ?? 0);
  const promo = Number(booking.promotion_discount_amount ?? 0);
  const disc = Number(booking.discount_amount ?? 0);
  const pkgApplied = computePackageAppliedForDisplay({
    package_id: (booking.package_id as string | null | undefined) ?? null,
    customer_package_entitlement_id:
      (booking.customer_package_entitlement_id as string | null | undefined) ?? null,
    discount_amount: disc,
    promotion_discount_amount: promo,
  });
  const pkgDisc = pkgApplied ? Math.max(0, disc - promo) : 0;

  if (sub > 0) rows.push(`Subtotal: ${fmt(sub, currency)}`);
  if (travel > 0) rows.push(`Travel: ${fmt(travel, currency)}`);
  if (promo > 0) rows.push(`Promotion: −${fmt(promo, currency)}`);
  if (pkgDisc > 0) rows.push(`Package: −${fmt(pkgDisc, currency)}`);
  if (mem > 0) rows.push(`Membership: −${fmt(mem, currency)}`);
  if (loy > 0) rows.push(`Loyalty: −${fmt(loy, currency)}`);
  if (tax > 0) rows.push(`Tax: ${fmt(tax, currency)}`);
  if (pf > 0) rows.push(`Platform fee: ${fmt(pf, currency)}`);
  if (tip > 0) rows.push(`Tip: ${fmt(tip, currency)}`);

  if (rows.length === 0) return "";
  const inner = rows.map((r) => `<div style="margin:4px 0;">${r}</div>`).join("");
  return `<div style="margin:16px 0 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;"><p style="margin:0 0 8px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Price breakdown</p>${inner}</div>`;
}

// ============================================================================
// BOOKING NOTIFICATIONS
// ============================================================================

/**
 * Send booking confirmed notification
 */
export async function notifyBookingConfirmed(
  bookingId: string,
  channels?: NotificationChannel[],
  options?: { skipInApp?: boolean },
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  // Customer-facing pricing lines, exposed as template variables so admin
  // email/SMS templates can include "Platform fee: {{platform_fee}}" or
  // "{{membership_label}}: −{{membership_discount}}". Empty when zero so
  // templates with conditional placeholders render cleanly.
  const currency = bookingCurrency(booking);
  const platformFeeAmt = Number(
    booking.platform_fee_amount ?? booking.service_fee_amount ?? 0,
  );
  const membershipDiscountAmt = Number(booking.membership_discount_amount ?? 0);
  const subtotalAmt = Number(booking.subtotal ?? 0);
  const taxAmt = Number(booking.tax_amount ?? 0);
  const tipAmt = Number(booking.tip_amount ?? 0);
  const travelFeeAmt = Number(booking.travel_fee ?? 0);
  const loyaltyAmt = Number(booking.loyalty_discount_amount ?? 0);
  const promoAmt = Number(booking.promotion_discount_amount ?? 0);
  const discountAmt = Number(booking.discount_amount ?? 0);
  const pkgApplied = computePackageAppliedForDisplay({
    package_id: booking.package_id ?? null,
    customer_package_entitlement_id: booking.customer_package_entitlement_id ?? null,
    discount_amount: discountAmt,
    promotion_discount_amount: promoAmt,
  });
  const pkgDisc = pkgApplied ? Math.max(0, discountAmt - promoAmt) : 0;
  const pkgDisplayName =
    pkgApplied && booking.package?.name ? String(booking.package.name).trim() : "";

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: formatBookingServicesLineForTemplates(booking),
    total_amount: fmt(booking.total_amount || 0, currency),
    subtotal: subtotalAmt > 0 ? fmt(subtotalAmt, currency) : "",
    tax_amount: taxAmt > 0 ? fmt(taxAmt, currency) : "",
    travel_fee: travelFeeAmt > 0 ? fmt(travelFeeAmt, currency) : "",
    platform_fee: platformFeeAmt > 0 ? fmt(platformFeeAmt, currency) : "",
    /** Legacy alias mirroring DB columns; same value as platform_fee. */
    service_fee: platformFeeAmt > 0 ? fmt(platformFeeAmt, currency) : "",
    membership_discount: membershipDiscountAmt > 0 ? fmt(membershipDiscountAmt, currency) : "",
    membership_label: membershipDiscountAmt > 0 ? "Membership" : "",
    loyalty_discount: loyaltyAmt > 0 ? fmt(loyaltyAmt, currency) : "",
    promotion_discount: promoAmt > 0 ? fmt(promoAmt, currency) : "",
    package_discount: pkgDisc > 0 ? fmt(pkgDisc, currency) : "",
    package_name: pkgDisplayName,
    tip_amount: tipAmt > 0 ? fmt(tipAmt, currency) : "",
    pricing_breakdown_html: buildCustomerPricingBreakdownHtml(booking as Record<string, unknown>, currency),
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
    group_booking_id: booking.group_booking_id ?? "",
    is_group_booking: booking.group_booking_id ? "true" : "",
  };

  const _url = replaceUrlVariables("/bookings/{{booking_id}}", variables);

  return await dispatchTemplateNotification(
    "booking_confirmed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer", skipInApp: options?.skipInApp }
  );
}

/**
 * Send booking reminder (generic function that routes to appropriate reminder based on hours)
 */
export async function notifyBookingReminder(
  bookingId: string,
  hoursUntilAppointment: number,
  channels?: NotificationChannel[]
) {
  // Route to appropriate reminder function based on hours
  if (hoursUntilAppointment <= 2) {
    return await notifyBookingReminder2h(bookingId, channels);
  } else {
    return await notifyBookingReminder24h(bookingId, channels);
  }
}

/**
 * Send booking reminder (24 hours before)
 */
export async function notifyBookingReminder24h(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    location: booking.location_type === "at_home" 
      ? booking.service_address || "Your location"
      : booking.provider?.business_name || "Salon",
    booking_id: bookingId,
  };

  const _url = replaceUrlVariables("/bookings/{{booking_id}}", variables);

  return await dispatchTemplateNotification(
    "booking_reminder_24h",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send booking reminder (2 hours before)
 */
export async function notifyBookingReminder2h(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    location: booking.location_type === "at_home" 
      ? booking.service_address || "Your location"
      : booking.provider?.business_name || "Salon",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "booking_reminder_2h",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send booking cancelled notification
 */
export async function notifyBookingCancelled(
  bookingId: string,
  cancelledBy: "customer" | "provider" | "system",
  refundInfo: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_number: booking.booking_number || bookingId,
    refund_info: refundInfo,
    booking_id: bookingId,
  };

  const templateKey = cancelledBy === "customer" 
    ? "booking_cancelled_by_customer"
    : cancelledBy === "provider"
    ? "booking_cancelled_by_provider"
    : "booking_cancelled";

  const customerResult = await dispatchTemplateNotification(templateKey, [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, {
    appType: "customer",
  });

  // Notify provider team (owner + active staff) unless the provider initiated
  // the cancellation themselves. Covers customer cancels and admin/system
  // cancels — the provider must learn their slot was freed.
  if (cancelledBy !== "provider" && booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_booking_cancelled",
      recipients,
      withTenantVariable(booking.tenant_id, {
        customer_name: booking.customer?.full_name || "Customer",
        booking_date: variables.booking_date,
        booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
        services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
        booking_id: bookingId,
      }),
      channels,
      { appType: "provider" }
    );
  }

  return customerResult;
}

/**
 * Send booking rescheduled notification
 */
export async function notifyBookingRescheduled(
  bookingId: string,
  oldDate: Date,
  newDate: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const tz = providerTimezoneOf(booking);
  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    new_date: formatBookingDate(newDate, tz),
    new_time: formatBookingTime(newDate, tz),
    old_date: formatBookingDate(oldDate, tz),
    old_time: formatBookingTime(oldDate, tz),
    booking_id: bookingId,
  };

  // Notify customer — return value used by resend flows to know if anything was actually dispatched.
  const customerResult = await dispatchTemplateNotification(
    "booking_rescheduled",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" },
  );

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_booking_rescheduled",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return customerResult;
}

// ============================================================================
// AT-HOME SERVICE NOTIFICATIONS
// ============================================================================

/**
 * Notify customer that provider is en route (at-home service)
 */
export async function notifyProviderEnRoute(bookingId: string, estimatedArrival: Date, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    estimated_arrival_time: formatBookingTime(estimatedArrival, providerTimezoneOf(booking)),
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_en_route_home",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer that provider is arriving soon (at-home service)
 */
export async function notifyProviderArrivingSoon(bookingId: string, minutes: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    minutes: minutes.toString(),
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_arriving_soon_home",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer that provider has arrived (at-home service)
 */
export async function notifyProviderArrived(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "Your location",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_arrived_home",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send home service location details
 */
export async function notifyHomeServiceLocationDetails(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    special_instructions: booking.special_instructions || "None",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "home_service_location_details",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Request service location from customer (at-home service)
 */
export async function notifyServiceLocationRequired(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "home_service_location_required",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer that service location changed (at-home service)
 */
export async function notifyServiceLocationChanged(
  bookingId: string,
  oldAddress: string,
  newAddress: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    new_address: newAddress,
    old_address: oldAddress,
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "home_service_location_changed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer that provider needs directions (at-home service)
 */
export async function notifyProviderNeedsDirections(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_address: booking.service_address || "",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_needs_directions",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Share provider live location (at-home service)
 */
export async function notifyProviderLocationShared(bookingId: string, trackingUrl: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    tracking_url: trackingUrl,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_location_shared",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// AT-SALON SERVICE NOTIFICATIONS
// ============================================================================

/**
 * Send salon directions to customer
 */
export async function notifySalonDirections(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const hasCoords = location?.latitude != null && location?.longitude != null;
  const directionsUrl = hasCoords
    ? `https://www.mapbox.com/directions/?destination=${Number(location!.longitude)},${Number(location!.latitude)}`
    : `https://www.mapbox.com/directions/?query=${encodeURIComponent(location?.address || "")}`;

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    salon_address: location?.address || "",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    parking_info: location?.parking_info || "Available",
    directions_url: directionsUrl,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "salon_directions",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send salon arrival reminder
 */
export async function notifySalonArrivalReminder(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    provider_name: booking.provider?.business_name || "Provider",
    salon_address: location?.address || "",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "salon_arrival_reminder",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer has arrived at salon
 */
export async function notifyCustomerArrivedSalon(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "customer_arrived_salon",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer about waiting area
 */
export async function notifyWaitingArea(bookingId: string, waitingArea: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_salon") {
    return { success: false, error: "Booking not found or not at-salon service" };
  }

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from("provider_locations")
    .select("*")
    .eq("id", booking.location_id)
    .single();

  const variables = {
    salon_name: location?.name || booking.provider?.business_name || "Salon",
    waiting_area: waitingArea,
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "salon_waiting_area",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// SERVICE STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify service started
 */
export async function notifyServiceStarted(bookingId: string, serviceDuration: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    service_duration: serviceDuration,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_started",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service in progress
 */
export async function notifyServiceInProgress(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_in_progress",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service almost done
 */
export async function notifyServiceAlmostDone(bookingId: string, remainingTime: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    remaining_time: remainingTime,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_almost_done",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service extended
 */
export async function notifyServiceExtended(
  bookingId: string,
  extensionTime: string,
  newEndTime: Date,
  additionalCharge: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    extension_time: extensionTime,
    new_end_time: formatBookingTime(newEndTime, providerTimezoneOf(booking)),
    additional_charge: fmt(additionalCharge, bookingCurrency(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_extended",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service completed
 */
export async function notifyServiceCompleted(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_completed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// PROVIDER STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify customer that provider is running late
 */
export async function notifyProviderRunningLate(
  bookingId: string,
  delayMinutes: number,
  newArrivalTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    delay_minutes: delayMinutes.toString(),
    new_arrival_time: formatBookingTime(newArrivalTime, providerTimezoneOf(booking)),
    original_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_running_late",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer that provider arrived early
 */
export async function notifyProviderArrivedEarly(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "provider_arrived_early",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// CUSTOMER STATUS NOTIFICATIONS
// ============================================================================

/**
 * Notify customer they are running late
 */
export async function notifyCustomerRunningLate(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const locationName = booking.location_type === "at_home"
    ? booking.service_address || "Your location"
    : booking.provider?.business_name || "Salon";

  const variables = {
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    provider_name: booking.provider?.business_name || "Provider",
    location_name: locationName,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "customer_running_late",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify customer about no-show
 */
export async function notifyCustomerNoShow(bookingId: string, noShowFee: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    no_show_fee: fmt(noShowFee, bookingCurrency(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "customer_no_show",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// PAYMENT NOTIFICATIONS
// ============================================================================

/**
 * Notify payment successful
 */
export async function notifyPaymentSuccessful(
  bookingId: string,
  amount: number,
  paymentMethod: string,
  transactionId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: fmt(amount, bookingCurrency(booking)),
    booking_number: booking.booking_number || bookingId,
    payment_method: paymentMethod,
    transaction_id: transactionId,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "payment_successful",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify payment failed
 */
export async function notifyPaymentFailed(
  bookingId: string,
  amount: number,
  failureReason: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: fmt(amount, bookingCurrency(booking)),
    booking_number: booking.booking_number || bookingId,
    failure_reason: failureReason,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "payment_failed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify payment pending
 */
export async function notifyPaymentPending(
  bookingId: string,
  amount: number,
  paymentMethod: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const payment_link = `${appBase}/bookings/${bookingId}/pay`;

  const variables = {
    amount: fmt(amount, bookingCurrency(booking)),
    booking_number: booking.booking_number || bookingId,
    payment_method: paymentMethod,
    booking_id: bookingId,
    payment_link,
  };

  return await dispatchTemplateNotification(
    "payment_pending",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify payment method expired
 */
export async function notifyPaymentMethodExpired(bookingId: string, amount: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    amount: fmt(amount, bookingCurrency(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "payment_method_expired",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify partial payment received
 */
export async function notifyPartialPayment(
  bookingId: string,
  partialAmount: number,
  remainingBalance: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    partial_amount: fmt(partialAmount, bookingCurrency(booking)),
    remaining_balance: fmt(remainingBalance, bookingCurrency(booking)),
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "partial_payment_received",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify refund processed
 */
export async function notifyRefundProcessed(
  bookingId: string,
  amount: number,
  refundReason: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    amount: fmt(amount, bookingCurrency(booking)),
    booking_number: booking.booking_number || bookingId,
    refund_reason: refundReason,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "refund_processed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify invoice generated
 */
export async function notifyInvoiceGenerated(
  bookingId: string,
  totalAmount: number,
  invoiceNumber: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    total_amount: fmt(totalAmount, bookingCurrency(booking)),
    invoice_number: invoiceNumber,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "invoice_generated",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify receipt sent
 */
export async function notifyReceiptSent(
  bookingId: string,
  totalAmount: number,
  paymentDate: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const currency = bookingCurrency(booking);
  const platformFeeAmt = Number(
    booking.platform_fee_amount ?? booking.service_fee_amount ?? 0,
  );
  const membershipDiscountAmt = Number(booking.membership_discount_amount ?? 0);
  const subtotalAmt = Number(booking.subtotal ?? 0);
  const taxAmt = Number(booking.tax_amount ?? 0);
  const tipAmt = Number(booking.tip_amount ?? 0);
  const travelFeeAmt = Number(booking.travel_fee ?? 0);
  const loyaltyAmt = Number(booking.loyalty_discount_amount ?? 0);
  const promoAmt = Number(booking.promotion_discount_amount ?? 0);
  const discountAmt = Number(booking.discount_amount ?? 0);
  const pkgApplied = computePackageAppliedForDisplay({
    package_id: booking.package_id ?? null,
    customer_package_entitlement_id: booking.customer_package_entitlement_id ?? null,
    discount_amount: discountAmt,
    promotion_discount_amount: promoAmt,
  });
  const pkgDisc = pkgApplied ? Math.max(0, discountAmt - promoAmt) : 0;
  const pkgDisplayName =
    pkgApplied && booking.package?.name ? String(booking.package.name).trim() : "";

  const variables = {
    booking_number: booking.booking_number || bookingId,
    total_amount: fmt(totalAmount, currency),
    payment_date: paymentDate.toLocaleDateString(),
    booking_id: bookingId,
    subtotal: subtotalAmt > 0 ? fmt(subtotalAmt, currency) : "",
    tax_amount: taxAmt > 0 ? fmt(taxAmt, currency) : "",
    travel_fee: travelFeeAmt > 0 ? fmt(travelFeeAmt, currency) : "",
    platform_fee: platformFeeAmt > 0 ? fmt(platformFeeAmt, currency) : "",
    service_fee: platformFeeAmt > 0 ? fmt(platformFeeAmt, currency) : "",
    membership_discount: membershipDiscountAmt > 0 ? fmt(membershipDiscountAmt, currency) : "",
    membership_label: membershipDiscountAmt > 0 ? "Membership" : "",
    loyalty_discount: loyaltyAmt > 0 ? fmt(loyaltyAmt, currency) : "",
    promotion_discount: promoAmt > 0 ? fmt(promoAmt, currency) : "",
    package_discount: pkgDisc > 0 ? fmt(pkgDisc, currency) : "",
    package_name: pkgDisplayName,
    tip_amount: tipAmt > 0 ? fmt(tipAmt, currency) : "",
    pricing_breakdown_html: buildCustomerPricingBreakdownHtml(booking as Record<string, unknown>, currency),
  };

  return await dispatchTemplateNotification(
    "receipt_sent",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// PROVIDER BUSINESS NOTIFICATIONS
// ============================================================================

/**
 * Notify provider of new booking request
 */
export async function notifyProviderNewBooking(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: formatBookingServicesLineForTemplates(booking),
    total_amount: fmt(booking.total_amount || 0, bookingCurrency(booking)),
    booking_id: bookingId,
    group_booking_id: booking.group_booking_id ?? "",
  };

  // §Cross-app audit 2026-04 (multi-staff push): fan out to the whole
  // provider team (owner + active linked `provider_staff.user_id`) so a
  // co-owner, manager, or front-desk logged into the provider app
  // doesn't miss the push on non-owner logins.
  const recipients = await resolveProviderRecipients(
    booking.provider_id,
    booking.provider.user_id,
  );

  return await dispatchTemplateNotification(
    "provider_booking_request",
    recipients,
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider of new customer (first booking)
 */
export async function notifyProviderNewCustomer(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  // Check if this is customer's first booking with this provider
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", booking.customer_id)
    .eq("provider_id", booking.provider_id)
    .neq("status", "cancelled");

  if (count && count > 1) {
    // Not a new customer, skip
    return { success: true, skipped: true };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: formatBookingServicesLineForTemplates(booking),
    booking_id: bookingId,
  };

  const recipients = await resolveProviderRecipients(
    booking.provider_id,
    booking.provider.user_id,
  );

  return await dispatchTemplateNotification(
    "provider_new_customer",
    recipients,
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider of returning customer
 */
export async function notifyProviderReturningCustomer(bookingId: string, visitNumber: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    visit_number: visitNumber.toString(),
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: formatBookingServicesLineForTemplates(booking),
    booking_id: bookingId,
  };

  const recipients = await resolveProviderRecipients(
    booking.provider_id,
    booking.provider.user_id,
  );

  return await dispatchTemplateNotification(
    "provider_recurring_customer",
    recipients,
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider of preferred customer booking
 */
export async function notifyProviderPreferredCustomer(bookingId: string, totalBookings: number, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: formatBookingServicesLineForTemplates(booking),
    total_bookings: totalBookings.toString(),
    booking_id: bookingId,
  };

  const recipients = await resolveProviderRecipients(
    booking.provider_id,
    booking.provider.user_id,
  );

  return await dispatchTemplateNotification(
    "provider_preferred_customer",
    recipients,
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider payout processed
 */
export async function notifyProviderPayoutProcessed(
  providerId: string,
  amount: number,
  payoutDate: Date,
  transactionId: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, currency, tenant_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const pc = (provider as { currency?: string | null }).currency;
  const variables = {
    amount: fmt(amount, pc),
    payout_date: payoutDate.toLocaleDateString(),
    transaction_id: transactionId,
  };

  const recipients = await resolveProviderRecipients(providerId, provider.user_id);
  return await dispatchTemplateNotification(
    "provider_payout_processed",
    recipients,
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider payout scheduled
 */
export async function notifyProviderPayoutScheduled(
  providerId: string,
  payoutAmount: number,
  payoutDate: Date,
  paymentMethod: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, currency, tenant_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const pc = (provider as { currency?: string | null }).currency;
  const variables = {
    payout_amount: fmt(payoutAmount, pc),
    payout_date: payoutDate.toLocaleDateString(),
    payment_method: paymentMethod,
  };

  const recipients = await resolveProviderRecipients(providerId, provider.user_id);
  return await dispatchTemplateNotification(
    "provider_payout_scheduled",
    recipients,
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider payout failed
 */
export async function notifyProviderPayoutFailed(
  providerId: string,
  payoutAmount: number,
  failureReason: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, currency, tenant_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const pc = (provider as { currency?: string | null }).currency;
  const variables = {
    payout_amount: fmt(payoutAmount, pc),
    failure_reason: failureReason,
  };

  const recipients = await resolveProviderRecipients(providerId, provider.user_id);
  return await dispatchTemplateNotification(
    "provider_payout_failed",
    recipients,
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider weekly earnings summary
 */
export async function notifyProviderWeeklyEarnings(
  providerId: string,
  totalEarnings: number,
  completedBookings: number,
  pendingPayout: number,
  payoutDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, currency, tenant_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const pc = (provider as { currency?: string | null }).currency;
  const variables = {
    total_earnings: fmt(totalEarnings, pc),
    completed_bookings: completedBookings.toString(),
    pending_payout: fmt(pendingPayout, pc),
    payout_date: payoutDate.toLocaleDateString(),
  };

  return await dispatchTemplateNotification(
    "provider_earnings_summary",
    [provider.user_id],
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider availability changed
 */
export async function notifyProviderAvailabilityChanged(
  providerId: string,
  availabilityChanges: string,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const variables = {
    availability_changes: availabilityChanges,
  };

  return await dispatchTemplateNotification(
    "provider_availability_changed",
    [provider.user_id],
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider holiday mode activated
 */
export async function notifyProviderHolidayMode(
  providerId: string,
  startDate: Date,
  returnDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, timezone")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const tz = (provider as { timezone?: string | null }).timezone ?? null;
  const variables = {
    start_date: formatBookingDate(startDate, tz),
    return_date: formatBookingDate(returnDate, tz),
  };

  return await dispatchTemplateNotification(
    "provider_holiday_mode",
    [provider.user_id],
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider holiday mode ending soon
 */
export async function notifyProviderHolidayModeEnding(
  providerId: string,
  returnDate: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, timezone")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const tz = (provider as { timezone?: string | null }).timezone ?? null;
  const variables = {
    return_date: formatBookingDate(returnDate, tz),
  };

  return await dispatchTemplateNotification(
    "provider_holiday_mode_ending",
    [provider.user_id],
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider break scheduled
 */
export async function notifyProviderBreakScheduled(
  providerId: string,
  breakStart: Date,
  breakEnd: Date,
  channels?: NotificationChannel[]
) {
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id, timezone")
    .eq("id", providerId)
    .single();

  if (!provider?.user_id) {
    return { success: false, error: "Provider not found" };
  }

  const tz = (provider as { timezone?: string | null }).timezone ?? null;
  const variables = {
    break_start: formatBookingDateTime(breakStart, tz),
    break_end: formatBookingDateTime(breakEnd, tz),
  };

  return await dispatchTemplateNotification(
    "provider_break_scheduled",
    [provider.user_id],
    withTenantVariable((provider as { tenant_id?: string | null }).tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

// ============================================================================
// REVIEW NOTIFICATIONS
// ============================================================================

/**
 * Send review reminder
 */
export async function notifyReviewReminder(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "review_reminder",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify provider of new review
 */
export async function notifyProviderNewReview(
  reviewId: string,
  customerName: string,
  rating: number,
  reviewText: string,
  providerUserId: string,
  channels?: NotificationChannel[],
  options?: { bookingId?: string }
) {
  const bookingId = options?.bookingId;
  const variables = {
    customer_name: customerName,
    rating: rating.toString(),
    review_text: reviewText,
    review_id: reviewId,
    ...(bookingId ? { booking_id: bookingId } : {}),
  };

  return await dispatchTemplateNotification(
    "provider_new_review",
    [providerUserId],
    variables,
    channels,
    { appType: "provider" }
  );
}

/**
 * Send booking follow-up for feedback
 */
export async function notifyBookingFollowUp(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "booking_follow_up",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send thank you message after service
 */
export async function notifyThankYouAfterService(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
  };

  return await dispatchTemplateNotification(
    "thank_you_after_service",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// ADD-ONS & EXTRAS
// ============================================================================

/**
 * Notify add-on service added
 */
export async function notifyAddonAdded(
  bookingId: string,
  addonName: string,
  addonPrice: number,
  newTotal: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    addon_name: addonName,
    addon_price: fmt(addonPrice, bookingCurrency(booking)),
    new_total: fmt(newTotal, bookingCurrency(booking)),
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "addon_added",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify add-on service removed
 */
export async function notifyAddonRemoved(
  bookingId: string,
  addonName: string,
  refundAmount: number,
  newTotal: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    addon_name: addonName,
    refund_amount: fmt(refundAmount, bookingCurrency(booking)),
    new_total: fmt(newTotal, bookingCurrency(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "addon_removed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service upgrade offered
 */
export async function notifyServiceUpgradeOffered(
  bookingId: string,
  upgradeName: string,
  upgradePrice: number,
  upgradeBenefits: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    upgrade_name: upgradeName,
    upgrade_price: fmt(upgradePrice, bookingCurrency(booking)),
    upgrade_benefits: upgradeBenefits,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "service_upgrade_offered",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// TRAVEL FEES
// ============================================================================

/**
 * Notify travel fee applied
 */
export async function notifyTravelFeeApplied(
  bookingId: string,
  travelFee: number,
  distance: number,
  totalAmount: number,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    travel_fee: fmt(travelFee, bookingCurrency(booking)),
    distance: distance.toString(),
    total_amount: fmt(totalAmount, bookingCurrency(booking)),
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "travel_fee_applied",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// TIME & DATE CHANGES
// ============================================================================

/**
 * Notify booking time changed
 */
export async function notifyBookingTimeChanged(
  bookingId: string,
  oldTime: Date,
  newTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    old_time: formatBookingTime(oldTime, providerTimezoneOf(booking)),
    new_time: formatBookingTime(newTime, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  // Notify customer
  await dispatchTemplateNotification("booking_time_changed", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_booking_time_changed",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

/**
 * Notify booking date changed
 */
export async function notifyBookingDateChanged(
  bookingId: string,
  oldDate: Date,
  newDate: Date,
  bookingTime: Date,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    old_date: formatBookingDate(oldDate, providerTimezoneOf(booking)),
    new_date: formatBookingDate(newDate, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(bookingTime, providerTimezoneOf(booking)),
    booking_id: bookingId,
  };

  // Notify customer
  await dispatchTemplateNotification("booking_date_changed", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_booking_date_changed",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

// ============================================================================
// ACCOUNT & SECURITY
// ============================================================================

/**
 * Send password reset notification
 */
export async function notifyPasswordReset(userId: string, resetToken: string, channels: NotificationChannel[] = ["email"]) {
  const variables = {
    reset_token: resetToken,
  };

  return await dispatchTemplateNotification(
    "password_reset",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Send email verification notification
 */
export async function notifyEmailVerification(userId: string, verificationToken: string, channels: NotificationChannel[] = ["email"]) {
  const variables = {
    verification_token: verificationToken,
  };

  return await dispatchTemplateNotification(
    "email_verification",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify account suspended
 */
export async function notifyAccountSuspended(userId: string, suspensionReason: string, channels?: NotificationChannel[]) {
  const variables = {
    suspension_reason: suspensionReason,
  };

  return await dispatchTemplateNotification(
    "account_suspended",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// WELCOME & PROMOTIONAL
// ============================================================================

/**
 * Send welcome message to new user
 */
export async function notifyWelcomeMessage(userId: string, channels?: NotificationChannel[]) {
  return await dispatchTemplateNotification(
    "welcome_message",
    [userId],
    {},
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify promotion available
 */
export async function notifyPromotionAvailable(
  userIds: string[],
  promotionTitle: string,
  promotionDescription: string,
  promoCode: string,
  discountAmount: number,
  expiryDate: Date,
  promotionId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    promotion_title: promotionTitle,
    promotion_description: promotionDescription,
    promo_code: promoCode,
    discount_amount: fmt(discountAmount),
    expiry_date: expiryDate.toLocaleDateString(),
    promotion_id: promotionId,
  };

  return await dispatchTemplateNotification(
    "promotion_available",
    userIds,
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// LOYALTY & REWARDS
// ============================================================================

/**
 * Notify loyalty points earned
 */
export async function notifyLoyaltyPointsEarned(
  userId: string,
  points: number,
  totalPoints: number,
  providerName: string,
  bookingDate: Date,
  channels?: NotificationChannel[],
  // B13: optional provider IANA timezone so the earned-points push quotes the
  // right date when the customer is in a different zone from the server.
  timezone?: string | null,
) {
  const variables = {
    points: points.toString(),
    total_points: totalPoints.toString(),
    provider_name: providerName,
    booking_date: formatBookingDate(bookingDate, timezone),
  };

  return await dispatchTemplateNotification(
    "loyalty_points_earned",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify loyalty points redeemed
 */
export async function notifyLoyaltyPointsRedeemed(
  userId: string,
  points: number,
  discountAmount: number,
  remainingPoints: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    points: points.toString(),
    discount_amount: fmt(discountAmount),
    remaining_points: remainingPoints.toString(),
  };

  return await dispatchTemplateNotification(
    "loyalty_points_redeemed",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify loyalty tier upgraded
 */
export async function notifyLoyaltyTierUpgraded(
  userId: string,
  newTier: string,
  oldTier: string,
  tierBenefits: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    new_tier: newTier,
    old_tier: oldTier,
    tier_benefits: tierBenefits,
  };

  return await dispatchTemplateNotification(
    "loyalty_tier_upgraded",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify referral bonus earned
 */
export async function notifyReferralBonusEarned(
  userId: string,
  bonusAmount: number,
  referredName: string,
  referralCode: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    bonus_amount: fmt(bonusAmount),
    referred_name: referredName,
    referral_code: referralCode,
  };

  return await dispatchTemplateNotification(
    "referral_bonus_earned",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify referral code used
 */
export async function notifyReferralCodeUsed(
  userId: string,
  referrerName: string,
  bonusAmount: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    referrer_name: referrerName,
    bonus_amount: fmt(bonusAmount),
  };

  return await dispatchTemplateNotification(
    "referral_code_used",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// SERVICE PACKAGES
// ============================================================================

/**
 * Notify service package purchased
 */
export async function notifyServicePackagePurchased(
  userId: string,
  packageName: string,
  servicesIncluded: string,
  packageValue: number,
  expiryDate: Date,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    services_included: servicesIncluded,
    package_value: fmt(packageValue),
    expiry_date: expiryDate.toLocaleDateString(),
    package_id: packageId,
  };

  return await dispatchTemplateNotification(
    "service_package_purchased",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service package expiring soon
 */
export async function notifyServicePackageExpiring(
  userId: string,
  packageName: string,
  expiryDate: Date,
  remainingServices: number,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    expiry_date: expiryDate.toLocaleDateString(),
    remaining_services: remainingServices.toString(),
    package_id: packageId,
  };

  return await dispatchTemplateNotification(
    "service_package_expiring",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service package expired
 */
export async function notifyServicePackageExpired(
  userId: string,
  packageName: string,
  expiryDate: Date,
  unusedServices: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    expiry_date: expiryDate.toLocaleDateString(),
    unused_services: unusedServices.toString(),
  };

  return await dispatchTemplateNotification(
    "service_package_expired",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service package used
 */
export async function notifyServicePackageUsed(
  userId: string,
  packageName: string,
  remainingServices: number,
  packageId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    package_name: packageName,
    remaining_services: remainingServices.toString(),
    package_id: packageId,
  };

  return await dispatchTemplateNotification(
    "service_package_used",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// PRODUCT ORDER NOTIFICATIONS
// ============================================================================

/**
 * Send order confirmation to customer (product order)
 * Uses notification template "order_confirmation". Create it in Admin → Notification templates
 * with key "order_confirmation" and variables: order_number, order_id, total_amount
 */
export async function notifyOrderConfirmation(
  userId: string,
  orderId: string,
  orderNumber: string,
  totalAmount: number,
  channels: NotificationChannel[] = ["push", "email"],
  options?: { skipInApp?: boolean }
) {
  const variables = {
    order_number: orderNumber,
    order_id: orderId,
    total_amount: fmt(totalAmount),
  };

  return await dispatchTemplateNotification(
    "order_confirmation",
    [userId],
    variables,
    channels,
    { appType: "customer", skipInApp: options?.skipInApp }
  );
}

// ============================================================================
// GIFT CARDS
// ============================================================================

/**
 * Notify gift card purchased
 */
export async function notifyGiftCardPurchased(
  userId: string,
  giftCardAmount: number,
  recipientName: string,
  giftCardCode: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    gift_card_amount: fmt(giftCardAmount),
    recipient_name: recipientName,
    gift_card_code: giftCardCode,
  };

  return await dispatchTemplateNotification(
    "gift_card_purchased",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify gift card received
 */
export async function notifyGiftCardReceived(
  userId: string,
  senderName: string,
  giftCardAmount: number,
  giftCardCode: string,
  message: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    sender_name: senderName,
    gift_card_amount: fmt(giftCardAmount),
    gift_card_code: giftCardCode,
    message: message,
  };

  return await dispatchTemplateNotification(
    "gift_card_received",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// MEMBERSHIPS & SUBSCRIPTIONS
// ============================================================================

/**
 * Notify membership renewal reminder
 */
export async function notifyMembershipRenewalReminder(
  userId: string,
  membershipName: string,
  renewalDate: Date,
  renewalAmount: number,
  channels?: NotificationChannel[]
) {
  const variables = {
    membership_name: membershipName,
    renewal_date: renewalDate.toLocaleDateString(),
    renewal_amount: fmt(renewalAmount),
  };

  return await dispatchTemplateNotification(
    "membership_renewal_reminder",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify membership activated
 */
export async function notifyMembershipActivated(
  userId: string,
  membershipName: string,
  benefits: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    membership_name: membershipName,
    benefits: benefits,
  };

  return await dispatchTemplateNotification(
    "membership_activated",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify membership payment failed (dunning).
 */
export async function notifyMembershipPaymentFailed(
  userId: string,
  membershipName: string,
  providerName: string,
  channels?: NotificationChannel[]
) {
  return await dispatchTemplateNotification(
    "membership_payment_failed",
    [userId],
    { membership_name: membershipName, provider_name: providerName },
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify membership expired (grace exhausted).
 */
export async function notifyMembershipExpired(
  userId: string,
  membershipName: string,
  providerName: string,
  channels?: NotificationChannel[]
) {
  return await dispatchTemplateNotification(
    "membership_expired",
    [userId],
    { membership_name: membershipName, provider_name: providerName },
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify membership card expired — customer needs to update card.
 */
export async function notifyMembershipCardExpired(
  userId: string,
  membershipName: string,
  providerName: string,
  channels?: NotificationChannel[]
) {
  return await dispatchTemplateNotification(
    "membership_card_expired",
    [userId],
    { membership_name: membershipName, provider_name: providerName },
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify a cancelled member that their provider invited them to rejoin.
 */
export async function notifyMembershipWinBack(
  userId: string,
  args: {
    providerName: string;
    membershipName: string;
    message?: string | null;
    plansUrl?: string | null;
    providerId?: string | null;
    providerSlug?: string | null;
  },
  channels?: NotificationChannel[],
) {
  // Deep link to the provider's profile → Memberships tab so the customer
  // lands directly on the plans they were invited to rejoin. Prefer the slug
  // when available; the public profile route also resolves a provider UUID.
  const providerRef = args.providerSlug?.trim() || args.providerId?.trim() || "";
  const plansUrl =
    args.plansUrl ??
    (providerRef
      ? `/partner-profile?${args.providerSlug?.trim() ? "slug" : "provider_id"}=${encodeURIComponent(providerRef)}&tab=memberships`
      : "/membership");

  const variables: Record<string, string> = {
    provider_name: args.providerName,
    membership_name: args.membershipName,
    message: args.message?.trim() || "Tap to view membership plans and rejoin when you are ready.",
    plans_url: plansUrl,
  };
  if (args.providerId?.trim()) variables.provider_id = args.providerId.trim();
  if (args.providerSlug?.trim()) variables.provider_slug = args.providerSlug.trim();

  return await dispatchTemplateNotification(
    "membership_win_back",
    [userId],
    variables,
    channels ?? ["push", "email"],
    { appType: "customer" },
  );
}

/**
 * Notify the provider team that a customer cancelled a salon membership.
 *
 * Fans out to the whole provider team (owner + active linked staff) using
 * `resolveProviderRecipients`, matching `notifyProviderNewBooking` behaviour
 * so co-owners and front-desk users on the provider app see the cancel.
 */
export async function notifyProviderMembershipCancelled(params: {
  providerId: string;
  providerOwnerUserId: string | null | undefined;
  customerName: string;
  planName: string;
  customerId: string;
  subscriptionId: string;
  channels?: NotificationChannel[];
}) {
  const recipients = await resolveProviderRecipients(
    params.providerId,
    params.providerOwnerUserId,
  );
  if (recipients.length === 0) {
    return { success: false, error: "No provider recipients resolved" };
  }

  const variables = {
    customer_name: params.customerName,
    plan_name: params.planName,
    customer_id: params.customerId,
    subscription_id: params.subscriptionId,
  };

  return await dispatchTemplateNotification(
    "provider_membership_cancelled",
    recipients,
    variables,
    params.channels,
    { appType: "provider" }
  );
}

// ============================================================================
// SUPPORT & MESSAGES
// ============================================================================

/**
 * Notify new message
 */
export async function notifyNewMessage(
  userId: string,
  senderName: string,
  messagePreview: string,
  conversationId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    sender_name: senderName,
    message_preview: messagePreview,
    conversation_id: conversationId,
  };

  return await dispatchTemplateNotification(
    "new_message",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify support ticket created
 */
export async function notifySupportTicketCreated(
  userId: string,
  ticketNumber: string,
  ticketSubject: string,
  ticketId: string,
  channels?: NotificationChannel[],
  /** Provider-opened tickets should target the provider OneSignal app; customers use the customer app. */
  recipientApp: "customer" | "provider" = "customer"
) {
  const variables = {
    ticket_number: ticketNumber,
    ticket_subject: ticketSubject,
    ticket_id: ticketId,
  };

  return await dispatchTemplateNotification(
    "support_ticket_created",
    [userId],
    variables,
    channels,
    { appType: recipientApp }
  );
}

/**
 * Notify support ticket updated
 */
export async function notifySupportTicketUpdated(
  userId: string,
  ticketNumber: string,
  updateMessage: string,
  ticketId: string,
  channels?: NotificationChannel[],
  recipientApp: "customer" | "provider" = "customer"
) {
  const variables = {
    ticket_number: ticketNumber,
    update_message: updateMessage,
    ticket_id: ticketId,
  };

  return await dispatchTemplateNotification(
    "support_ticket_updated",
    [userId],
    variables,
    channels,
    { appType: recipientApp }
  );
}

/**
 * User IDs to notify for inbound support work (excludes broad superadmin fan-out).
 */
async function listSupportInboxRecipientUserIds(limit = 40): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("users").select("id").in("role", ["support_agent", "admin_support"]).limit(limit);
  return (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
}

/**
 * Notify support staff about a new ticket or a customer reply (email + push via `support_ticket_updated` template).
 */
export async function notifySupportStaffInboxActivity(
  recipientUserIds: string[],
  ticketNumber: string,
  updateMessage: string,
  ticketId: string,
  channels: NotificationChannel[] = ["email", "push"]
) {
  const unique = [...new Set(recipientUserIds)].filter(Boolean);
  if (unique.length === 0) return { success: true as const, skipped: true as const };
  return dispatchTemplateNotification(
    "support_ticket_updated",
    unique,
    {
      ticket_number: ticketNumber,
      update_message: updateMessage,
      ticket_id: ticketId,
    },
    channels,
    { appType: "customer" }
  );
}

/**
 * Pick staff to alert: assignee if set, otherwise support_agent / admin_support roster.
 */
export async function resolveSupportTicketStaffRecipients(assignedToUserId: string | null): Promise<string[]> {
  if (assignedToUserId) return [assignedToUserId];
  return listSupportInboxRecipientUserIds();
}

// ============================================================================
// DISPUTES & COMPLAINTS
// ============================================================================

/**
 * Notify dispute opened
 */
export async function notifyDisputeOpened(
  bookingId: string,
  disputeReason: string,
  disputeId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
    provider_name: booking.provider?.business_name || "Provider",
    dispute_reason: disputeReason,
    dispute_id: disputeId,
  };

  // Notify customer
  await dispatchTemplateNotification("dispute_opened", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_dispute_opened",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

/**
 * Notify dispute resolved
 */
export async function notifyDisputeResolved(
  bookingId: string,
  resolutionDetails: string,
  disputeOutcome: string,
  disputeId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    booking_id: bookingId,
    resolution_details: resolutionDetails,
    dispute_outcome: disputeOutcome,
    dispute_id: disputeId,
  };

  // Notify customer
  await dispatchTemplateNotification("dispute_resolved", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_dispute_resolved",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

/**
 * Notify complaint filed
 */
export async function notifyComplaintFiled(
  bookingId: string,
  complaintDescription: string,
  complaintId: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    booking_number: booking.booking_number || bookingId,
    provider_name: booking.provider?.business_name || "Provider",
    complaint_description: complaintDescription,
    complaint_id: complaintId,
  };

  return await dispatchTemplateNotification(
    "complaint_filed",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify quality issue reported
 */
export async function notifyQualityIssueReported(
  bookingId: string,
  issueDescription: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    issue_description: issueDescription,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "quality_issue_reported",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// SAFETY & SECURITY
// ============================================================================

/**
 * Send safety check-in (at-home service)
 */
export async function notifySafetyCheckIn(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "safety_check_in",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}

/**
 * Send safety alert if check-in not confirmed
 */
export async function notifySafetyAlert(bookingId: string, channels?: NotificationChannel[]) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || booking.location_type !== "at_home") {
    return { success: false, error: "Booking not found or not at-home service" };
  }

  return await dispatchTemplateNotification(
    "safety_alert",
    [booking.customer_id],
    {},
    channels,
    // Target the customer OneSignal app explicitly so the alert routes to the
    // correct app credentials/devices instead of the default.
    { appType: "customer" }
  );
}

// ============================================================================
// SPECIAL REQUESTS & INSTRUCTIONS
// ============================================================================

/**
 * Notify special instructions added
 */
export async function notifySpecialInstructionsAdded(
  bookingId: string,
  instructions: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    instructions: instructions,
    booking_id: bookingId,
  };

  // Notify customer
  await dispatchTemplateNotification("special_instructions_added", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_special_instructions",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

/**
 * Notify provider of customer allergies
 */
export async function notifyAllergyAlert(
  bookingId: string,
  allergies: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking || !booking.provider?.user_id) {
    return { success: false, error: "Booking or provider not found" };
  }

  const variables = {
    customer_name: booking.customer?.full_name || "Customer",
    allergies: allergies,
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    services: booking.services?.map((s: { service?: { name?: string } }) => s.service?.name).join(", ") ?? "Services",
    booking_id: bookingId,
  };

  const recipients = await resolveProviderRecipients(
    booking.provider_id,
    booking.provider.user_id,
  );

  return await dispatchTemplateNotification(
    "allergy_alert_provider",
    recipients,
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "provider" }
  );
}

// ============================================================================
// WEATHER & EXTERNAL FACTORS
// ============================================================================

/**
 * Notify weather alert
 */
export async function notifyWeatherAlert(
  bookingId: string,
  weatherCondition: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    booking_time: formatBookingTime(booking.scheduled_at, providerTimezoneOf(booking)),
    weather_condition: weatherCondition,
    booking_id: bookingId,
  };

  // Notify customer
  await dispatchTemplateNotification("weather_alert", [booking.customer_id], withTenantVariable(booking.tenant_id, variables), channels, { appType: "customer" });

  // Notify provider team (owner + active staff).
  if (booking.provider?.user_id) {
    const recipients = await resolveProviderRecipients(
      booking.provider_id,
      booking.provider.user_id,
    );
    await dispatchTemplateNotification(
      "provider_weather_alert",
      recipients,
      {
        customer_name: booking.customer?.full_name || "Customer",
        ...variables,
      },
      channels,
      { appType: "provider" }
    );
  }

  return { success: true };
}

// ============================================================================
// PROVIDER ONBOARDING
// ============================================================================

/**
 * Notify provider onboarding welcome
 */
export async function notifyProviderOnboardingWelcome(providerUserId: string, channels?: NotificationChannel[]) {
  return await dispatchTemplateNotification(
    "provider_onboarding_welcome",
    [providerUserId],
    {},
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider profile approved
 */
export async function notifyProviderProfileApproved(providerUserId: string, channels?: NotificationChannel[]) {
  return await dispatchTemplateNotification(
    "provider_profile_approved",
    [providerUserId],
    {},
    channels,
    { appType: "provider" }
  );
}

/**
 * Notify provider profile rejected
 */
export async function notifyProviderProfileRejected(
  providerUserId: string,
  rejectionReason: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    rejection_reason: rejectionReason,
  };

  return await dispatchTemplateNotification(
    "provider_profile_rejected",
    [providerUserId],
    variables,
    channels,
    { appType: "provider" }
  );
}

// ============================================================================
// CUSTOMER EXPERIENCE ENHANCEMENTS
// ============================================================================

/**
 * Notify waitlist slot available
 */
export async function notifyBookingWaitlistAvailable(
  userId: string,
  providerName: string,
  availableDate: Date,
  availableTime: Date,
  services: string,
  providerId: string,
  channels?: NotificationChannel[],
  // B13: optional IANA provider timezone — recommended so the waitlist push
  // shows the time in the provider's zone rather than the Node server's.
  timezone?: string | null,
) {
  let tz: string | null | undefined = timezone;
  if (!tz && providerId) {
    const { data } = await getSupabaseAdmin()
      .from("providers")
      .select("timezone")
      .eq("id", providerId)
      .maybeSingle();
    tz = (data as { timezone?: string | null } | null)?.timezone ?? null;
  }
  const variables = {
    provider_name: providerName,
    available_date: formatBookingDate(availableDate, tz),
    available_time: formatBookingTime(availableTime, tz),
    services: services,
    provider_id: providerId,
  };

  return await dispatchTemplateNotification(
    "booking_waitlist_available",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify provider recommendation
 */
export async function notifyProviderRecommendation(
  userId: string,
  providerName: string,
  specialties: string,
  rating: number,
  recommendationReason: string,
  providerId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    provider_name: providerName,
    specialties: specialties,
    rating: rating.toString(),
    recommendation_reason: recommendationReason,
    provider_id: providerId,
  };

  return await dispatchTemplateNotification(
    "provider_recommendation",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

/**
 * Notify service suggestion
 */
export async function notifyServiceSuggestion(
  userId: string,
  suggestedService: string,
  providerName: string,
  servicePrice: number,
  serviceDescription: string,
  serviceId: string,
  channels?: NotificationChannel[]
) {
  const variables = {
    suggested_service: suggestedService,
    provider_name: providerName,
    service_price: fmt(servicePrice),
    service_description: serviceDescription,
    service_id: serviceId,
  };

  return await dispatchTemplateNotification(
    "service_suggestion",
    [userId],
    variables,
    channels,
    { appType: "customer" }
  );
}

// ============================================================================
// EMERGENCY CANCELLATIONS
// ============================================================================

/**
 * Notify emergency cancellation
 */
export async function notifyEmergencyCancellation(
  bookingId: string,
  emergencyReason: string,
  refundInfo: string,
  channels?: NotificationChannel[]
) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const variables = {
    provider_name: booking.provider?.business_name || "Provider",
    booking_date: formatBookingDate(booking.scheduled_at, providerTimezoneOf(booking)),
    emergency_reason: emergencyReason,
    refund_info: refundInfo,
    booking_id: bookingId,
  };

  return await dispatchTemplateNotification(
    "booking_cancelled_emergency",
    [booking.customer_id],
    withTenantVariable(booking.tenant_id, variables),
    channels,
    { appType: "customer" }
  );
}
