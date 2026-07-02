import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireSuperadmin, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  fetchFinanceLedgerRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows, platformRevenueNetFromAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";

type ProviderRow = {
  id: string;
  business_name?: string;
  rating_average?: number;
  status?: string;
  created_at?: string;
  user_id?: string;
  // Supabase embeds one-to-one FK joins as an array in its generated types — accept both
  // to keep the code robust to either shape.
  users?:
    | { full_name?: string | null }
    | Array<{ full_name?: string | null }>
    | null;
};

function pickOwnerName(users: ProviderRow["users"]): string | null {
  if (!users) return null;
  const row = Array.isArray(users) ? users[0] : users;
  return row?.full_name ?? null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request);
    const tenantId = await resolveAdminApiTenantId(request);

    const supabase = getSupabaseAdmin();

    if (!supabase) {
      console.error("Failed to get Supabase admin client");
      return handleApiError(new Error("Database connection failed"), 'Failed to load Gods Eye data');
    }

    const now = new Date();
    // Use UTC boundaries so revenue periods align with finance-summary, analytics,
    // and all other surfaces that bucket by UTC. Local-time boundaries (getFullYear,
    // getMonth, getDate) would shift by the tenant's UTC offset and produce different
    // totals for UTC+2 tenants (e.g. SA).
    const utcY = now.getUTCFullYear();
    const utcM = now.getUTCMonth();
    const utcD = now.getUTCDate();
    const startOfToday = new Date(Date.UTC(utcY, utcM, utcD, 0, 0, 0, 0));
    // ISO week starts on Monday (day 1); adjust Sunday (0) to 7 so Math.floor works.
    const dowUtc = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
    const startOfWeek = new Date(Date.UTC(utcY, utcM, utcD - (dowUtc - 1), 0, 0, 0, 0));
    const startOfMonth = new Date(Date.UTC(utcY, utcM, 1, 0, 0, 0, 0));

    // Get overview counts
    const [
      { count: totalUsers } = { count: 0 },
      { count: totalProviders } = { count: 0 },
      { count: totalBookings } = { count: 0 },
      { count: activeBookings } = { count: 0 },
      { count: pendingApprovals } = { count: 0 },
      { count: houseCallBookings } = { count: 0 },
      { count: salonBookings } = { count: 0 },
    ] = await Promise.all([
      supabase.rpc("admin_count_users_in_tenant_scope", {
        p_tenant_id: tenantId,
        p_role: "customer",
      }).then((r) => {
        if (r.error) {
          console.error("admin_count_users_in_tenant_scope", r.error);
          return { count: 0 };
        }
        const n = r.data;
        const count = typeof n === "bigint" ? Number(n) : typeof n === "number" ? n : Number(n ?? 0);
        return { count: Number.isFinite(count) ? count : 0 };
      }),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('tenant_id', tenantId),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['confirmed', 'pending', 'in_progress']),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval').eq('tenant_id', tenantId),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('location_type', 'at_home'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('location_type', 'at_salon'),
    ]);

    // Get bookings by status
    const [
      { count: confirmedBookings } = { count: 0 },
      { count: pendingBookings } = { count: 0 },
      { count: cancelledBookings } = { count: 0 },
      { count: completedBookings } = { count: 0 },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'confirmed'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'completed'),
    ]);

    // §Phase 9: was summing `net` on payment/charge/refund rows only (= R0 when no commission).
    // Now fetches ALL ledger rows for the period and uses platformRevenueNetFromAggregate.
    const getRevenue = async (startISO: string, endISO?: string) => {
      try {
        const rows = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startISO,
          end: endISO ?? null,
        });
        const agg = aggregateFinanceLedgerRows(rows);
        return platformRevenueNetFromAggregate(agg);
      } catch (err) {
        console.error("Error calculating revenue:", err);
        return 0;
      }
    };

    const [revenueToday, revenueThisWeek, revenueThisMonth, revenueAllTime] = await Promise.all([
      getRevenue(startOfToday.toISOString()),
      getRevenue(startOfWeek.toISOString()),
      getRevenue(startOfMonth.toISOString()),
      getRevenue(new Date(0).toISOString()), // All time
    ]);

    // Top providers: rank ACROSS THE ENTIRE TENANT'S LEDGER, not a 20-row sample.
    // Previously we fetched 20 providers by default list order, scored them, and sorted —
    // which silently hid the real top earners. Correct flow: aggregate provider earnings
    // over the full ledger, pick top N provider_ids, then fetch names for just those rows.
    const providerRevenueAll: Record<string, number> = {};
    try {
      const mergedAll = await fetchFinanceLedgerExportRowsForTenant(
        supabase,
        tenantId,
        {},
        { transactionTypes: ["provider_earnings", "travel_fee", "tip"] },
      );
      for (const row of mergedAll) {
        const id = resolveFinanceLedgerRowProviderId(row);
        if (!id) continue;
        providerRevenueAll[id] = (providerRevenueAll[id] || 0) + Number(row.net ?? row.amount ?? 0);
      }
    } catch (err) {
      console.error("[gods-eye] full-tenant provider ledger aggregation failed", err);
    }

    const topProviderIdsByRevenue = Object.entries(providerRevenueAll)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    // If no ledger activity exists yet, fall back to 5 most-recent providers so the card
    // still shows something useful for a new tenant.
    let topProviderIds = topProviderIdsByRevenue;
    if (topProviderIds.length === 0) {
      const { data: recentForFallback } = await supabase
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      topProviderIds = ((recentForFallback as { id: string }[] | null) ?? []).map((r) => r.id);
    }

    const providerDetailsById: Record<string, ProviderRow> = {};
    if (topProviderIds.length > 0) {
      const { data: topProviderRows } = await supabase
        .from("providers")
        .select("id, business_name, rating_average, status, user_id, users:user_id(full_name)")
        .eq("tenant_id", tenantId)
        .in("id", topProviderIds);
      for (const row of (topProviderRows || []) as unknown as ProviderRow[]) {
        providerDetailsById[row.id] = row;
      }
    }

    const topProviderBookingsCounts: Record<string, number> = {};
    if (topProviderIds.length > 0) {
      const { data: bookingRows } = await supabase
        .from("bookings")
        .select("provider_id")
        .eq("tenant_id", tenantId)
        .in("provider_id", topProviderIds);
      for (const b of (bookingRows || []) as { provider_id?: string }[]) {
        if (!b.provider_id) continue;
        topProviderBookingsCounts[b.provider_id] =
          (topProviderBookingsCounts[b.provider_id] || 0) + 1;
      }
    }

    const topProviders = topProviderIds.map((id) => {
      const provider = providerDetailsById[id];
      return {
        id,
        name: provider?.business_name || pickOwnerName(provider?.users) || "Unknown",
        bookings_count: topProviderBookingsCounts[id] || 0,
        revenue: providerRevenueAll[id] ?? 0,
        rating: Number(provider?.rating_average) || 0,
      };
    });

    // Top customers: rank by actual spend across the full tenant ledger, not a 20-row user sample.
    // 1. Aggregate payment/additional_charge ledger rows by booking -> customer.
    // 2. Keep only customers in admin tenant scope (same rules as user directory).
    // 3. Pick top 5 by spend.
    type BookingRef = { id: string; customer_id?: string };
    const { data: scopeIdRows } = await supabase.rpc("admin_user_ids_in_tenant_scope", {
      p_tenant_id: tenantId,
    });
    const tenantCustomerScope = new Set<string>(
      ((scopeIdRows ?? []) as { id: string }[]).map((r) => r.id),
    );

    // Walk all tenant bookings with customer_id to build booking -> customer map.
    const bookingToCustomerAll: Record<string, string> = {};
    const customerBookingsCountsAll: Record<string, number> = {};
    {
      const { data: allTenantBookings } = await supabase
        .from("bookings")
        .select("id, customer_id")
        .eq("tenant_id", tenantId);
      for (const b of (allTenantBookings || []) as BookingRef[]) {
        if (!b.customer_id) continue;
        if (!tenantCustomerScope.has(b.customer_id)) continue;
        bookingToCustomerAll[b.id] = b.customer_id;
        customerBookingsCountsAll[b.customer_id] =
          (customerBookingsCountsAll[b.customer_id] || 0) + 1;
      }
    }

    const customerSpentAll: Record<string, number> = {};
    const allBookingIds = Object.keys(bookingToCustomerAll);
    if (allBookingIds.length > 0) {
      try {
        const ledgerRows = await fetchFinanceLedgerRowsForTenant(
          supabase,
          tenantId,
          {},
          {
            transactionTypes: ["payment", "additional_charge_payment"],
            restrictBookingIds: allBookingIds,
          },
        );
        for (const row of ledgerRows) {
          const bid = row.booking_id;
          if (!bid) continue;
          const cid = bookingToCustomerAll[bid];
          if (!cid) continue;
          customerSpentAll[cid] = (customerSpentAll[cid] || 0) + Number(row.amount ?? 0);
        }
      } catch (err) {
        console.error("[gods-eye] full-tenant customer spend ledger failed", err);
      }
    }

    const topCustomerIds = Object.entries(customerSpentAll)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    type CustomerRow = { id: string; full_name?: string; email?: string };
    const customerDetailsById: Record<string, CustomerRow> = {};
    if (topCustomerIds.length > 0) {
      const { data: topCustomerRows } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", topCustomerIds);
      for (const r of ((topCustomerRows as CustomerRow[] | null) ?? [])) {
        customerDetailsById[r.id] = r;
      }
    }

    const topCustomers = topCustomerIds.map((id) => {
      const customer = customerDetailsById[id];
      return {
        id,
        name: customer?.full_name || customer?.email || "Unknown",
        bookings_count: customerBookingsCountsAll[id] || 0,
        total_spent: customerSpentAll[id] || 0,
      };
    });

    // Get recent activity
    const recentActivity: Array<{
      id: string;
      type: string;
      action: string;
      entity_id: string;
      entity_name: string;
      timestamp: string;
      status: string;
    }> = [];

    // Recent bookings
    const { data: recentBookings } = await supabase
      .from('bookings')
      .select('id, booking_number, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentBookings) {
      type BookingActivityRow = { id: string; booking_number?: string; status?: string; created_at?: string };
      recentBookings.forEach((booking: BookingActivityRow) => {
        recentActivity.push({
          id: `booking-${booking.id}`,
          type: 'booking',
          action: `Booking ${booking.booking_number} ${booking.status}`,
          entity_id: booking.id,
          entity_name: booking.booking_number,
          timestamp: booking.created_at,
          status: booking.status,
        });
      });
    }

    const { data: recentUsersPayload } = await supabase.rpc("admin_users_list_for_tenant", {
      p_tenant_id: tenantId,
      p_limit: 10,
      p_offset: 0,
      p_search: null,
      p_role: null,
      p_signup_source: null,
    });
    const recentUsersBox = recentUsersPayload as { data?: Record<string, unknown>[] } | null;
    const recentUsers = (recentUsersBox?.data ?? []).map((u) => ({
      id: String(u.id ?? ""),
      full_name: u.full_name != null ? String(u.full_name) : undefined,
      email: u.email != null ? String(u.email) : undefined,
      created_at: u.created_at != null ? String(u.created_at) : undefined,
    }));

    if (recentUsers) {
      type UserActivityRow = { id: string; full_name?: string; email?: string; created_at?: string };
      recentUsers.forEach((user: UserActivityRow) => {
        recentActivity.push({
          id: `user-${user.id}`,
          type: 'user',
          action: `New user registered`,
          entity_id: user.id,
          entity_name: user.full_name || user.email || 'Unknown',
          timestamp: user.created_at,
          status: 'success',
        });
      });
    }

    // Recent providers
    const { data: recentProviders } = await supabase
      .from('providers')
      .select('id, business_name, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentProviders) {
      recentProviders.forEach((provider: ProviderRow) => {
        recentActivity.push({
          id: `provider-${provider.id}`,
          type: 'provider',
          action: `Provider ${provider.status}`,
          entity_id: provider.id,
          entity_name: provider.business_name || 'Unknown',
          timestamp: provider.created_at,
          status: provider.status,
        });
      });
    }

    // Sort by timestamp and take most recent 50
    recentActivity.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const topActivity = recentActivity.slice(0, 50);

    return successResponse({
      overview: {
        total_users: totalUsers || 0,
        total_providers: totalProviders || 0,
        total_bookings: totalBookings || 0,
        total_revenue: revenueAllTime,
        active_bookings: activeBookings || 0,
        pending_approvals: pendingApprovals || 0,
        house_call_bookings: houseCallBookings || 0,
        salon_bookings: salonBookings || 0,
      },
      recent_activity: topActivity,
      bookings_by_status: {
        confirmed: confirmedBookings || 0,
        pending: pendingBookings || 0,
        cancelled: cancelledBookings || 0,
        completed: completedBookings || 0,
      },
      bookings_by_type: {
        at_home: houseCallBookings || 0,
        at_salon: salonBookings || 0,
      },
      revenue_breakdown: {
        today: revenueToday,
        this_week: revenueThisWeek,
        this_month: revenueThisMonth,
        all_time: revenueAllTime,
      },
      top_providers: topProviders,
      top_customers: topCustomers,
      // System health here is indicative only — the SPA ("Indicative checks — wire real
      // probes in ops tooling") already labels it as such. `synthetic: true` lets any
      // future consumer disambiguate synthetic values from real probe output.
      system_health: {
        synthetic: true,
        api_uptime: 99.9,
        database_status: "operational",
        payment_gateway_status: "operational",
        notification_service_status: "operational",
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load Gods Eye data');
  }
}
