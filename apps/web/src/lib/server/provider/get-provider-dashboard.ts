import "server-only";

import { NextRequest } from 'next/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { format, subDays } from "date-fns";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatProviderPortalLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";
import { mapStatusToProvider } from "@/lib/utils/booking-status";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { fromBusinessTime, formatInTz, nowInTz, resolveTz } from "@/lib/dates/provider-tz";
import { buildProviderActivityFeed } from "@/lib/provider/build-provider-activity-feed";

const DASHBOARD_CACHE_TTL_MS = 5000;
const MAX_DASHBOARD_CACHE_ENTRIES = 400;
const dashboardResponseCache = new Map<string, { expiresAt: number; data: any }>();

const PENDING_BOOKING_STATUSES = new Set(["pending", "pending_payment"]);
const CONFIRMED_BOOKING_STATUSES = new Set(["confirmed", "waiting", "checked_in"]);
const ACTIVE_BOOKING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
]);
const SCHEDULE_COUNT_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
  "completed",
]);

function pruneDashboardResponseCache(now: number): void {
  for (const [key, entry] of dashboardResponseCache.entries()) {
    if (entry.expiresAt <= now) {
      dashboardResponseCache.delete(key);
    }
  }
  if (dashboardResponseCache.size <= MAX_DASHBOARD_CACHE_ENTRIES) {
    return;
  }
  const overflow = dashboardResponseCache.size - MAX_DASHBOARD_CACHE_ENTRIES;
  const keys = Array.from(dashboardResponseCache.keys());
  for (let i = 0; i < overflow; i += 1) {
    dashboardResponseCache.delete(keys[i]);
  }
}

/**
 * Shared dashboard payload for GET /api/provider/dashboard and RSC (direct call — no HTTP hop).
 */
