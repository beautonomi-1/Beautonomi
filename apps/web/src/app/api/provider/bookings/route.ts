import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse, normalizePhoneToE164 } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkBookingLimitsFeatureAccess } from "@/lib/subscriptions/feature-access";
import type { Booking } from "@/types/beautonomi";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { dateRangeBoundsUtc, fromBusinessTime, nowInTz, resolveTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { startOfDay, startOfMonth } from "date-fns";

import { mapStatusToProvider } from "@/lib/utils/booking-status";
import { checkActiveHoldOverlap, canOverrideDoubleBooking } from "@/lib/bookings/conflict-check";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { syncAppointmentProductOrder } from "@/lib/orders/sync-appointment-product-order";
import {
  createBookingsReadCacheKey,
  getCachedProviderBookingsList,
  invalidateProviderBookingsReadCache,
  setCachedProviderBookingsList,
} from "@/lib/bookings/provider-bookings-read-cache";
import { computeCatalogPackageServiceDiscount } from "@beautonomi/utils";
import { validateProviderCatalogPackageMatch } from "@/lib/bookings/validate-provider-package-booking";
import { resolveMembershipDiscount } from "@/lib/provider/salon-membership-entitlement";
import { shouldRejectProductOnlyProviderBooking } from "@/lib/provider-booking/booking-request-policy";
import {
  computeProviderCreateTaxableAmount,
  normalizeProviderCreateDiscounts,
  sumExplicitProviderAddonsSubtotal,
} from "@/lib/bookings/provider-booking-finance";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { validateProviderBookingProducts } from "@/lib/bookings/validate-provider-booking-products";

function sumUnpaidAdditionalCharges(charges: unknown): number {
  if (!Array.isArray(charges)) return 0;
  return charges
    .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
    .reduce((sum: number, charge: any) => sum + Number(charge?.amount ?? 0), 0);
}

// Map frontend status to database enum values
// Frontend: booked, started, completed, cancelled, no_show
// Database: pending, confirmed, in_progress, completed, cancelled, no_show
function mapStatusToDatabase(frontendStatus: string): string | null {
  const mapping: Record<string, string> = {
    booked: "confirmed",
    started: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
    pending: "pending",
    confirmed: "confirmed",
    in_progress: "in_progress",
    waiting: "waiting",
    checked_in: "checked_in",
  };
  return mapping[frontendStatus] ?? null;
}

// Map database status to frontend status
function mapStatusFromDatabase(dbStatus: string): string {
  return mapStatusToProvider(dbStatus as any);
}

const MAX_PROVIDER_FORM_RESPONSES_BYTES = 120_000;

/** Optional JSON map: form_id -> field values (same shape as checkout). */
function parseProviderFormResponses(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const s = JSON.stringify(raw);
    if (s.length > MAX_PROVIDER_FORM_RESPONSES_BYTES) {
      console.warn("provider_form_responses exceeded max size, ignoring");
      return null;
    }
  } catch {
    return null;
  }
  return raw as Record<string, unknown>;
}

function createWalkInEmail() {
  // Ensure we always have a valid, unique email for walk-in customers
  // since `public.users.email` is NOT NULL + UNIQUE and mirrors `auth.users.email`.
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `walkin+${uuid}@beautonomi.invalid`;
}