export async function getProviderDashboardResponse(request: NextRequest) {
  try {
    // Require provider_owner or provider_staff role
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    // Get location_id from query params if provided
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('location_id');
    const includeInsights = searchParams.get("include") === "insights";

    // Use service role client for all queries to avoid RLS infinite recursion
    // This is safe because we're already authenticated and checking user_id matches
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const cacheKey = `${providerId}:${locationId || "all"}:${includeInsights ? "insights" : "base"}`;
    const cached = dashboardResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedResponse = successResponse(cached.data);
      cachedResponse.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
      return cachedResponse;
    }

    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id, tenant_id, status, business_name, rating_average, review_count, offers_mobile_services, max_service_distance_km, timezone')
      .eq('id', providerId)
      .maybeSingle();
    if (providerError || !providerData) {
      return handleApiError(
        new Error(providerError?.message ?? 'Provider not found'),
        'PROVIDER_FETCH_ERROR',
        500
      );
    }

    // Provider visibility: what service types they offer (for identity strip)
    const supportsHouseCalls = providerData.offers_mobile_services !== false;
    const { count: salonLocationCount } = await supabaseAdmin
      .from('provider_locations')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .eq('location_type', 'salon');
    const supportsSalon = (salonLocationCount ?? 0) > 0;
    const maxServiceDistanceKm = providerData.max_service_distance_km ?? null;

    const providerTz = resolveTz((providerData as { timezone?: string | null }).timezone);
    const now = new Date();
    const businessNow = nowInTz(providerTz);
    const startOfTodayLocal = new Date(businessNow);
    startOfTodayLocal.setHours(0, 0, 0, 0);
    const startOfToday = fromBusinessTime(startOfTodayLocal, providerTz);
    const startOfWeekLocal = new Date(startOfTodayLocal);
    startOfWeekLocal.setDate(startOfTodayLocal.getDate() - startOfTodayLocal.getDay());
    const startOfWeek = fromBusinessTime(startOfWeekLocal, providerTz);
    const startOfMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 1, 0, 0, 0, 0),
      providerTz,
    );
    const startOfLastMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth() - 1, 1, 0, 0, 0, 0),
      providerTz,
    );
    const endOfLastMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 0, 23, 59, 59, 999),
      providerTz,
    );

    // Optimize: Get only necessary fields for faster queries
    // Load status, created_at, scheduled_at, and location_type in parallel with finance data
    // Build bookings query with optional location filter
    // IMPORTANT: Include 'id' and 'location_type' fields for location filtering and metrics
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('id, status, created_at, scheduled_at, location_id, location_type')
      .eq('provider_id', providerId);
    
    // If location filter is provided, show bookings for that location
    // When no location is selected, show all bookings (including those with NULL location_id)
    // Note: Bookings with NULL location_id (walk-in clients) are only shown when no location filter is applied
    if (locationId) {
      bookingsQuery = bookingsQuery.eq('location_id', locationId);
    }
    // When no locationId is provided, the query will return all bookings including NULL location_id

    // For finance transactions, we need to filter by location through bookings
    // This requires a join or subquery. For now, we'll filter finance transactions
    // by checking if they're related to bookings with the selected location
    const financeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, created_at, booking_id")
      .eq("provider_id", providerId);
    
    // If location filter is provided, we'll need to filter finance transactions
    // by joining with bookings. For performance, we'll do this in memory after fetching
    const [bookingsResult, ledgerResult] = await Promise.all([
      bookingsQuery,
      financeQuery
    ]);

    if (bookingsResult.error) {
      throw bookingsResult.error;
    }

    const allBookings = bookingsResult.data || [];
    const totalBookings = allBookings.length;
    
    // Debug: Log booking statuses to help diagnose issues
    if (process.env.NODE_ENV === 'development') {
      const statusCounts = allBookings.reduce((acc: Record<string, number>, booking: any) => {
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
      }, {});
      console.log('Dashboard booking status counts:', {
        total: totalBookings,
        statusCounts,
        locationId: locationId || 'all',
      });
    }
    
    // Count by status (single pass through array - faster than multiple filters)
    let activeBookings = 0;
    let confirmedBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    let noShowBookings = 0;
    let pendingBookings = 0;
    
    // Count by location_type for at-home vs at-salon breakdown
    let atHomeBookings = 0;
    let atSalonBookings = 0;
    let atHomeCompleted = 0;
    let atSalonCompleted = 0;
    let atHomeConfirmed = 0;
    let atSalonConfirmed = 0;
    let atHomePending = 0;
    let atSalonPending = 0;
    let atHomeCancelled = 0;
    let atSalonCancelled = 0;
    let atHomeNoShow = 0;
    let atSalonNoShow = 0;
    
    for (const booking of allBookings) {
      const status = String(booking.status || "");
      const isAtHome = booking.location_type === "at_home";
      const isAtSalon = booking.location_type === "at_salon";

      if (ACTIVE_BOOKING_STATUSES.has(status)) {
        activeBookings++;
      }

      // Count by status
      if (CONFIRMED_BOOKING_STATUSES.has(status)) {
        confirmedBookings++;
        if (isAtHome) atHomeConfirmed++;
        else if (isAtSalon) atSalonConfirmed++;
      } else if (PENDING_BOOKING_STATUSES.has(status)) {
        pendingBookings++;
        if (isAtHome) atHomePending++;
        else if (isAtSalon) atSalonPending++;
      } else {
        switch (status) {
          case 'completed': 
            completedBookings++; 
            if (isAtHome) atHomeCompleted++;
            else if (isAtSalon) atSalonCompleted++;
            break;
          case 'cancelled': 
            cancelledBookings++; 
            if (isAtHome) atHomeCancelled++;
            else if (isAtSalon) atSalonCancelled++;
            break;
          case 'no_show': 
            noShowBookings++; 
            if (isAtHome) atHomeNoShow++;
            else if (isAtSalon) atSalonNoShow++;
            break;
        }
      }

      // Count by location_type
      if (isAtHome) {
        atHomeBookings++;
      } else if (isAtSalon) {
        atSalonBookings++;
      }
    }

    // Calculate time-based metrics in single pass (optimized)
    let upcomingBookingsToday = 0;
    let bookingsScheduledThisWeek = 0;
    let bookingsScheduledThisMonth = 0;
    
    const todayEndLocal = new Date(startOfTodayLocal);
    todayEndLocal.setDate(startOfTodayLocal.getDate() + 1);
    const todayEnd = fromBusinessTime(todayEndLocal, providerTz);
    const startOfNextWeekLocal = new Date(startOfWeekLocal);
    startOfNextWeekLocal.setDate(startOfWeekLocal.getDate() + 7);
    const startOfNextWeek = fromBusinessTime(startOfNextWeekLocal, providerTz);
    const startOfNextMonth = fromBusinessTime(
      new Date(businessNow.getFullYear(), businessNow.getMonth() + 1, 1, 0, 0, 0, 0),
      providerTz,
    );
    
    for (const booking of allBookings) {
      const scheduledDate = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
      const status = String(booking.status || "");
      
      if (!scheduledDate || !SCHEDULE_COUNT_STATUSES.has(status)) continue;
      
      if (scheduledDate >= startOfToday && scheduledDate < todayEnd) {
        upcomingBookingsToday++;
      }
      
      if (scheduledDate >= startOfWeek && scheduledDate < startOfNextWeek) {
        bookingsScheduledThisWeek++;
      }
      
      if (scheduledDate >= startOfMonth && scheduledDate < startOfNextMonth) {
        bookingsScheduledThisMonth++;
      }
    }

    // Revenue streams from finance ledger (already loaded in parallel above)
    let rows = ledgerResult.data || [];
    
    // Filter finance transactions by location if location_id is provided
    // We need to join with bookings to get location_id
    if (locationId && rows.length > 0) {
      // Get booking IDs for the selected location
      const locationBookingIds = new Set(
        allBookings.map((b: any) => b.id)
      );
      
      // Filter finance transactions to only those related to bookings in this location
      rows = rows.filter((r: any) => {
        // If transaction has booking_id, check if booking is in selected location
        if (r.booking_id) {
          return locationBookingIds.has(r.booking_id);
        }
        // For transactions without booking_id (e.g., gift cards, memberships),
        // we might want to include them or exclude them based on business logic
        // For now, exclude them when filtering by location
        return false;
      });
    }
    
    // Optimize: Pre-filter and pre-parse dates for faster processing
    const parsedRows = rows.map((r: any) => ({
      ...r,
      createdDate: new Date(r.created_at),
      netValue: Number(r.net ?? r.amount ?? 0),
      amountValue: Number(r.amount || 0),
    }));

    // Optimized sum functions - single pass with pre-parsed data
    const sumNet = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.netValue;
      }
      return sum;
    };

    const sumAmount = (types: string[], start?: Date, end?: Date) => {
      let sum = 0;
      for (const r of parsedRows) {
        if (!types.includes(r.transaction_type)) continue;
        if (start && r.createdDate < start) continue;
        if (end && r.createdDate > end) continue;
        sum += r.amountValue;
      }
      return sum;
    };

    // Total provider revenue is the provider earnings stream (includes bookings, add-ons, gift cards, memberships, and refund impacts).
    const providerEarningsTotal = sumNet(["provider_earnings"]);
    const totalRevenue = providerEarningsTotal;

    // Gross sales (for reporting) — does not change provider net directly here.
    const giftCardSalesTotal = sumAmount(["gift_card_sale"]);
    const membershipSalesTotal = sumAmount(["membership_sale"]);

    // Travel line items: ledger rows use net=0 (travel is included in provider_earnings); use amount for display.
    const travelFeesToday = sumAmount(["travel_fee"], startOfToday);
    const travelFeesThisMonth = sumAmount(["travel_fee"], startOfMonth);
    const travelFeesLastMonth = sumAmount(["travel_fee"], startOfLastMonth, endOfLastMonth);
    const travelFeesTotal = sumAmount(["travel_fee"]);

    // Refund impact on provider earnings (negative provider_earnings rows) - optimized
    let refundsTotal = 0;
    for (const r of parsedRows) {
      if (r.transaction_type === "provider_earnings" && r.netValue < 0) {
        refundsTotal += r.netValue;
      }
    }

    const tipsTotal = sumAmount(["tip"]);
    const tipsThisMonth = sumAmount(["tip"], startOfMonth);

    const EXPENSE_TYPES = ["provider_subscription_payment", "provider_ads_payment", "provider_expense"];
    const expensesTotal = sumAmount(EXPENSE_TYPES);
    const expensesThisMonth = sumAmount(EXPENSE_TYPES, startOfMonth);

    let platformFeesPaid = 0;
    for (const r of parsedRows) {
      if (r.transaction_type === "payment") {
        platformFeesPaid += Math.abs(r.netValue);
      }
    }

    const revenueToday = sumNet(["provider_earnings"], startOfToday);
    const revenueThisWeek = sumNet(["provider_earnings"], startOfWeek);
    const revenueThisMonth = sumNet(["provider_earnings"], startOfMonth);
    const revenueLastMonth = sumNet(["provider_earnings"], startOfLastMonth, endOfLastMonth);

    const revenueGrowth =
      revenueLastMonth !== 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / Math.abs(revenueLastMonth)) * 100)
        : 0;

    // Keep dashboard available balance aligned with finance/payout APIs:
    // apply hold-days and exclude direct walk-in earnings that are not held by platform.
    const providerTenantId =
      (providerData as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabaseAdmin as any,
      table: "platform_settings",
      tenantId: providerTenantId,
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const payoutSettings = ((scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings as any)
      ?.payouts ?? {};
    const holdDays = Number(payoutSettings.payout_hold_days ?? 0);
    const { availableBalance } = await getAvailablePayoutBalance(supabaseAdmin as any, providerId, {
      holdDays,
      tenantId: providerTenantId,
    });
    
    // Calculate pending payments (unpaid bookings)
    let unpaidBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status")
      .eq("provider_id", providerId)
      .in("payment_status", ["pending", "partially_paid"])
      .not("status", "in", "(cancelled,no_show)");
    
    if (locationId) {
      unpaidBookingsQuery = unpaidBookingsQuery.eq('location_id', locationId);
    }
    
    const { data: unpaidBookings } = await unpaidBookingsQuery;

    const pendingPaymentsAmount =
      unpaidBookings?.reduce((sum, b) => {
        const total = Number((b as { total_amount?: number }).total_amount ?? 0);
        const paid = Number((b as { total_paid?: number }).total_paid ?? 0);
        const refunded = Number((b as { total_refunded?: number }).total_refunded ?? 0);
        const wallet = Number((b as { wallet_amount?: number }).wallet_amount ?? 0);
        const gift = Number((b as { gift_card_amount?: number }).gift_card_amount ?? 0);
        const effectivePaid = Math.max(0, paid - refunded);
        const outstanding = Math.max(0, total - effectivePaid - wallet - gift);
        return sum + outstanding;
      }, 0) || 0;
    const pendingPaymentsCount = unpaidBookings?.length || 0;

    let insights:
      | {
          weekly_revenue: Array<{ day: string; revenue: number }>;
          top_services: Array<{ service_name: string; booking_count: number; total_revenue: number }>;
          recent_activity: Array<{
            id: string;
            type: string;
            description: string;
            created_at: string;
            data?: { booking_id?: string; client_name?: string; amount?: number };
          }>;
          today_bookings: Array<{
            id: string;
            booking_number: string;
            status: string;
            scheduled_at: string;
            total_amount: number;
            currency: string;
            location_type: string;
            services: Array<{
              name?: string;
              offering_name?: string;
              duration_minutes: number;
              staff_name: string | null;
              guest_name?: string | null;
            }>;
            customers: { full_name: string; phone: string } | null;
            is_group_booking?: boolean;
            group_booking_id?: string | null;
            group_booking_ref?: string | null;
            package_name?: string | null;
            products?: Array<{ product_name?: string; quantity?: number }>;
          }>;
          upcoming_bookings: Array<{
            id: string;
            booking_number: string;
            status: string;
            scheduled_at: string;
            total_amount: number;
            currency: string;
            location_type: string;
            services: Array<{
              name?: string;
              offering_name?: string;
              duration_minutes: number;
              staff_name: string | null;
              guest_name?: string | null;
            }>;
            customers: { full_name: string; phone: string } | null;
            is_group_booking?: boolean;
            group_booking_id?: string | null;
            group_booking_ref?: string | null;
            package_name?: string | null;
            products?: Array<{ product_name?: string; quantity?: number }>;
          }>;
        }
      | null = null;

    let bookingEligibility:
      | {
          can_accept_online_bookings: boolean;
          booking_limit_message: string | null;
        }
      | null = null;

    if (includeInsights) {
      const weekStart = subDays(startOfToday, 6);
      const weekStartLocal = new Date(startOfTodayLocal);
      weekStartLocal.setDate(startOfTodayLocal.getDate() - 6);
      const revenueByDay = new Map<string, number>();
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(weekStartLocal);
        d.setDate(weekStartLocal.getDate() + i);
        revenueByDay.set(format(d, "yyyy-MM-dd"), 0);
      }
      for (const r of parsedRows) {
        if (r.transaction_type !== "provider_earnings") continue;
        if (r.createdDate < weekStart || r.createdDate > now) continue;
        const key = formatInTz(r.createdDate, "yyyy-MM-dd", providerTz);
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + r.netValue);
      }
      const weeklyRevenue = Array.from(revenueByDay.entries()).map(([day, revenue]) => ({ day, revenue }));

      let bookingServicesQuery = supabaseAdmin
        .from("booking_services")
        .select(
          `
          id,
          price,
          bookings!inner (id, provider_id, status, location_id),
          offerings:offering_id (title)
        `,
        )
        .eq("bookings.provider_id", providerId)
        .not("bookings.status", "in", "(cancelled,no_show)");
      if (locationId) {
        bookingServicesQuery = bookingServicesQuery.eq("bookings.location_id", locationId);
      }
      const { data: bookingServices } = await bookingServicesQuery;
      const serviceMap = new Map<string, { service_name: string; bookingIds: Set<string>; total_revenue: number }>();
      (bookingServices || []).forEach((bs: any) => {
        const name = bs.offerings?.title || "Unknown Service";
        const bookingRow = Array.isArray(bs.bookings) ? bs.bookings[0] : bs.bookings;
        const bookingId = bookingRow?.id as string | undefined;
        const existing = serviceMap.get(name) || {
          service_name: name,
          bookingIds: new Set<string>(),
          total_revenue: 0,
        };
        if (bookingId) existing.bookingIds.add(bookingId);
        existing.total_revenue += Number(bs.price || 0);
        serviceMap.set(name, existing);
      });
      const topServices = Array.from(serviceMap.values())
        .map((s) => ({
          service_name: s.service_name,
          booking_count: s.bookingIds.size,
          total_revenue: s.total_revenue,
        }))
        .sort((a, b) => b.booking_count - a.booking_count)
        .slice(0, 5);

      const upcomingWindowEnd = new Date(startOfToday);
      upcomingWindowEnd.setDate(upcomingWindowEnd.getDate() + 6);
      upcomingWindowEnd.setHours(23, 59, 59, 999);
      const endOfToday = new Date(startOfToday);
      endOfToday.setHours(23, 59, 59, 999);
      let previewBookingsQuery = supabaseAdmin
        .from("bookings")
        .select(
          `
          id,
          booking_number,
          status,
          scheduled_at,
          total_amount,
          currency,
          location_type,
          location_id,
          is_group_booking,
          group_booking_id,
          customers:users!bookings_customer_id_fkey(full_name, phone),
          group_bookings!bookings_group_booking_id_fkey(ref_number),
          service_packages!bookings_package_id_fkey(name),
          booking_services(
            duration_minutes,
            guest_name,
            offering:offerings(title),
            staff:provider_staff(name)
          ),
          booking_products(
            quantity,
            products:products(name)
          )
        `,
        )
        .eq("provider_id", providerId)
        .gte("scheduled_at", startOfToday.toISOString())
        .lte("scheduled_at", upcomingWindowEnd.toISOString())
        .order("scheduled_at", { ascending: true });
      if (locationId) {
        previewBookingsQuery = previewBookingsQuery.eq("location_id", locationId);
      }
      const { data: previewBookingsRaw } = await previewBookingsQuery.limit(80);
      const previewBookings = (previewBookingsRaw || [])
        .map((b: any) => {
          const group = Array.isArray(b.group_bookings) ? b.group_bookings[0] : b.group_bookings;
          const pkg = Array.isArray(b.service_packages) ? b.service_packages[0] : b.service_packages;
          return {
            id: b.id,
            booking_number: b.booking_number,
            status: mapStatusToProvider(
              String(b.status || "pending") as Parameters<typeof mapStatusToProvider>[0],
            ),
            scheduled_at: b.scheduled_at,
            total_amount: Number(b.total_amount || 0),
            currency: String(b.currency || "ZAR"),
            location_type: String(b.location_type || "at_salon"),
            services: (b.booking_services || []).map((s: any) => ({
              name: s.offering?.title || "Service",
              offering_name: s.offering?.title || "Service",
              duration_minutes: Number(s.duration_minutes || 60),
              staff_name: s.staff?.name || null,
              guest_name: s.guest_name || null,
            })),
            customers: b.customers
              ? {
                  full_name: String(b.customers.full_name || ""),
                  phone: String(b.customers.phone || ""),
                }
              : null,
            is_group_booking: Boolean(b.is_group_booking),
            group_booking_id: b.group_booking_id ?? null,
            group_booking_ref: group?.ref_number ?? null,
            package_name: pkg?.name ?? null,
            products: (b.booking_products || []).map((p: any) => ({
              product_name: p.products?.name || "Product",
              quantity: Number(p.quantity || 1),
            })),
          };
        });
      const todayBookings = previewBookings
        .filter((b: any) => {
          const when = new Date(b.scheduled_at);
          return when >= startOfToday && when <= endOfToday;
        })
        .slice(0, 8);
      const upcomingBookings = previewBookings
        .filter((b: any) => {
          const when = new Date(b.scheduled_at);
          const activeStatuses = ["confirmed", "pending", "booked"];
          return when >= startOfToday && when <= upcomingWindowEnd && activeStatuses.includes(String(b.status));
        })
        .slice(0, 12);

      const activityPayload = await buildProviderActivityFeed(supabaseAdmin, providerId, {
        timezone: providerTz,
        locationId,
        limit: 10,
      });
      const recentActivity = activityPayload.activities;

      const bookingLimit = await checkBookingLimit(providerId, supabaseAdmin);
      bookingEligibility = {
        can_accept_online_bookings: bookingLimit.canProceed,
        booking_limit_message: bookingLimit.canProceed
          ? null
          : formatProviderPortalLimitMessage(bookingLimit, "Subscription"),
      };

      insights = {
        weekly_revenue: weeklyRevenue,
        top_services: topServices,
        recent_activity: recentActivity,
        today_bookings: todayBookings,
        upcoming_bookings: upcomingBookings,
      };
    }
    
    // Calculate performance metrics
    const terminalBookings = completedBookings + cancelledBookings + noShowBookings;
    const completionRate = terminalBookings > 0 ? (completedBookings / terminalBookings) * 100 : 0;
    const noShowRate = terminalBookings > 0 ? (noShowBookings / terminalBookings) * 100 : 0;

    // Fetch gamification data (points, badge, milestones) - use admin client
    const { data: gamificationData } = await supabaseAdmin
      .from('provider_points')
      .select(`
        total_points,
        lifetime_points,
        current_tier_points,
        badge_earned_at,
        badge_expires_at,
        provider_badges!provider_points_current_badge_id_fkey (
          id,
          name,
          slug,
          description,
          icon_url,
          tier,
          color,
          requirements,
          benefits
        )
      `)
      .eq('provider_id', providerId)
      .maybeSingle();

    const { data: milestones } = await supabaseAdmin
      .from('provider_milestones')
      .select('milestone_type, achieved_at')
      .eq('provider_id', providerId)
      .order('achieved_at', { ascending: false })
      .limit(10);

    const { data: recentTransactions } = await supabaseAdmin
      .from('provider_point_transactions')
      .select('points, source, description, created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Calculate progress to next badge
    let progressToNextBadge = null;
    const badge = Array.isArray(gamificationData?.provider_badges) ? gamificationData?.provider_badges?.[0] : gamificationData?.provider_badges;
    if (gamificationData) {
      const currentTier = badge?.tier || 0;
      const currentPoints = gamificationData.total_points || 0;
      
      // Fetch all active badges to find the next one
      const { data: allBadges } = await supabaseAdmin
        .from('provider_badges')
        .select('id, name, tier, color, requirements')
        .eq('is_active', true)
        .order('tier', { ascending: true });
      
      if (allBadges && allBadges.length > 0) {
        const nextBadge = allBadges.find(b => b.tier > currentTier);
        if (nextBadge) {
          const requiredPoints = (nextBadge.requirements as any)?.points || 0;
          const pointsNeeded = Math.max(0, requiredPoints - currentPoints);
          const progressPercentage = requiredPoints > 0 
            ? Math.min(100, Math.round((currentPoints / requiredPoints) * 100))
            : 0;
          
          progressToNextBadge = {
            badge: {
              id: nextBadge.id,
              name: nextBadge.name,
              tier: nextBadge.tier,
              color: nextBadge.color,
              requirements: nextBadge.requirements,
            },
            current_points: currentPoints,
            required_points: requiredPoints,
            points_needed: pointsNeeded,
            progress_percentage: progressPercentage,
          };
        }
      }
    }

    const gamification = gamificationData ? {
      total_points: gamificationData.total_points || 0,
      lifetime_points: gamificationData.lifetime_points || 0,
      current_tier_points: gamificationData.current_tier_points || 0,
      current_badge: badge ? {
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        icon_url: badge.icon_url,
        tier: badge.tier,
        color: badge.color,
        requirements: badge.requirements,
        benefits: badge.benefits,
      } : null,
      badge_earned_at: gamificationData.badge_earned_at,
      badge_expires_at: gamificationData.badge_expires_at,
      milestones: milestones || [],
      recent_transactions: recentTransactions || [],
      progress_to_next_badge: progressToNextBadge,
    } : null;

    const payload = {
      // Booking counts
      total_bookings: totalBookings,
      active_bookings: activeBookings,
      confirmed_bookings: confirmedBookings,
      completed_bookings: completedBookings,
      cancelled_bookings: cancelledBookings,
      no_show_bookings: noShowBookings,
      pending_bookings: pendingBookings,
      
      // Location type breakdown
      at_home_bookings: atHomeBookings,
      at_salon_bookings: atSalonBookings,
      at_home_completed: atHomeCompleted,
      at_salon_completed: atSalonCompleted,
      at_home_confirmed: atHomeConfirmed,
      at_salon_confirmed: atSalonConfirmed,
      at_home_pending: atHomePending,
      at_salon_pending: atSalonPending,
      at_home_cancelled: atHomeCancelled,
      at_salon_cancelled: atSalonCancelled,
      at_home_no_show: atHomeNoShow,
      at_salon_no_show: atSalonNoShow,
      
      // Revenue - Current period (primary)
      revenue_today: revenueToday,
      revenue_this_week: revenueThisWeek,
      revenue_this_month: revenueThisMonth,
      revenue_growth: revenueGrowth,
      
      // Revenue - Lifetime (secondary)
      lifetime_revenue: totalRevenue,
      
      // Financial status
      available_balance: Math.max(0, availableBalance),
      pending_payments_amount: pendingPaymentsAmount,
      pending_payments_count: pendingPaymentsCount,
      
      // Revenue streams
      service_earnings_total: providerEarningsTotal,
      tips_total: tipsTotal,
      tips_this_month: tipsThisMonth,
      gift_card_sales_total: giftCardSalesTotal,
      membership_sales_total: membershipSalesTotal,
      refunds_total: Math.abs(refundsTotal),

      // Expenses (subscriptions, ads, platform fees)
      platform_fees_paid: platformFeesPaid,
      expenses_total: expensesTotal,
      expenses_this_month: expensesThisMonth,
      
      // Travel fees breakdown
      travel_fees_total: travelFeesTotal,
      travel_fees_today: travelFeesToday,
      travel_fees_this_month: travelFeesThisMonth,
      travel_fees_last_month: travelFeesLastMonth,
      
      // Performance metrics
      completion_rate: completionRate,
      no_show_rate: noShowRate,
      average_rating: providerData?.rating_average || 0,
      total_reviews: providerData?.review_count || 0,
      
      // Schedule (by scheduled_at, not created_at)
      appointments_today: upcomingBookingsToday,
      appointments_this_week: bookingsScheduledThisWeek,
      appointments_this_month: bookingsScheduledThisMonth,
      
      // Gamification
      gamification: gamification,

      // Provider profile summary (rating, badge, service types, distance) for identity strip
      provider_profile: {
        supports_house_calls: supportsHouseCalls,
        supports_salon: supportsSalon,
        max_service_distance_km: maxServiceDistanceKm,
      },
      dashboard_bundle_version: includeInsights ? 1 : 0,
      insights,
      booking_eligibility: bookingEligibility,
    };

    dashboardResponseCache.set(cacheKey, {
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      data: payload,
    });
    pruneDashboardResponseCache(Date.now());

    const response = successResponse(payload);

    // Add cache headers for faster subsequent requests (5 seconds)
    response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    
    return response;
  } catch (error) {
    // Log the full error object for better debugging
    console.error('Error loading dashboard:', error);
    return handleApiError(error, 'Failed to load dashboard data');
  }
}