async function waitForUserProfileRow(supabaseAdmin: any, userId: string) {
  // The `auth.users` insert triggers `public.users` insert. In practice it's fast,
  // but we retry a few times to avoid a race when we immediately reference `public.users`.
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from("users").select("id").eq("id", userId).maybeSingle();
    if (data?.id) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

/**
 * GET /api/provider/bookings
 * 
 * Get provider's bookings with filters
 */
async function handleGetProviderBookings(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    // NOTE: We use the admin client for provider booking reads.
    // RLS for bookings is intentionally strict and depends on provider<->user links.
    // In the provider portal we already scope by provider_id (resolved server-side)
    // and enforce roles, so using admin here avoids "saved but not visible" issues.
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const cacheKey = createBookingsReadCacheKey(providerId, new URL(request.url).search);
    const cachedList = getCachedProviderBookingsList(cacheKey);
    if (cachedList) {
      const cachedResponse = successResponse(cachedList as Booking[]);
      cachedResponse.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10");
      return cachedResponse;
    }

    const { timezone: tz } = await getProviderReportContext(supabaseAdmin, providerId);
    const ymdParam = /^\d{4}-\d{2}-\d{2}$/;

    let query = supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        version,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, city),
        group_bookings!bookings_group_booking_id_fkey(ref_number),
        recurring_appointments!bookings_recurring_series_id_fkey(id, recurrence_rule, start_date, end_date, start_time, frequency, last_booking_date, occurrences, is_active),
        service_packages!bookings_package_id_fkey(id, name),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          currency,
          scheduled_start_at,
          scheduled_end_at,
          guest_name,
          offering:offerings(
            id,
            title,
            duration_minutes,
            price
          ),
          staff:provider_staff(
            id,
            name,
            role
          )
        ),
        booking_products(
          id,
          product_id,
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price),
          product_variant:product_variants(id, option_values)
        ),
        custom_offer:custom_offers!bookings_custom_offer_id_fkey(
          id,
          notes,
          request:custom_requests(
            id,
            description
          )
        ),
        additional_charges:additional_charges(
          id,
          amount,
          status
        )
      `
      )
      .eq("provider_id", providerId)
      // Participant bookings linked to a group are represented by the synthetic
      // group:uuid row built from group_bookings below. Excluding them here
      // prevents each participant from appearing twice in the merged list.
      .is("group_booking_id", null);

    // Apply filters
    const customerId = searchParams.get("customer_id");
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const status = searchParams.get("status");
    if (status && status !== "all") {
      // Handle comma-separated statuses; map frontend values (e.g. "booked") to DB enum (pending, confirmed, in_progress, completed, cancelled, no_show)
      if (status.includes(",")) {
        const raw = status.split(",").map(s => s.trim()).filter(Boolean);
        const statuses = [...new Set(raw.map(mapStatusToDatabase).filter((s): s is string => s !== null))];
        if (statuses.length) query = query.in("status", statuses);
      } else {
        const dbStatus = mapStatusToDatabase(status);
        if (dbStatus) query = query.eq("status", dbStatus);
      }
    }

    const paymentStatus = searchParams.get("payment_status");
    if (paymentStatus && paymentStatus !== "all") {
      query = query.eq("payment_status", paymentStatus);
    }

    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    if (startDate && ymdParam.test(startDate.slice(0, 10))) {
      const fromIso = dateRangeBoundsUtc(startDate.slice(0, 10), startDate.slice(0, 10), tz).fromIso;
      query = query.gte("scheduled_at", fromIso);
    }
    if (endDate && ymdParam.test(endDate.slice(0, 10))) {
      const endYmd = endDate.slice(0, 10);
      const toIso = dateRangeBoundsUtc(endYmd, endYmd, tz).toIso;
      query = query.lte("scheduled_at", toIso);
    }

    // Location: salon-scoped bookings use location_id; at-home bookings use location_type and have null location_id.
    const locationId = searchParams.get("location_id");
    const locationTypeFilter = searchParams.get("location_type");
    if (locationTypeFilter === "at_home") {
      query = query.eq("location_type", "at_home");
    } else if (locationId) {
      query = query.eq("location_id", locationId);
    }

    // §Provider-audit 2026-04 (round 6): server-side search by
    // booking_number / customer name / customer phone. Previously the
    // mobile bookings list filtered the whole fetched page in JS, which
    // silently missed matches outside the limit and got slow for
    // providers with thousands of bookings. Name/phone requires a
    // pre-lookup on `users` (same pattern used by /api/provider/clients).
    const searchRaw = searchParams.get("search");
    if (searchRaw && searchRaw.trim().length > 0) {
      const trimmed = searchRaw.trim();
      const safe = trimmed.replace(/[%_,()]/g, "");
      const digitsOnly = trimmed.replace(/\D+/g, "");

      const { data: matchedUsers } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(
          [
            `full_name.ilike.%${safe}%`,
            `email.ilike.%${safe}%`,
            ...(digitsOnly.length > 0 ? [`phone.ilike.%${digitsOnly}%`] : []),
          ].join(","),
        )
        .limit(500);

      const customerIds = (matchedUsers ?? [])
        .map((u: { id?: string | null }) => u?.id)
        .filter((v): v is string => typeof v === "string");

      const orClauses: string[] = [`booking_number.ilike.%${safe}%`];
      if (customerIds.length > 0) {
        orClauses.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      query = query.or(orClauses.join(","));
    }

    // Pagination: `limit` (max 1000 per request) + `offset` for stable server-side pages.
    // Mobile/provider apps merge multiple pages for the same date/sort filters when needed.
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    if (limitParam) {
      const parsedLimit = Number(limitParam);
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        const capped = Math.min(parsedLimit, 1000);
        const parsedOffset = Number(offsetParam ?? NaN);
        if (Number.isFinite(parsedOffset) && parsedOffset >= 0) {
          query = query.range(
            Math.floor(parsedOffset),
            Math.floor(parsedOffset) + capped - 1,
          );
        } else {
          query = query.limit(capped);
        }
      }
    }

    // Note: team_member_id filtering is done client-side in the API client
    // because staff_id is stored in booking_services (child table), not directly in bookings

    const sortParam = (searchParams.get("sort") ?? "").trim();
    const orderParam = (searchParams.get("order") ?? "").trim().toLowerCase();

    let orderColumn: "scheduled_at" | "created_at" = "scheduled_at";
    let ascending = false;

    if (sortParam.toLowerCase().startsWith("created_at")) {
      orderColumn = "created_at";
      if (sortParam.endsWith(":asc") || orderParam === "asc") ascending = true;
      else if (sortParam.endsWith(":desc") || orderParam === "desc") ascending = false;
      else ascending = false; // newest first
    } else {
      orderColumn = "scheduled_at";
      // Legacy: `sort=scheduled_at` alone meant chronological (ascending),
      // matching the provider mobile list default.
      if (sortParam === "scheduled_at" || sortParam === "scheduled_at:asc" || orderParam === "asc") {
        ascending = true;
      } else if (sortParam === "scheduled_at:desc" || orderParam === "desc") {
        ascending = false;
      } else if (!sortParam && !orderParam) {
        ascending = false;
      } else {
        ascending = false;
      }
    }

    const { data: bookings, error } = await query.order(orderColumn, { ascending });

    if (error) {
      throw error;
    }

    // Transform to match Booking type
    const transformedBookings = (bookings || []).map((booking: any) => {
      // Transform booking_services to include staff info and guest_name for group bookings
      const services = (booking.booking_services || []).map((bs: any) => ({
        id: bs.offering_id || bs.id,
        offering_id: bs.offering_id,
        staff_id: bs.staff_id || null,
        staff_name: bs.staff?.name || null,
        name: bs.offering?.title || bs.offerings?.title || "Service",
        offering_name: bs.offering?.title || bs.offerings?.title || "Service",
        service_name: bs.offering?.title || bs.offerings?.title || "Service",
        duration_minutes: bs.duration_minutes || bs.offering?.duration_minutes || 60,
        price: bs.price || bs.offering?.price || 0,
        currency: bs.currency || lastResortCurrency,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        guest_name: bs.guest_name || null,
      }));

      // Transform booking_products for front desk and calendar display
      const products = (booking.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_variant_id: bp.product_variant_id,
        product_variant: bp.product_variant,
        product_name: bp.products?.name || "Product",
        quantity: bp.quantity || 1,
        unit_price: bp.unit_price || bp.products?.retail_price || 0,
        total_price: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      }));
      const recurringSeries = Array.isArray(booking.recurring_appointments)
        ? booking.recurring_appointments[0]
        : booking.recurring_appointments;
      const unpaidAdditionalCharges = sumUnpaidAdditionalCharges(booking.additional_charges);
      const outstandingBalance = computeBookingOutstandingDisplay({
        totalAmount: Number(booking.total_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        totalRefunded: Number(booking.total_refunded ?? 0),
        walletAmount: Number(booking.wallet_amount ?? 0),
        giftCardAmount: Number(booking.gift_card_amount ?? 0),
        unpaidAdditionalCharges,
        paymentStatus: booking.payment_status,
      });

      // If a booking is stuck in pending_payment but payment is confirmed, normalise
      // the status for this response. This mirrors the detail-endpoint repair so the
      // list card and detail page always agree.
      const _listRawStatus = booking.status as string | undefined;
      const _listPaymentStatus = (booking as Record<string, unknown>).payment_status as string | undefined;
      const _listNormalizedStatus =
        _listRawStatus === "pending_payment" &&
        (_listPaymentStatus === "paid" || _listPaymentStatus === "partially_paid")
          ? "pending"
          : (_listRawStatus ?? "pending");

      return {
        id: booking.id,
        booking_number: booking.booking_number,
        customer_id: booking.customer_id,
        version: booking.version || 0,
        provider_id: booking.provider_id,
        status: mapStatusFromDatabase(_listNormalizedStatus),
        /** DB enum so clients can style pending vs confirmed even when `status` is mapped to `booked`. */
        db_status: _listNormalizedStatus,
        location_type: booking.location_type,
        location_id: booking.location_id,
        // Construct address object (include at-home / house-call detail fields for calendar + list UIs)
        address: booking.address_line1 ? {
          line1: booking.address_line1,
          line2: booking.address_line2,
          city: booking.address_city,
          state: booking.address_state,
          country: booking.address_country,
          postal_code: booking.address_postal_code,
          latitude: booking.address_latitude,
          longitude: booking.address_longitude,
          apartment_unit: booking.apartment_unit,
          building_name: booking.building_name,
          floor_number: booking.floor_number,
          access_codes: booking.access_codes
            ? (typeof booking.access_codes === "string" ? JSON.parse(booking.access_codes) : booking.access_codes)
            : null,
          parking_instructions: booking.parking_instructions,
          location_landmarks: booking.location_landmarks,
        } : null,
        house_call_instructions: booking.house_call_instructions || null,
        scheduled_at: booking.scheduled_at,
        completed_at: booking.completed_at || null,
        cancelled_at: booking.cancelled_at || null,
        cancellation_reason: booking.cancellation_reason || null,
        services: services,
        products: products,
        addons: [], // Addons would need to be fetched from booking_addons table
        package_id: booking.package_id || null,
        package_name: (() => {
          const sp = (booking as { service_packages?: { name?: string } | Array<{ name?: string }> }).service_packages;
          const one = Array.isArray(sp) ? sp[0] : sp;
          return typeof one?.name === "string" ? one.name : null;
        })(),
        subtotal: booking.subtotal || 0,
        discount_amount: booking.discount_amount || 0,
        discount_code: booking.discount_code || null,
        discount_reason: booking.discount_reason || null,
        tax_amount: booking.tax_amount || 0,
        tax_rate: booking.tax_rate || 0,
        platform_fee_percentage: Number(booking.platform_fee_percentage ?? booking.service_fee_percentage ?? 0),
        platform_fee_amount: Number(booking.platform_fee_amount ?? booking.service_fee_amount ?? 0),
        service_fee_percentage: Number(booking.service_fee_percentage ?? booking.platform_fee_percentage ?? 0),
        service_fee_amount: Number(booking.service_fee_amount ?? booking.platform_fee_amount ?? 0),
        platform_fee_paid_by: booking.platform_fee_paid_by ?? booking.service_fee_paid_by ?? null,
        service_fee_paid_by: booking.service_fee_paid_by ?? booking.platform_fee_paid_by ?? null,
        tip_amount: booking.tip_amount || 0,
        travel_fee: booking.travel_fee || 0,
        travel_fee_amount: booking.travel_fee || 0,
        total_amount: booking.total_amount || 0,
        total_paid: booking.total_paid || 0,
        total_refunded: booking.total_refunded || 0,
        wallet_amount: Number(booking.wallet_amount ?? 0),
        gift_card_amount: Number(booking.gift_card_amount ?? 0),
        loyalty_points_used: Number(booking.loyalty_points_used ?? booking.loyalty_points_redeemed ?? 0),
        loyalty_discount_amount: Number(booking.loyalty_discount_amount ?? 0),
        promotion_discount_amount: Number(booking.promotion_discount_amount ?? 0),
        membership_discount_amount: Number(booking.membership_discount_amount ?? 0),
        currency: booking.currency || lastResortCurrency,
        payment_status: booking.payment_status,
        payment_method: null, // payment_method_id is the actual column
        outstanding_balance: outstandingBalance,
        additional_charges: booking.additional_charges || [],
        special_requests: booking.special_requests || null,
        loyalty_points_earned: booking.loyalty_points_earned || 0,
        custom_offer: booking.custom_offer || null,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
        // Include current_stage for Mangomint-style status/color (client_arrived → WAITING, etc.)
        current_stage: booking.current_stage || null,
        arrival_otp_pending: Boolean((booking as any).arrival_otp_pending),
        qr_arrival_pending: Boolean((booking as any).qr_arrival_pending),
        arrival_otp_verified: Boolean((booking as any).arrival_otp_verified),
        qr_code_verified: Boolean((booking as any).qr_code_verified),
        // Include joined data for UI convenience (provider portal calendar uses these)
        customers: booking.customers || null,
        locations: booking.locations || null,
        // Flattened convenience fields for the bookings list page
        customer_name: booking.customers?.full_name || null,
        location_name: booking.locations?.name || null,
        staff_name: services[0]?.staff_name || null,
        recurring_series_id: booking.recurring_series_id || null,
        is_recurring: Boolean(booking.recurring_series_id || recurringSeries?.id),
        recurring_series: recurringSeries || null,
        recurrence_rule: recurringSeries?.recurrence_rule || null,
        recurrence_start_date: recurringSeries?.start_date || null,
        recurrence_end_date: recurringSeries?.end_date || null,
        recurrence_frequency: recurringSeries?.frequency || null,
        recurrence_last_booking_date: recurringSeries?.last_booking_date || null,
        recurrence_occurrences: recurringSeries?.occurrences || null,
        // Group booking: show on calendar and list
        is_group_booking: Boolean(booking.is_group_booking),
        group_booking_id: booking.group_booking_id || null,
        group_booking_ref: (() => {
          const gb = (booking as { group_bookings?: { ref_number?: string } | Array<{ ref_number?: string }> }).group_bookings;
          return Array.isArray(gb) ? gb[0]?.ref_number ?? null : gb?.ref_number ?? null;
        })(),
        provider_form_responses: booking.provider_form_responses ?? null,
        // Booking channel — used for Walk-in / Provider / Online / Custom labeling in UI
        booking_source: (booking as { booking_source?: string | null }).booking_source || null,
      };
    });

    let groupQuery = supabaseAdmin
      .from("group_bookings")
      .select("*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact, service_id, service_name, price, duration_minutes, addons)")
      .eq("provider_id", providerId);

    if (status && status !== "all") {
      const rawStatuses = status.includes(",")
        ? status.split(",").map((s) => s.trim()).filter(Boolean)
        : [status];
      const groupStatuses = [
        ...new Set(
          rawStatuses.flatMap((s) => {
            const db = mapStatusToDatabase(s);
            if (s === "booked" || db === "confirmed") return ["booked", "confirmed"];
            if (s === "started" || db === "in_progress") return ["started", "in_progress"];
            return [s, db].filter((v): v is string => Boolean(v));
          }),
        ),
      ];
      if (groupStatuses.length) groupQuery = groupQuery.in("status", groupStatuses);
    }
    if (startDate && ymdParam.test(startDate.slice(0, 10))) {
      const fromIso = dateRangeBoundsUtc(startDate.slice(0, 10), startDate.slice(0, 10), tz).fromIso;
      groupQuery = groupQuery.gte("scheduled_at", fromIso);
    }
    if (endDate && ymdParam.test(endDate.slice(0, 10))) {
      const endYmd = endDate.slice(0, 10);
      groupQuery = groupQuery.lte("scheduled_at", dateRangeBoundsUtc(endYmd, endYmd, tz).toIso);
    }
    if (locationId) groupQuery = groupQuery.eq("location_id", locationId);
    if (searchRaw && searchRaw.trim().length > 0) {
      const safe = searchRaw.trim().replace(/[%_,()]/g, "");
      groupQuery = groupQuery.or(`ref_number.ilike.%${safe}%,title.ilike.%${safe}%`);
    }
    const { data: groupRows, error: groupErr } = await groupQuery
      .order(orderColumn, { ascending })
      .limit(500);
    if (groupErr && !["42P01", "42703"].includes(groupErr.code ?? "")) {
      console.warn("[GET /api/provider/bookings] Failed to merge group bookings:", groupErr);
    }

    const groupStaffIds = [...new Set((groupRows ?? []).map((g: any) => g.staff_id).filter(Boolean))];
    const groupLocationIds = [...new Set((groupRows ?? []).map((g: any) => g.location_id).filter(Boolean))];
    const groupIds = (groupRows ?? []).map((g: any) => g.id).filter(Boolean);
    const [groupStaffRes, groupLocRes, groupChildBookingsRes] = await Promise.all([
      groupStaffIds.length
        ? supabaseAdmin.from("provider_staff").select("id, name").in("id", groupStaffIds)
        : Promise.resolve({ data: [] as any[] }),
      groupLocationIds.length
        ? supabaseAdmin.from("provider_locations").select("id, name, address_line1, city").in("id", groupLocationIds)
        : Promise.resolve({ data: [] as any[] }),
      groupIds.length
        ? supabaseAdmin
            .from("bookings")
            .select("id, group_booking_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, tip_amount, status, additional_charges(amount,status)")
            .eq("provider_id", providerId)
            .in("group_booking_id", groupIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const groupStaffName = new Map((groupStaffRes.data ?? []).map((s: any) => [s.id, s.name]));
    const groupLocation = new Map((groupLocRes.data ?? []).map((l: any) => [l.id, l]));
    const groupPaymentById = new Map<string, {
      totalAmount: number;
      totalPaid: number;
      totalRefunded: number;
      walletGiftCoverage: number;
      coverage: number;
      balanceDue: number;
      tipAmount: number;
      paymentStatus: string;
      hasRefundStatus: boolean;
    }>();
    for (const child of groupChildBookingsRes.data ?? []) {
      if (!child.group_booking_id || ["cancelled", "no_show"].includes(String(child.status ?? ""))) continue;
      const prev = groupPaymentById.get(child.group_booking_id) ?? {
        totalAmount: 0,
        totalPaid: 0,
        totalRefunded: 0,
        walletGiftCoverage: 0,
        coverage: 0,
        balanceDue: 0,
        tipAmount: 0,
        paymentStatus: "pending",
        hasRefundStatus: false,
      };
      const childPaymentStatus = String(child.payment_status ?? "");
      const paidAfterRefunds = Math.max(0, Number(child.total_paid ?? 0) - Number(child.total_refunded ?? 0));
      const walletGiftCoverage = Number(child.wallet_amount ?? 0) + Number(child.gift_card_amount ?? 0);
      const childCoverage = Math.max(paidAfterRefunds, walletGiftCoverage);
      const childUnpaidCharges = sumUnpaidAdditionalCharges(child.additional_charges);
      const childTotal = Number(child.total_amount ?? 0);
      const childBalanceDue = computeBookingOutstandingDisplay({
        totalAmount: childTotal,
        totalPaid: Number(child.total_paid ?? 0),
        totalRefunded: Number(child.total_refunded ?? 0),
        walletAmount: Number(child.wallet_amount ?? 0),
        giftCardAmount: Number(child.gift_card_amount ?? 0),
        unpaidAdditionalCharges: childUnpaidCharges,
        paymentStatus: child.payment_status ?? null,
      });
      groupPaymentById.set(child.group_booking_id, {
        totalAmount: prev.totalAmount + childTotal + childUnpaidCharges,
        totalPaid: prev.totalPaid + Number(child.total_paid ?? 0),
        totalRefunded: prev.totalRefunded + Number(child.total_refunded ?? 0),
        walletGiftCoverage: prev.walletGiftCoverage + walletGiftCoverage,
        coverage: prev.coverage + childCoverage,
        balanceDue: prev.balanceDue + childBalanceDue,
        tipAmount: prev.tipAmount + Math.max(0, Number(child.tip_amount ?? 0)),
        paymentStatus: prev.paymentStatus,
        hasRefundStatus:
          prev.hasRefundStatus ||
          childPaymentStatus === "partially_refunded" ||
          childPaymentStatus === "refunded" ||
          Number(child.total_refunded ?? 0) > 0,
      });
    }

    const transformedGroups = (groupRows ?? []).map((group: any) => {
      const participants = Array.isArray(group.booking_participants) ? group.booking_participants : [];
      const primary = participants.find((p: any) => p.is_primary_contact) ?? participants[0] ?? {};
      const firstParticipantService = participants.find((p: any) => p.service_id || p.service_name) ?? {};
      const serviceId = firstParticipantService.service_id || group.service_id || "";
      const serviceName =
        firstParticipantService.service_name ||
        group.service_name ||
        group.title ||
        "Group booking";
      const participantTotal = participants.reduce((sum: number, p: any) => sum + (Number(p.price) || 0), 0);
      const productRows = Array.isArray(group.products) ? group.products : [];
      const products = productRows.map((p: any, idx: number) => ({
        id: p.id ?? `${group.id}-product-${idx}`,
        product_id: p.product_id ?? p.productId ?? null,
        product_variant_id: p.product_variant_id ?? p.productVariantId ?? null,
        product_variant: p.product_variant_id || p.productVariantId
          ? { option_values: p.product_variant_name || p.productVariantName ? { option: p.product_variant_name ?? p.productVariantName } : {} }
          : null,
        product_name: p.product_name ?? p.productName ?? "Product",
        quantity: Number(p.quantity ?? 1) || 1,
        unit_price: Number(p.unit_price ?? p.unitPrice ?? 0) || 0,
        total_price: Number(p.total_price ?? p.totalPrice ?? 0) || (Number(p.unit_price ?? p.unitPrice ?? 0) || 0) * (Number(p.quantity ?? 1) || 1),
      }));
      const productTotal = products.reduce((sum: number, p: any) => sum + (Number(p.total_price) || 0), 0);
      const total = Number(group.total_price ?? 0) || participantTotal + productTotal + (Number(group.travel_fee) || 0);
      const payment = groupPaymentById.get(group.id) ?? {
        totalAmount: 0,
        totalPaid: 0,
        totalRefunded: 0,
        walletGiftCoverage: 0,
        coverage: 0,
        balanceDue: 0,
        tipAmount: 0,
        paymentStatus: "pending",
        hasRefundStatus: false,
      };
      const balanceDue = Math.max(0, payment.totalAmount > 0 ? payment.balanceDue : total - payment.coverage);
      const displayTotal = payment.totalAmount > 0 ? Math.max(total, payment.totalAmount) : total;
      const groupPaymentStatus =
        payment.hasRefundStatus && payment.totalPaid > 0 && payment.totalRefunded >= payment.totalPaid - 0.01
          ? "refunded"
          : payment.hasRefundStatus
            ? "partially_refunded"
            : displayTotal > 0 && balanceDue <= 0
              ? "paid"
              : payment.totalPaid > 0 || payment.walletGiftCoverage > 0
                ? "partially_paid"
                : "pending";
      const staffName = group.staff_id ? groupStaffName.get(group.staff_id) ?? null : null;
      const loc = group.location_id ? groupLocation.get(group.location_id) ?? null : null;
      return {
        id: `group:${group.id}`,
        group_booking_id: group.id,
        booking_number: group.ref_number || group.id,
        customer_id: null,
        version: 0,
        provider_id: group.provider_id,
        status: mapStatusFromDatabase(group.status === "started" ? "in_progress" : group.status === "booked" ? "confirmed" : group.status),
        db_status: group.status === "started" ? "in_progress" : group.status === "booked" ? "confirmed" : group.status,
        location_type: group.location_type || "at_salon",
        location_id: group.location_id,
        address: group.address_line1 ? {
          line1: group.address_line1,
          city: group.address_city,
          state: group.address_state,
          country: group.address_country,
          postal_code: group.address_postal_code,
          latitude: group.address_latitude,
          longitude: group.address_longitude,
        } : null,
        scheduled_at: group.scheduled_at,
        completed_at: null,
        cancelled_at: null,
        cancellation_reason: null,
        services: [{
          id: serviceId || group.id,
          offering_id: serviceId || null,
          staff_id: group.staff_id || null,
          staff_name: staffName,
          name: serviceName,
          offering_name: serviceName,
          service_name: serviceName,
          duration_minutes: Number(group.duration_minutes) || 60,
          price: participantTotal || total,
          currency: lastResortCurrency,
          scheduled_start_at: group.scheduled_at,
          scheduled_end_at: null,
          guest_name: primary.participant_name || null,
        }],
        products,
        addons: [],
        package_id: group.package_id || null,
        package_name: null,
        subtotal: Math.max(0, displayTotal - (Number(group.travel_fee) || 0)),
        discount_amount: 0,
        discount_code: null,
        discount_reason: null,
        tax_amount: 0,
        tax_rate: 0,
        service_fee_percentage: 0,
        service_fee_amount: 0,
        tip_amount: Math.max(0, Number(payment.tipAmount ?? 0)),
        total_amount: displayTotal,
        total_paid: payment.totalPaid,
        total_refunded: payment.totalRefunded,
        wallet_amount: Math.max(0, payment.walletGiftCoverage),
        gift_card_amount: 0,
        balance_due: balanceDue,
        currency: lastResortCurrency,
        payment_status: groupPaymentStatus,
        outstanding_balance: balanceDue,
        payment_method: null,
        special_requests: group.notes || null,
        loyalty_points_earned: 0,
        travel_fee: Number(group.travel_fee) || 0,
        created_at: group.created_at,
        updated_at: group.updated_at,
        current_stage: null,
        customers: {
          id: null,
          full_name: primary.participant_name || group.title || "Group booking",
          email: primary.participant_email || null,
          phone: primary.participant_phone || null,
        },
        locations: loc,
        customer_name: primary.participant_name || group.title || "Group booking",
        location_name: loc?.name || null,
        staff_name: staffName,
        is_group_booking: true,
        group_booking_ref: group.ref_number || null,
        provider_form_responses: null,
        // Channel tag so UI can render a "Group" chip without guessing
        booking_source: "group_booking",
      };
    });

    const mergedBookings = [...transformedBookings, ...transformedGroups].sort((a: any, b: any) => {
      const aTime = new Date(a.scheduled_at ?? 0).getTime();
      const bTime = new Date(b.scheduled_at ?? 0).getTime();
      return ascending ? aTime - bTime : bTime - aTime;
    });

    setCachedProviderBookingsList(cacheKey, mergedBookings as unknown as Booking[]);

    const response = successResponse(mergedBookings as unknown as Booking[]);
    
    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    console.error("[GET /api/provider/bookings]", error);
    return handleApiError(error, "Failed to fetch bookings");
  }
}

/**
 * POST /api/provider/bookings
 * 
 * Create a new booking/appointment
 */
async function handleCreateProviderBooking(request: NextRequest) {
  try {
    // Check permission to create appointments
    const permissionCheck = await requirePermission('create_appointments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin(); // Use admin client to bypass RLS
    const body = await request.json();
    const providerFormResponses = parseProviderFormResponses(
      (body as { provider_form_responses?: unknown }).provider_form_responses
    );

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    invalidateProviderBookingsReadCache(providerId);

    // Check booking limits
    const bookingAccess = await checkBookingLimitsFeatureAccess(providerId, supabase);
    if (bookingAccess.enabled && bookingAccess.maxBookingsPerMonth) {
      const { data: tzRow } = await supabaseAdmin
        .from("providers")
        .select("timezone")
        .eq("id", providerId)
        .maybeSingle();
      const tz = resolveTz((tzRow as { timezone?: string | null } | null)?.timezone);
      const monthStartUtc = fromBusinessTime(startOfDay(startOfMonth(nowInTz(tz))), tz);

      const { data: bookingsThisMonth } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("provider_id", providerId)
        .gte("created_at", monthStartUtc.toISOString());

      if ((bookingsThisMonth?.length || 0) >= bookingAccess.maxBookingsPerMonth) {
        return errorResponse(
          `You've reached your monthly booking limit (${bookingAccess.maxBookingsPerMonth}). Please upgrade your plan to create more bookings.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    // Determine appointment status based on provider settings
    // This handles: default status, require confirmation, and auto-confirm logic
    const finalStatus = await determineAppointmentStatusFromDB(
      supabaseAdmin,
      providerId,
      body.status // Allow explicit status override from request body
    );

    // Handle walk-in clients - create or find customer
    // customer_id is REQUIRED, so we must always have one
    let customerId = body.customer_id;
    
    if (!customerId) {
      // Check if customer exists by email or phone (use admin client to bypass RLS)
      if (body.customer_email) {
        const { data: existingCustomer } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("email", body.customer_email)
          .maybeSingle();
        
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }
      
      // Also check by phone if email didn't work
      if (!customerId && body.customer_phone) {
        const { data: existingCustomer } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("phone", body.customer_phone)
          .maybeSingle();
        
        if (existingCustomer) {
          customerId = existingCustomer.id;
        }
      }

      // If still no customer, create a new one for walk-in (use admin client)
      if (!customerId) {
        if (!body.customer_name) {
          return errorResponse(
            "Customer name is required for walk-in appointments",
            "WALK_IN_NAME_REQUIRED",
            422,
          );
        }

        // IMPORTANT:
        // `public.users.id` references `auth.users.id` and has no default.
        // So we must create the Auth user first; a trigger will create `public.users`.
        const walkInEmail = body.customer_email || createWalkInEmail();
        // Normalize phone to E.164 format if provided
        const normalizedPhone = normalizePhoneToE164(body.customer_phone);
        const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: walkInEmail,
          phone: normalizedPhone,
          email_confirm: true,
          user_metadata: {
            full_name: body.customer_name,
            phone: body.customer_phone || null, // Store original phone in metadata
            role: "customer",
          },
        });

        if (createUserError || !createdUser?.user?.id) {
          console.error("Error creating auth user for walk-in:", createUserError);
          return errorResponse(
            createUserError?.message
              ? `Could not create walk-in customer: ${createUserError.message}`
              : "Could not create walk-in customer. Check email/phone and try again.",
            "WALK_IN_AUTH_FAILED",
            422,
            createUserError ? { auth: createUserError } : undefined,
          );
        }

        customerId = createdUser.user.id;
        
        // Wait for trigger to create public.users record
        await waitForUserProfileRow(supabaseAdmin, customerId);
        
        // Ensure user record exists - if trigger failed, create it manually
        const { data: userProfile, error: _profileError } = await supabaseAdmin
          .from("users")
          .select("id, full_name, phone")
          .eq("id", customerId)
          .maybeSingle();
        
        if (!userProfile) {
          console.warn("User profile not created by trigger, creating manually for walk-in customer");
          // Manually create the user record if trigger didn't fire
          const { error: insertError } = await supabaseAdmin
            .from("users")
            .insert({
              id: customerId,
              email: walkInEmail,
              full_name: body.customer_name,
              phone: body.customer_phone || null,
              role: "customer",
            });
          
          if (insertError) {
            console.error("Error manually creating user profile:", insertError);
            return errorResponse(
              `Failed to create customer profile: ${insertError.message ?? "unknown error"}`,
              "WALK_IN_PROFILE_FAILED",
              422,
              { db: insertError },
            );
          }
        } else {
          // Update user profile with any additional info if needed
          const updateData: any = {};
          if (body.customer_name && !userProfile.full_name) {
            updateData.full_name = body.customer_name;
          }
          if (body.customer_phone && !userProfile.phone) {
            updateData.phone = body.customer_phone;
          }
          
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin
              .from("users")
              .update(updateData)
              .eq("id", customerId);
          }
        }
      }
    }
    
    if (!customerId) {
      return errorResponse(
        "Customer ID is required but could not be determined. Please select an existing customer or provide a name for a walk-in.",
        "CUSTOMER_ID_REQUIRED",
        422,
      );
    }

    if (body.location_type === "at_home") {
      const addrLine = body.address?.line1 || body.address_line1;
      if (!addrLine || !String(addrLine).trim()) {
        return NextResponse.json(
          { error: "A service address is required for at-home bookings" },
          { status: 400 },
        );
      }
    }

    // Booking numbers are assigned by DB trigger `set_booking_number` →
    // `generate_booking_number()` (BTN-… format). Do **not** generate
    // client-side BK#### sequences here: they race under concurrent group
    // participant creates and break once any booking uses BTN-… (parseInt
    // on legacy BK logic → NaN → duplicate `bookings_tenant_id_booking_number_key`).

    // Get effective tax rate if not provided: provider tax_rate_percent → platform default → 0% fallback
    // Also fetch tax_inclusive flag from the provider record to correctly branch the pricing formula
    let effectiveTaxRate = body.tax_rate;
    let taxInclusive = true; // SA default — most providers use VAT-inclusive pricing
    {
      const { data: providerTaxRow } = await supabaseAdmin
        .from("providers")
        .select("tax_rate_percent, tax_inclusive")
        .eq("id", providerId)
        .maybeSingle();
      if (providerTaxRow) {
        taxInclusive = providerTaxRow.tax_inclusive ?? true;
        if (!effectiveTaxRate || effectiveTaxRate === 0) {
          if (providerTaxRow.tax_rate_percent !== null && providerTaxRow.tax_rate_percent !== undefined) {
            effectiveTaxRate = providerTaxRow.tax_rate_percent;
          }
        }
      }
      if (!effectiveTaxRate || effectiveTaxRate === 0) {
        const { getEffectiveTaxRate } = await import("@/lib/platform-tax-settings");
        effectiveTaxRate = await getEffectiveTaxRate(providerId);
      }
    }

    // Determine location_id: use provided value, or default to provider's first salon location for at_salon bookings
    // Only salon locations (location_type = 'salon') accept at_salon/walk-in; base-only is for distance/travel.
    let locationId = body.location_id || null;
    if (body.location_type === "at_salon" || !body.location_type) {
      const { data: salonLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id, location_type")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      const firstSalon = salonLocations?.find((l: { location_type?: string }) => (l.location_type || "salon") === "salon");
      if (!locationId) {
        if (firstSalon) locationId = firstSalon.id;
      } else {
        // If client (e.g. provider app) sent a location_id that is base-only, use first salon instead
        const chosen = salonLocations?.find((l: { id: string }) => l.id === locationId);
        if (chosen && (chosen as { location_type?: string }).location_type === "base") {
          locationId = firstSalon?.id ?? locationId;
        }
      }
    }

    // Determine booking source. Only actual walk-ins should be 'walk_in';
    // other provider-created bookings should be 'provider' so payout/reporting
    // logic can distinguish platform-mediated from in-person revenue correctly.
    const bookingSource = body.booking_source || 'provider';
    
    // Referral source (where did this client come from?) — must belong to this provider
    let referralSourceId: string | null = body.referral_source_id ?? null;
    if (referralSourceId) {
      const { data: src } = await supabaseAdmin
        .from("referral_sources")
        .select("id")
        .eq("id", referralSourceId)
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .maybeSingle();
      if (!src) referralSourceId = null; // Invalid or wrong provider, ignore
    }

    // For walk-in bookings, set Platform Fee to 0 (platform doesn't charge direct customers)
    const isWalkIn = bookingSource === 'walk_in';
    const platformFeeAmount = isWalkIn ? 0 : (body.platform_fee_amount ?? body.service_fee_amount ?? 0);
    const platformFeePercentage = isWalkIn ? 0 : (body.platform_fee_percentage ?? body.service_fee_percentage ?? 0);

    const numOrNull = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const bodyLat = numOrNull(
      (body as { address_latitude?: unknown }).address_latitude ??
        (body as { address?: { latitude?: unknown; lat?: unknown } }).address?.latitude ??
        (body as { address?: { lat?: unknown } }).address?.lat,
    );
    const bodyLng = numOrNull(
      (body as { address_longitude?: unknown }).address_longitude ??
        (body as { address?: { longitude?: unknown; lng?: unknown } }).address?.longitude ??
        (body as { address?: { lng?: unknown } }).address?.lng,
    );

    // Server-side pricing recomputation to prevent client-trusted totals from causing incorrect records.
    // Handles both tax-inclusive (SA VAT model: prices already include tax) and tax-exclusive modes.
    const servicesSubtotal = Array.isArray(body.services)
      ? body.services.reduce((sum: number, svc: any) => sum + (Number(svc.price) || 0), 0)
      : 0;
    const explicitAddonsSubtotal = sumExplicitProviderAddonsSubtotal(body.addons);
    const addOnIdsFromServices = Array.isArray(body.services)
      ? [
          ...new Set(
            body.services
              .flatMap((svc: any) => (Array.isArray(svc.add_on_ids) ? svc.add_on_ids : []))
              .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
              .map((id: string) => id.trim()),
          ),
        ]
      : [];
    let serviceAddOnsSubtotal = 0;
    if (!Array.isArray(body.addons) && addOnIdsFromServices.length > 0) {
      const { data: addOnPriceRows, error: addOnPriceError } = await supabaseAdmin
        .from("offerings")
        .select("id, price")
        .in("id", addOnIdsFromServices);
      if (addOnPriceError) {
        console.warn("[provider/bookings] Could not resolve add-on prices for subtotal recomputation:", addOnPriceError);
      }
      serviceAddOnsSubtotal = (addOnPriceRows ?? []).reduce(
        (sum: number, row: any) => sum + (Number(row.price) || 0),
        0,
      );
    }
    const addonsSubtotal = Array.isArray(body.addons) ? explicitAddonsSubtotal : serviceAddOnsSubtotal;
    const productsSubtotal = Array.isArray(body.products)
      ? body.products.reduce((sum: number, product: any) => {
          const qty = Number(product.quantity ?? 1) || 1;
          const line =
            Number(product.totalPrice ?? product.total_price) ||
            (Number(product.unitPrice ?? product.unit_price ?? product.price) || 0) * qty;
          return sum + line;
        }, 0)
      : 0;
    const computedLineSubtotal = servicesSubtotal + addonsSubtotal + productsSubtotal;
    const serverSubtotal = computedLineSubtotal > 0 ? computedLineSubtotal : Number(body.subtotal) || 0;
    const explicitMembershipDiscount = Math.max(
      0,
      Number((body as { membership_discount_amount?: unknown }).membership_discount_amount) || 0,
    );
    const normalizedDiscounts = normalizeProviderCreateDiscounts({
      discountAmount: Number(body.discount_amount) || 0,
      promotionDiscountAmount: Number(body.promotion_discount_amount) || 0,
      membershipDiscountAmount: explicitMembershipDiscount,
      discountCode: typeof body.discount_code === "string" ? body.discount_code : null,
    });
    let serverDiscountAmount = normalizedDiscounts.discountAmount;
    const serverPromotionDiscountAmount = normalizedDiscounts.promotionDiscountAmount;
    if (shouldRejectProductOnlyProviderBooking(body as Record<string, unknown>)) {
      return errorResponse(
        "Product-only sales are not appointment bookings. Use the product sale checkout so stock, receipts, and end-of-day reporting stay consistent.",
        "UNSUPPORTED_PRODUCT_ONLY_BOOKING",
        422,
      );
    }
    const productValidation = await validateProviderBookingProducts(
      supabaseAdmin,
      providerId,
      Array.isArray(body.products) ? body.products : [],
    );
    if (productValidation.ok === false) {
      return errorResponse(
        productValidation.message,
        productValidation.code,
        productValidation.code === "PRODUCT_VALIDATION_FAILED" ? 503 : 400,
      );
    }
    const validatedProducts = productValidation.products;
    // Catalog package: validate lines against `service_package_items`, then discount SERVICES-only
    // subtotal (matches public `validate-booking.ts`).
    const bookingLocationTypeForPkg = body.location_type || "at_salon";
    if (body.package_id) {
      const svcForPkg = Array.isArray(body.services)
        ? (
            body.services as Array<{
              offering_id?: string;
              service_id?: string;
              serviceId?: string;
            }>
          )
            .map((s) => ({
              offering_id: s.offering_id ?? s.service_id ?? s.serviceId ?? "",
            }))
            .filter((s) => s.offering_id.length > 0)
        : [];
      const prodForPkg = Array.isArray(body.products)
        ? (body.products as Array<Record<string, unknown>>)
            .map((p) => ({
              product_id: String(p.product_id ?? p.productId ?? ""),
              product_variant_id: (p.product_variant_id ?? p.productVariantId ?? null) as string | null,
              quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)),
            }))
            .filter((p) => p.product_id.length > 0)
        : [];

      const pv = await validateProviderCatalogPackageMatch({
        supabaseAdmin,
        providerId,
        packageId: body.package_id as string,
        locationType: bookingLocationTypeForPkg,
        locationId,
        services: svcForPkg,
        products: prodForPkg,
      });
      if (pv.ok === false) {
        return errorResponse(pv.message, pv.code, 400);
      }
      const packageDiscount = computeCatalogPackageServiceDiscount(pv.pkg, servicesSubtotal);
      serverDiscountAmount = Math.max(serverDiscountAmount, packageDiscount);
    }

    // §Provider-audit 2026-05: auto-apply membership benefits so a provider
    // booking a service for a salon member gets the same discount the public
    // checkout would. Without this, members were being silently overcharged
    // when their stylist created the booking from the provider app.
    const bookingLocationType = body.location_type || "at_salon";
    const serverTravelFee = bookingLocationType === "at_home" ? Number(body.travel_fee) || 0 : 0;
    const subtotalForMembership = Math.max(0, serverSubtotal + serverTravelFee - serverDiscountAmount);
    const membershipResult = await resolveMembershipDiscount({
      supabase: supabaseAdmin,
      customerId,
      providerId,
      subtotal: subtotalForMembership,
    });
    let membershipDiscountAmount = membershipResult.membershipDiscountAmount;
    if (explicitMembershipDiscount > 0.001) {
      membershipDiscountAmount = explicitMembershipDiscount;
    }
    const serverTipAmount = Number(body.tip_amount) || 0;
    const serverPlatformFeeAmount = Number(platformFeeAmount) || 0;
    const taxableAmount = computeProviderCreateTaxableAmount({
      subtotal: serverSubtotal,
      discountAmount: serverDiscountAmount,
      promotionDiscountAmount: serverPromotionDiscountAmount,
      membershipDiscountAmount,
    });
    const taxRateDecimal = effectiveTaxRate / 100;

    const recomputedTaxAmount = taxInclusive
      ? Math.round((taxableAmount - taxableAmount / (1 + taxRateDecimal)) * 100) / 100
      : Math.round(taxableAmount * taxRateDecimal * 100) / 100;

    const recomputedTotalAmount = taxInclusive
      ? Math.round((taxableAmount + serverTipAmount + serverTravelFee + serverPlatformFeeAmount) * 100) / 100
      : Math.round((taxableAmount + recomputedTaxAmount + serverTipAmount + serverTravelFee + serverPlatformFeeAmount) * 100) / 100;

    const finalTaxAmount = recomputedTaxAmount;
    const finalTotalAmount = recomputedTotalAmount;

    // Pre-validate status mapping before building bookingData so a bad status
    // returns a structured 422 instead of throwing inside an object literal.
    const mappedBookingStatus = mapStatusToDatabase(finalStatus);
    if (!mappedBookingStatus) {
      return errorResponse(
        `Unknown booking status: "${finalStatus}". Accepted values: pending, confirmed, cancelled, completed.`,
        "INVALID_STATUS",
        422,
      );
    }

    const groupBookingIdRaw = (body as { group_booking_id?: unknown }).group_booking_id;
    const normalizedGroupBookingId =
      typeof groupBookingIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(groupBookingIdRaw.trim())
        ? groupBookingIdRaw.trim()
        : null;

    // Prepare booking data - only include columns that exist in the bookings table
    // Note: services and addons are stored in separate tables (booking_services, booking_addons)
    const bookingData: any = {
      provider_id: providerId,
      customer_id: customerId,
      // Empty string matches `create_booking_with_locking` and fires BEFORE INSERT trigger.
      booking_number: "",
      ...(tenantId ? { tenant_id: tenantId } : {}),
      scheduled_at: body.scheduled_at,
      location_type: bookingLocationType,
      location_id: locationId,
      booking_source: bookingSource,
      address_line1: body.address?.line1 || body.address_line1 || null,
      address_line2: body.address?.line2 || body.address_line2 || null,
      address_city: body.address?.city || body.address_city || null,
      address_state: body.address?.state || body.address_state || null,
      address_country: body.address?.country || body.address_country || null,
      address_postal_code: body.address?.postal_code || body.address_postal_code || null,
      address_latitude: bodyLat,
      address_longitude: bodyLng,
      package_id: body.package_id || null,
      subtotal: serverSubtotal,
      discount_amount: serverDiscountAmount,
      discount_code: body.discount_code || null,
      discount_reason: body.discount_reason || null,
      promotion_discount_amount: serverPromotionDiscountAmount,
      // §Provider-audit 2026-05: persist the membership benefit applied so
      // the bookings list, receipts, and reporting reflect the same numbers
      // as the public checkout flow.
      membership_plan_id: membershipResult.membershipPlanId,
      membership_id: membershipResult.membershipId,
      membership_discount_amount: membershipDiscountAmount,
      tax_amount: finalTaxAmount,
      tax_rate: effectiveTaxRate,
      tip_amount: serverTipAmount,
      total_amount: finalTotalAmount,
      currency: body.currency || lastResortCurrency,
      status: mappedBookingStatus,
      payment_status: (() => {
        if (body.payment_option === "deposit") {
          // Deposit booking: if an in-person payment was collected now, partially_paid; otherwise pending.
          return body.payment_method === "cash" || body.payment_method === "card" ? "partially_paid" : "pending";
        }
        // Full payment: manual cash/card means the provider already collected it; terminal/link stay pending.
        return body.payment_method === "cash" || body.payment_method === "card" ? "paid" : "pending";
      })(),
      special_requests: body.special_requests || null,
      // Deposit metadata
      deposit_required: body.deposit_required || false,
      deposit_percentage: body.deposit_percentage || null,
      deposit_amount: body.deposit_amount || null,
      payment_option: body.payment_option || "full",
      loyalty_points_earned: 0,
      travel_fee: serverTravelFee,
      platform_fee_percentage: platformFeePercentage,
      platform_fee_amount: platformFeeAmount,
      platform_fee_paid_by: isWalkIn ? null : (body.platform_fee_paid_by ?? body.service_fee_paid_by ?? 'customer'),
      service_fee_percentage: platformFeePercentage,
      service_fee_amount: platformFeeAmount,
      service_fee_paid_by: isWalkIn ? null : (body.platform_fee_paid_by ?? body.service_fee_paid_by ?? 'customer'),
      referral_source_id: referralSourceId,
      ...(normalizedGroupBookingId
        ? { group_booking_id: normalizedGroupBookingId, is_group_booking: true }
        : {}),
      ...(providerFormResponses ? { provider_form_responses: providerFormResponses } : {}),
    };

    // Validate required fields
    if (!bookingData.scheduled_at) {
      return errorResponse("Appointment date/time (scheduled_at) is required.", "MISSING_SCHEDULED_AT", 422);
    }
    if (!bookingData.provider_id) {
      return errorResponse("Provider ID is required.", "MISSING_PROVIDER_ID", 422);
    }
    if (!bookingData.customer_id) {
      return errorResponse("Customer ID is required.", "MISSING_CUSTOMER_ID", 422);
    }

    // Resolve staff and time range for conflict check / RPC path
    const staffId =
      body.services?.[0]?.staffId ||
      body.services?.[0]?.staff_id ||
      body.team_member_id ||
      body.staff_id ||
      null;
    let startAt: Date;
    let endAt: Date;
    const defaultBuffer = 15;
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {
      const firstStart = body.services[0].scheduled_start_at || bookingData.scheduled_at;
      startAt = new Date(firstStart);
      let cursor = new Date(firstStart);
      for (const s of body.services) {
        const duration = s.duration ?? s.duration_minutes ?? 60;
        const svcBuffer = s.buffer_minutes ?? 0;
        cursor = new Date(cursor.getTime() + (duration + svcBuffer) * 60 * 1000);
      }
      endAt = cursor;
    } else {
      const start = new Date(bookingData.scheduled_at);
      const duration = body.duration_minutes ?? 60;
      startAt = start;
      endAt = new Date(start.getTime() + (duration + defaultBuffer) * 60 * 1000);
    }

    // Provider-portal bookings can request an explicit override via the request
    // body (same pattern as the group-bookings route). This lets providers book
    // intentionally outside the availability grid without changing their global
    // "allow double booking" setting.
    const bodyOverride = body.allow_override === true || body.allow_override_slot === true;
    const allowOverride = bodyOverride || await canOverrideDoubleBooking(supabaseAdmin, providerId);
    // When a participant booking is created for an existing group booking, the
    // group itself now occupies the slot in the availability grid. Callers can
    // pass exclude_group_booking_id so the grid ignores the parent group and
    // doesn't falsely block participant bookings at the same time.
    const excludeGroupBookingId: string | undefined =
      typeof body.exclude_group_booking_id === "string" && body.exclude_group_booking_id.length > 0
        ? body.exclude_group_booking_id
        : undefined;
    const useRpcPath = staffId != null && !allowOverride;

    // Active customer holds block the window (same as public validate-booking).
    const holdIdForExclude =
      typeof (body as { hold_id?: unknown }).hold_id === "string" &&
      String((body as { hold_id: string }).hold_id).trim().length > 0
        ? String((body as { hold_id: string }).hold_id).trim()
        : undefined;
    const holdOverlap = await checkActiveHoldOverlap(
      supabaseAdmin as any,
      providerId,
      startAt,
      endAt,
      { dbStaffId: staffId, ...(holdIdForExclude ? { excludeHoldId: holdIdForExclude } : {}) },
    );
    if (holdOverlap) {
      return errorResponse(
        "This time slot is no longer available. Please select another time.",
        "CONFLICT",
        409
      );
    }

    // Same shared engine as GET /available-slots + GET /check-availability — single source of truth
    // at commit time (unless provider allows intentional double-booking override).
    if (!allowOverride) {
      // gridDur must match what the slot picker shows — exclude the generic defaultBuffer
      // (15 min) that was added to endAt for the hold-overlap window only.
      // Using duration+buffer caused end-of-day slots that the picker marked as
      // available to be rejected at commit time (e.g. 60 min service near closing
      // → grid check uses 75 min → slot appears unavailable).
      const gridDur = Math.max(
        15,
        Math.min(
          480,
          body.services && Array.isArray(body.services) && body.services.length > 0
            ? // Multi-service: sum of per-service (duration + svcBuffer) — already correct
              Math.round((endAt.getTime() - startAt.getTime()) / 60000)
            : // Simple booking: use the raw duration only, no defaultBuffer
              Math.round(Number(body.duration_minutes ?? 60)),
        ),
      );
      const staffSet =
        body.services && Array.isArray(body.services) && body.services.length > 0
          ? [
              ...new Set(
                (body.services as { staffId?: string; staff_id?: string }[])
                  .map((s) => s.staffId || s.staff_id)
                  .filter((x): x is string => !!x),
              ),
            ]
          : staffId
            ? [staffId]
            : [];
      const staffIdsCsvForGrid = staffSet.length > 0 ? staffSet.join(",") : null;

      const offeringIdsForGrid: string[] =
        body.services && Array.isArray(body.services) && body.services.length > 0
          ? [
              ...new Set(
                (body.services as { serviceId?: string; service_id?: string; offering_id?: string }[])
                  .map((s) => s.serviceId || s.service_id || s.offering_id)
                  .filter((x): x is string => !!x),
              ),
            ]
          : [body.offering_id, body.service_id].filter((x): x is string => !!x);

      const locType = (bookingData.location_type as string) || "at_salon";
      const mode = locType === "at_home" ? "mobile" : "salon";
      const travelBufferRaw = mode === "mobile" ? null : "0";

      const slotEval = await evaluateProviderSlotAgainstGrid(supabaseAdmin as any, {
        providerId,
        scheduledAt: startAt,
        durationMinutes: gridDur,
        staffIdsCsv: staffIdsCsvForGrid,
        locationId,
        excludeBookingId: undefined,
        excludeGroupBookingId,
        mode,
        travelBufferRaw,
        minNoticeMinutes: 0,
        maxAdvanceDays: 365,
        resourceOfferingIds: offeringIdsForGrid,
      });
      if (!slotEval.ok) {
        return errorResponse(
          slotEval.conflicts[0] ??
            "This time slot is not available for this provider calendar.",
          "SLOT_NOT_AVAILABLE",
          409,
        );
      }
    }

    // Pre-compute required resource IDs for atomic allocation inside the RPC
    let requiredResourceIds: string[] = [];
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {
      try {
        const { getRequiredResourcesForOffering } = await import("@/lib/resources/assignment");
        const allResourceIds = new Set<string>();
        for (const svc of body.services) {
          const offeringId = svc.serviceId || svc.service_id || svc.offering_id;
          if (!offeringId) continue;
          const required = await getRequiredResourcesForOffering(supabaseAdmin as any, offeringId);
          required.forEach((rid: string) => allResourceIds.add(rid));
        }
        requiredResourceIds = Array.from(allResourceIds);
      } catch (resErr) {
        console.warn("Could not pre-compute required resources:", resErr);
      }
    }

    let booking: any;

    if (useRpcPath) {
      // Build RPC payload (booking_services shape for create_booking_with_locking)
      const pBookingServices =
        body.services && Array.isArray(body.services) && body.services.length > 0
          ? (() => {
              let cursor = new Date(body.services[0].scheduled_start_at || bookingData.scheduled_at);
              return body.services.map((service: any) => {
                const duration = service.duration ?? service.duration_minutes ?? 60;
                const start = new Date(cursor);
                const end = new Date(cursor.getTime() + duration * 60 * 1000);
                cursor = new Date(end.getTime() + (service.buffer_minutes ?? 0) * 60 * 1000);
                return {
                  offering_id: service.serviceId || service.service_id || service.offering_id,
                  staff_id: service.staffId || service.staff_id || staffId,
                  duration_minutes: duration,
                  price: service.price ?? 0,
                  currency: service.currency || lastResortCurrency,
                  scheduled_start_at: start.toISOString(),
                  scheduled_end_at: end.toISOString(),
                };
              });
            })()
          : (() => {
              const start = new Date(bookingData.scheduled_at);
              const duration = body.duration_minutes ?? 60;
              const end = new Date(start.getTime() + duration * 60 * 1000);
              return [
                {
                  offering_id: body.offering_id || body.service_id,
                  staff_id: staffId,
                  duration_minutes: duration,
                  price: body.price ?? 0,
                  currency: body.currency || lastResortCurrency,
                  scheduled_start_at: start.toISOString(),
                  scheduled_end_at: end.toISOString(),
                },
              ];
            })();

      const pEndAt =
        body.services?.length > 0
          ? (() => {
              let c = new Date(body.services[0].scheduled_start_at || bookingData.scheduled_at);
              for (const s of body.services) {
                const dur = s.duration ?? s.duration_minutes ?? 60;
                const buf = s.buffer_minutes ?? 0;
                c = new Date(c.getTime() + (dur + buf) * 60 * 1000);
              }
              return c.toISOString();
            })()
          : endAt.toISOString();

      const { data: bookingId, error: rpcError } = await supabaseAdmin.rpc("create_booking_with_locking", {
        p_booking_data: bookingData,
        p_booking_services: pBookingServices,
        p_staff_id: staffId,
        p_start_at: startAt.toISOString(),
        p_end_at: pEndAt,
        p_entitlement_id: null,
        p_entitlement_customer_id: null,
        p_resource_ids: requiredResourceIds.length > 0 ? requiredResourceIds : null,
        p_resource_start_at: requiredResourceIds.length > 0 ? startAt.toISOString() : null,
        p_resource_end_at: requiredResourceIds.length > 0 ? endAt.toISOString() : null,
      });

      if (rpcError) {
        const msg = (rpcError as { message?: string }).message ?? "";
        if (msg.includes("BOOKING_SLOT_CONFLICT")) {
          return errorResponse(
            "This time slot is no longer available. Please select another time.",
            "CONFLICT",
            409
          );
        }
        if (msg.includes("RESOURCE_CONFLICT")) {
          return errorResponse(
            "A required resource (room/equipment) is not available at this time. Please select another time or remove the resource requirement.",
            "RESOURCE_CONFLICT",
            409
          );
        }
        console.error("RPC create_booking_with_locking error:", rpcError);
        return errorResponse(
          "A database error occurred while saving the booking. Please try again.",
          "DB_ERROR",
          500,
        );
      }
      if (!bookingId) {
        console.error("RPC create_booking_with_locking returned no booking ID");
        return errorResponse(
          "The booking could not be created: the database did not return a booking ID. Please try again.",
          "DB_NO_RESULT",
          500,
        );
      }

      const createdBookingId = String(bookingId);

      // Set provider-only fields not handled by the locking RPC. Keep this
      // separate from the reload so an embedded-select/schema issue cannot
      // turn a successfully-created booking into a partial failure.
      const { error: postRpcUpdateErr } = await supabaseAdmin
        .from("bookings")
        .update({
          booking_source: bookingSource,
          referral_source_id: referralSourceId,
          discount_reason: body.discount_reason ?? null,
          ...(providerFormResponses ? { provider_form_responses: providerFormResponses } : {}),
        })
        .eq("id", createdBookingId);

      if (postRpcUpdateErr) {
        console.warn("Booking created, but provider-only post-RPC fields could not be patched:", {
          bookingId: createdBookingId,
          error: postRpcUpdateErr,
        });
      }

      const { data: createdBooking, error: fetchErr } = await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("id", createdBookingId)
        .maybeSingle();

      if (fetchErr) {
        console.warn("Booking created, but post-RPC reload failed; using request payload fallback:", {
          bookingId: createdBookingId,
          error: fetchErr,
        });
      }

      booking = createdBooking;
      if (!booking) {
        booking = {
          ...bookingData,
          id: createdBookingId,
          booking_number: null,
          booking_source: bookingSource,
          referral_source_id: referralSourceId,
          discount_reason: body.discount_reason ?? null,
          provider_form_responses: providerFormResponses ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      console.log("Booking created successfully via RPC:", booking.id);

      // §Provider-audit 2026-04: RPC `create_booking_with_locking` does not
      // carry per-service customization through its jsonb payload; patch it
      // in after creation for any services that had a non-empty value.
      if (body.services && Array.isArray(body.services)) {
        const customizationByOffering = new Map<string, string>();
        for (const s of body.services as any[]) {
          const offeringId = s?.serviceId || s?.service_id || s?.offering_id;
          const cust = typeof s?.customization === "string" ? s.customization.trim() : "";
          if (offeringId && cust.length > 0) {
            customizationByOffering.set(String(offeringId), cust);
          }
        }
        if (customizationByOffering.size > 0) {
          for (const [offeringId, cust] of customizationByOffering) {
            const { error: custErr } = await supabaseAdmin
              .from("booking_services")
              .update({ customization: cust })
              .eq("booking_id", booking.id)
              .eq("offering_id", offeringId);
            if (custErr) {
              // Non-fatal — booking is still usable; surface in logs for debugging.
              console.warn(
                `[provider/bookings] customization patch failed for booking ${booking.id}, offering ${offeringId}:`,
                custErr,
              );
            }
          }
        }
      }
    } else {
      // Direct insert (no staff, or provider allows double-booking override)
      console.log("Inserting booking with data:", JSON.stringify(bookingData, null, 2));
      const { data: insertedBooking, error } = await supabaseAdmin
        .from("bookings")
        .insert(bookingData)
        .select("*")
        .single();

      if (error) {
        console.error("Error inserting booking:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        // §Group-booking-audit 2026-05: surface the real Postgres message
        // (validate_booking_total CHECK violation, FK violation, etc.) so
        // provider clients — especially the mobile group-creation flow —
        // can report exactly which constraint blocked the booking instead
        // of just "database error". Strip stack/internal hints by limiting
        // to the well-known PostgresError-style fields.
        const dbCode = (error as { code?: string }).code ?? null;
        const dbMessage = (error as { message?: string }).message ?? "";
        const dbHint = (error as { hint?: string }).hint ?? null;
        const dbDetail = (error as { details?: string }).details ?? null;
        const bookingNumberUniqueViolation =
          dbCode === "23505" &&
          (dbMessage.includes("bookings_tenant_id_booking_number_key") ||
            dbMessage.includes("tenant_id_booking_number"));
        const friendlyMessage = bookingNumberUniqueViolation
          ? "Could not save the booking: duplicate booking reference for this business. Please try again; the system will assign a new reference."
          : dbMessage
            ? `Could not save the booking: ${dbMessage}`
            : "A database error prevented the booking from being saved. Please try again.";
        return errorResponse(
          friendlyMessage,
          bookingNumberUniqueViolation
            ? "BOOKING_NUMBER_CONFLICT"
            : dbCode === "23514"
              ? "CHECK_VIOLATION"
              : dbCode === "23503"
                ? "FK_VIOLATION"
                : dbCode === "23505"
                  ? "UNIQUE_VIOLATION"
                  : "DB_ERROR",
          500,
          { db_code: dbCode, hint: dbHint, detail: dbDetail },
        );
      }
      if (!insertedBooking) {
        console.error("No booking returned from insert");
        return errorResponse(
          "The booking could not be created: the database did not return a record. Please try again.",
          "DB_NO_RESULT",
          500,
        );
      }
      booking = insertedBooking;
      console.log("Booking created successfully:", booking.id);

      // Create booking_services records when not using RPC.
      // §Provider-audit 2026-04: previously a failed booking_services insert
      // only logged; the booking row would exist with no line items (orphan).
      // Now: on failure we compensate by deleting the booking and surface a
      // real error so the client can retry cleanly. We also persist the
      // per-service `customization` string (DB column exists — see
      // migration 464_booking_services_customization.sql).
      if (body.services && Array.isArray(body.services) && body.services.length > 0) {
        const bookingServicesData = body.services.map((service: any) => {
          const startAtS = service.scheduled_start_at || booking.scheduled_at;
          const duration = service.duration || service.duration_minutes || 60;
          const start = new Date(startAtS);
          const end = new Date(start.getTime() + duration * 60 * 1000);
          const customization =
            typeof service.customization === "string" && service.customization.trim().length > 0
              ? service.customization.trim()
              : null;
          return {
            booking_id: booking.id,
            offering_id: service.serviceId || service.service_id || service.offering_id,
            staff_id: service.staffId || service.staff_id || body.team_member_id || body.staff_id || null,
            duration_minutes: duration,
            price: service.price || 0,
            currency: service.currency || lastResortCurrency,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
            ...(customization ? { customization } : {}),
          };
        });
        const { error: bsError } = await supabaseAdmin.from("booking_services").insert(bookingServicesData);
        if (bsError) {
          console.error("Error creating booking_services — rolling back booking:", bsError);
          await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
          return errorResponse(
            "The booking could not be saved because the service items failed to save. The booking has been rolled back — please try again.",
            "SERVICES_FAILED",
            500,
          );
        }
        console.log("Booking services created:", bookingServicesData.length);
      } else if (body.service_id || body.offering_id) {
        const offeringId = body.offering_id || body.service_id;
        const duration = body.duration_minutes || 60;
        const start = new Date(booking.scheduled_at);
        const end = new Date(start.getTime() + duration * 60 * 1000);
        const bookingServiceData = {
          booking_id: booking.id,
          offering_id: offeringId,
          staff_id: body.team_member_id || body.staff_id || null,
          duration_minutes: duration,
          price: body.price || 0,
          currency: body.currency || lastResortCurrency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        };
        const { error: bsError } = await supabaseAdmin.from("booking_services").insert(bookingServiceData);
        if (bsError) {
          console.error("Error creating booking_services — rolling back booking:", bsError);
          await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
          return errorResponse(
            "The booking could not be saved because the service item failed to save. The booking has been rolled back — please try again.",
            "SERVICE_FAILED",
            500,
          );
        }
      }
    }

    // Create addons / products / notification (shared for both paths)
    if (body.services && Array.isArray(body.services) && body.services.length > 0) {

      // Persist add-ons to booking_addons (addon_id = offering id, price from offerings)
      const addonIds = (body.services || [])
        .flatMap((s: any) => (Array.isArray(s.add_on_ids) ? s.add_on_ids : []))
        .filter(Boolean);
      if (addonIds.length > 0) {
        const { data: addonOfferings } = await supabaseAdmin
          .from("offerings")
          .select("id, price")
          .in("id", addonIds);
        const priceByAddonId = new Map((addonOfferings || []).map((o: any) => [o.id, Number(o.price || 0)]));
        const bookingAddonsData = addonIds.map((addonId: string) => ({
          booking_id: booking.id,
          addon_id: addonId,
          quantity: 1,
          price: priceByAddonId.get(addonId) ?? 0,
          currency: body.currency || lastResortCurrency,
        }));
        const { error: baError } = await supabaseAdmin
          .from("booking_addons")
          .insert(bookingAddonsData);
        if (baError) {
          console.error("Error creating booking_addons:", baError);
        }
      }
    }

    // Create booking_products records for each product
    if (validatedProducts.length > 0) {
      const primaryStaffId = body.team_member_id || body.staff_id || null;
      const bookingProductsData = validatedProducts.map((product) => ({
        booking_id: booking.id,
        product_id: product.productId,
        product_variant_id: product.productVariantId,
        quantity: product.quantity,
        unit_price: product.unitPrice,
        total_price: product.totalPrice,
        currency: product.currency || booking.currency || lastResortCurrency,
        staff_id: primaryStaffId,
      }));

      const { error: bpError } = await supabaseAdmin
        .from("booking_products")
        .insert(bookingProductsData);

      if (bpError) {
        console.error("Error creating booking_products — rolling back booking:", bpError);
        await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
        return errorResponse(
          `Failed to create booking products: ${bpError.message ?? "unknown error"}`,
          "BOOKING_PRODUCTS_FAILED",
          422,
          { db: bpError },
        );
      } else {
        console.log("Booking products created:", bookingProductsData.length);
      }

      try {
        await syncAppointmentProductOrder(supabaseAdmin as never, booking.id);
      } catch (orderSyncError) {
        console.error(
          `[provider/bookings create] failed to sync appointment product order — rolling back booking ${booking.id}:`,
          orderSyncError,
        );
        await supabaseAdmin.from("product_orders").delete().eq("booking_id", booking.id);
        await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
        const msg =
          orderSyncError instanceof Error
            ? orderSyncError.message
            : "Failed to sync product order for this appointment";
        return errorResponse(msg, "PRODUCT_SYNC_FAILED", 422, {
          cause: orderSyncError instanceof Error ? orderSyncError.stack : String(orderSyncError),
        });
      }

      // §Provider-audit 2026-04 (round 3): if this booking is being
      // created directly in `completed` status (e.g. a retroactive
      // entry, walk-in finalised at checkout), deduct retail stock
      // immediately. The PATCH path in `[id]/route.ts` handles the
      // normal pending→completed transition. Without this branch,
      // bookings that skip the transition would never deduct.
      const initialStatus = (booking as { status?: string } | null)?.status;
      if (initialStatus === "completed") {
        try {
          const { data: pendingProducts } = await supabaseAdmin
            .from("booking_products")
            .select("id, product_id, product_variant_id, quantity, products:products!booking_products_product_id_fkey(track_stock_quantity)")
            .eq("booking_id", booking.id)
            .is("stock_deducted_at", null);
          if (Array.isArray(pendingProducts) && pendingProducts.length > 0) {
            const deductTs = new Date().toISOString();
            for (const row of pendingProducts as Array<{
              id: string;
              product_id: string | null;
              product_variant_id?: string | null;
              quantity: number | null;
              products?: { track_stock_quantity?: boolean | null } | null;
            }>) {
              if (!row.product_id || !row.quantity || row.quantity <= 0) continue;
              if (row.products?.track_stock_quantity === false) continue;
              const { error: decErr } = row.product_variant_id
                ? await (supabaseAdmin.rpc as any)("decrement_product_variant_stock", {
                  p_variant_id: row.product_variant_id,
                  p_quantity: row.quantity,
                })
                : await supabaseAdmin.rpc(
                  "decrement_product_stock",
                  { p_product_id: row.product_id, p_quantity: row.quantity },
                );
              if (decErr) {
                console.error(
                  `[provider/bookings create] decrement_product_stock failed for booking ${booking.id}, row ${row.id}:`,
                  decErr,
                );
                throw new Error(decErr.message || "Product stock could not be deducted");
              }
              await supabaseAdmin
                .from("booking_products")
                .update({ stock_deducted_at: deductTs })
                .eq("id", row.id);
            }
          }
        } catch (stockErr) {
          console.error(
            "[provider/bookings create] failed to deduct retail stock:",
            stockErr,
          );
          await supabaseAdmin.from("product_orders").delete().eq("booking_id", booking.id);
          await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
          return errorResponse(
            stockErr instanceof Error
              ? stockErr.message
              : "Product stock could not be deducted for this completed booking.",
            "INSUFFICIENT_STOCK",
            400,
          );
        }
      }
    }

    // Record a booking_payments row for manually collected payments so that:
    // 1. The update_booking_payment_status trigger sets total_paid correctly
    // 2. The create_finance_ledger_from_payment trigger creates finance_transactions
    // 3. End-of-day reports (which query booking_payments) include this revenue
    // 4. Payout balance calculations (which use finance_transactions) are accurate
    if ((body.payment_method === "cash" || body.payment_method === "card") && finalTotalAmount > 0) {
      const collectedAmount = body.payment_option === "deposit" && body.deposit_amount
        ? Number(body.deposit_amount)
        : finalTotalAmount;
      const { error: paymentRowError } = await supabaseAdmin
        .from("booking_payments")
        .insert({
          booking_id: booking.id,
          amount: collectedAmount,
          payment_method: body.payment_method === "card" ? "card" : "cash",
          payment_provider: body.payment_method === "card" ? "manual" : "cash",
          status: "completed",
          notes: body.payment_option === "deposit"
            ? `${body.payment_method === "card" ? "Manual card" : "Cash"} deposit collected at booking creation (${body.deposit_percentage ?? 0}%)`
            : `${body.payment_method === "card" ? "Manual card" : "Cash"} payment recorded at booking creation`,
          created_by: user.id,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        });
      if (paymentRowError) {
        console.warn("Failed to insert booking_payments row for manual payment:", paymentRowError);
      }
    }

    // Resource allocation: if the RPC path was used and resources were passed, they are already
    // allocated atomically inside the transaction. For the non-RPC path (or if pre-computation
    // failed), fall back to post-commit assignment with warnings.
    const resourceWarnings: string[] = [];
    const resourcesAllocatedViaRpc = useRpcPath && requiredResourceIds.length > 0;
    if (!resourcesAllocatedViaRpc && requiredResourceIds.length > 0) {
      try {
        const { checkResourceAvailability, assignResourcesToBooking } =
          await import("@/lib/resources/assignment");
        const resourceCheck = await checkResourceAvailability(
          supabaseAdmin as any,
          requiredResourceIds,
          startAt,
          endAt,
          booking.id,
        );
        if (resourceCheck.available) {
          const assignments = requiredResourceIds.map((rid) => ({
            booking_id: booking.id,
            resource_id: rid,
            scheduled_start_at: startAt.toISOString(),
            scheduled_end_at: endAt.toISOString(),
          }));
          await assignResourcesToBooking(supabaseAdmin as any, assignments);
        } else {
          const conflictIds = resourceCheck.conflicts.map((c) => c.resource_id);
          let conflictNames = "";
          if (conflictIds.length > 0) {
            const { data: names } = await supabaseAdmin
              .from("resources")
              .select("id, name")
              .in("id", conflictIds);
            conflictNames = (names || []).map((n) => n.name).filter(Boolean).join(", ");
          }
          resourceWarnings.push(
            conflictNames
              ? `Required resources unavailable: ${conflictNames}. Assign manually from the booking details.`
              : "One or more required resources (room/equipment) are unavailable at this time. Assign manually from the booking details."
          );
        }
      } catch (resourceErr) {
        console.warn("Resource auto-assignment skipped:", resourceErr);
        resourceWarnings.push("Resource assignment could not be completed automatically. Check resource availability manually.");
      }
    }

    // Transform to match Booking type (partial row → full Booking shape at runtime)
    const transformedBooking = {
      id: booking.id,
      booking_number: booking.booking_number,
      customer_id: booking.customer_id,
      provider_id: booking.provider_id,
      status: mapStatusFromDatabase(booking.status) as Booking["status"],
      location_type: booking.location_type,
      location_id: booking.location_id,
      // Construct address object from individual columns
      address: booking.address_line1 ? {
        line1: booking.address_line1,
        line2: booking.address_line2,
        city: booking.address_city,
        state: booking.address_state,
        country: booking.address_country,
        postal_code: booking.address_postal_code,
      } : null,
      scheduled_at: booking.scheduled_at,
      completed_at: booking.completed_at || null,
      cancelled_at: booking.cancelled_at || null,
      cancellation_reason: booking.cancellation_reason || null,
      // Services are fetched from booking_services table, passed via body.services for the response
      services: body.services || [],
      addons: body.addons || [],
      package_id: booking.package_id || null,
      subtotal: booking.subtotal || 0,
      tip_amount: booking.tip_amount || 0,
      total_amount: booking.total_amount || 0,
      currency: booking.currency || lastResortCurrency,
      payment_status: booking.payment_status,
      payment_method: null, // payment_method is not a column, it's payment_method_id
      special_requests: booking.special_requests || null,
      loyalty_points_earned: booking.loyalty_points_earned || 0,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
    } as unknown as Booking;

    // Notify customer unless provider explicitly opted out via send_notification: false
    const shouldNotify = body.send_notification !== false;
    if (shouldNotify) {
      void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
        insertNotification({
          user_id: customerId,
          type: "new_appointment",
          title: "New Appointment Created",
          message: `An appointment has been created for you. Booking ${booking.booking_number || booking.id.slice(0, 8)}.`,
          data: {
            booking_id: booking.id,
            booking_number: booking.booking_number,
            provider_id: providerId,
          },
          action_url: `/account-settings/bookings/${booking.id}`,
        })
      );

      void import("@/lib/notifications/notification-service").then(({ notifyBookingConfirmed }) =>
        notifyBookingConfirmed(booking.id, ['email', 'push'])
          .catch((e) => console.warn("Booking confirmation notification:", e))
      );
    }

    const paymentLinkWarnings: string[] = [];
    if (body.payment_method === "payment_link") {
      if (!shouldNotify) {
        paymentLinkWarnings.push("Payment link was not sent because customer notifications are disabled for this booking.");
      } else {
        try {
          const bookingRef = booking.booking_number || booking.id.slice(0, 8).toUpperCase();
          const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
          const paymentLink = `${appBase}/bookings/${booking.id}/pay`;
          const amountDue = computeBookingOutstandingDisplay({
            totalAmount: Number(booking.total_amount ?? finalTotalAmount),
            totalPaid: Number(booking.total_paid ?? 0),
            totalRefunded: Number(booking.total_refunded ?? 0),
            walletAmount: Number(booking.wallet_amount ?? 0),
            giftCardAmount: Number(booking.gift_card_amount ?? 0),
            unpaidAdditionalCharges: 0,
            paymentStatus: booking.payment_status,
          });
          const { format: formatMoney } = await getTenantMoneyFormatter(
            (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
          );
          const { data: customerContact } = await supabaseAdmin
            .from("users")
            .select("email, phone")
            .eq("id", customerId)
            .maybeSingle();
          const customerEmail = (customerContact as { email?: string | null } | null)?.email;
          const customerPhone = (customerContact as { phone?: string | null } | null)?.phone;
          const { insertNotification } = await import("@/lib/notifications/insert-notification");
          await insertNotification({
            user_id: customerId,
            type: "payment_link_sent",
            title: "Payment Link Ready",
            message: `Pay ${formatMoney(amountDue)} for booking ${bookingRef}. Open: ${paymentLink}`,
            data: {
              booking_id: booking.id,
              booking_ref: bookingRef,
              amount: amountDue,
              payment_link: paymentLink,
              source: "provider_booking_create",
            },
            action_url: paymentLink,
          });

          try {
            const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
            const channels: ("push" | "email" | "sms")[] = ["push"];
            if (customerEmail) channels.push("email");
            if (customerPhone) channels.push("sms");
            await sendTemplateNotification(
              "payment_pending",
              [customerId],
              {
                amount: formatMoney(amountDue),
                booking_number: String(bookingRef),
                payment_method: "Paystack",
                booking_id: booking.id,
                payment_link: paymentLink,
              },
              channels,
              { appType: "customer" },
            );
          } catch (pushError) {
            console.warn("Payment-link notification delivery failed after provider-created booking:", pushError);
            paymentLinkWarnings.push("Payment link was created, but push/email/SMS delivery could not be confirmed.");
          }
        } catch (paymentLinkError) {
          console.warn("Payment link notification failed after provider-created booking:", paymentLinkError);
          paymentLinkWarnings.push("Booking was created, but the payment link could not be sent automatically. Send it from booking details.");
        }
      }
    }

    void import("@/lib/subscriptions/subscription-limit-notifications")
      .then((m) => m.maybeNotifyProviderSubscriptionLimits(providerId))
      .catch((e) => console.warn("Subscription usage notification:", e));

    const responsePayload: any = transformedBooking;
    const responseWarnings = [...resourceWarnings, ...paymentLinkWarnings];
    if (responseWarnings.length > 0) {
      responsePayload._warnings = responseWarnings;
    }
    return successResponse(responsePayload);
  } catch (error) {
    return handleApiError(error, "Failed to create booking");
  }
}

export async function GET(request: NextRequest) {
  return withRouteMetrics(request, "/api/provider/bookings", "GET", () => handleGetProviderBookings(request));
}

export async function POST(request: NextRequest) {
  return withRouteMetrics(request, "/api/provider/bookings", "POST", () => handleCreateProviderBooking(request));
}