import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { collectTenantScopedUserIds } from "@/lib/tenant/admin-tenant-scope";
import {
  fetchFinanceLedgerExportRowsForTenant,
  fetchFinanceLedgerRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";

type ProviderRow = { id: string; business_name?: string; owner_name?: string; rating_average?: number; status?: string; created_at?: string };

export async function GET(request: NextRequest) {
  try {
    // Require superadmin role
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const tenantId = await resolveAdminApiTenantId(request);

    const supabase = getSupabaseAdmin();

    if (!supabase) {
      console.error("Failed to get Supabase admin client");
      return handleApiError(new Error("Database connection failed"), 'Failed to load Gods Eye data');
    }

    const scopedUserIds = await collectTenantScopedUserIds(supabase, tenantId);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
      (() => {
        let q = supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("role", "customer");
        if (scopedUserIds.length > 0) {
          q = q.or(`preferred_home_tenant_id.eq.${tenantId},id.in.(${scopedUserIds.join(",")})`);
        } else {
          q = q.eq("preferred_home_tenant_id", tenantId);
        }
        return q;
      })(),
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

    // GMV from merged ledger (provider in tenant OR booking in tenant).
    const getRevenue = async (startISO: string, endISO?: string) => {
      try {
        const rows = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startISO,
          end: endISO ?? null,
        }, {
          transactionTypes: ["payment", "additional_charge_payment"],
        });
        return rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
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

    // Top providers: fetch all providers (any status) so list is never empty when providers exist
    const { data: activeProvidersData } = await supabase
      .from('providers')
      .select('id, business_name, owner_name, rating_average, status')
      .eq('tenant_id', tenantId)
      .limit(20);

    const allProviderIds = (activeProvidersData || []).map((p: ProviderRow) => p.id);

    // Revenue from merged ledger (provider_earnings, travel_fee, tip), scoped to listed providers
    const providerRevenue: Record<string, number> = {};
    if (allProviderIds.length > 0) {
      try {
        const merged = await fetchFinanceLedgerExportRowsForTenant(supabase, tenantId, {}, {
          transactionTypes: ["provider_earnings", "travel_fee", "tip"],
          restrictProviderIds: allProviderIds,
        });
        const idSet = new Set(allProviderIds);
        for (const row of merged) {
          const id = resolveFinanceLedgerRowProviderId(row);
          if (!id || !idSet.has(id)) continue;
          if (!providerRevenue[id]) providerRevenue[id] = 0;
          providerRevenue[id] += Number(row.net ?? row.amount ?? 0);
        }
      } catch (err) {
        console.error("Error loading gods-eye provider revenue ledger:", err);
      }
    }

    // Bookings count per provider
    const bookingsCounts: Record<string, number> = {};
    if (allProviderIds.length > 0) {
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('provider_id')
        .eq('tenant_id', tenantId)
        .in('provider_id', allProviderIds);
      (bookingRows || []).forEach((b: { provider_id?: string }) => {
        bookingsCounts[b.provider_id] = (bookingsCounts[b.provider_id] || 0) + 1;
      });
    }

    const topProviders = (activeProvidersData || [])
      .map((provider: ProviderRow) => ({
        id: provider.id,
        name: provider.business_name || provider.owner_name || 'Unknown',
        bookings_count: bookingsCounts[provider.id] || 0,
        revenue: providerRevenue[provider.id] ?? 0,
        rating: Number(provider.rating_average) || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Top customers: same tenant scoping as admin users list (preferred home + activity sample).
    let topCustomersQuery = supabase
      .from("users")
      .select("id, full_name, email")
      .eq("role", "customer");
    if (scopedUserIds.length > 0) {
      topCustomersQuery = topCustomersQuery.in("id", scopedUserIds);
    } else {
      topCustomersQuery = topCustomersQuery.eq("preferred_home_tenant_id", tenantId);
    }
    const { data: topCustomersData } = await topCustomersQuery.limit(20);

    type CustomerRow = { id: string; full_name?: string; email?: string };
    const customerIds = (topCustomersData || []).map((c: CustomerRow) => c.id);
    const customerBookingsCounts: Record<string, number> = {};
    const customerSpent: Record<string, number> = {};

    if (customerIds.length > 0) {
      const { data: customerBookings } = await supabase
        .from('bookings')
        .select('id, customer_id')
        .eq('tenant_id', tenantId)
        .in('customer_id', customerIds);
      type BookingRef = { id: string; customer_id?: string };
      (customerBookings || []).forEach((b: BookingRef) => {
        customerBookingsCounts[b.customer_id ?? ""] = (customerBookingsCounts[b.customer_id ?? ""] || 0) + 1;
      });
      const bookingIds = (customerBookings || []).map((b: BookingRef) => b.id);
      const bookingToCustomer: Record<string, string> = {};
      (customerBookings || []).forEach((b: BookingRef) => {
        bookingToCustomer[b.id] = b.customer_id ?? "";
      });
      const customerIdSet = new Set(customerIds);
      if (bookingIds.length > 0) {
        try {
          const ledgerRows = await fetchFinanceLedgerRowsForTenant(
            supabase,
            tenantId,
            {},
            {
              transactionTypes: ["payment", "additional_charge_payment"],
              restrictBookingIds: bookingIds,
            },
          );
          for (const row of ledgerRows) {
            const bid = row.booking_id;
            if (!bid) continue;
            const cid = bookingToCustomer[bid];
            if (!cid || !customerIdSet.has(cid)) continue;
            customerSpent[cid] = (customerSpent[cid] || 0) + Number(row.amount ?? 0);
          }
        } catch (err) {
          console.error("Error loading gods-eye customer spend ledger:", err);
        }
      }
    }

    const topCustomers = (topCustomersData || []).map((customer: CustomerRow) => ({
      id: customer.id,
      name: customer.full_name || customer.email || 'Unknown',
      bookings_count: customerBookingsCounts[customer.id] || 0,
      total_spent: customerSpent[customer.id] || 0,
    })).sort((a, b) => b.total_spent - a.total_spent).slice(0, 5);

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

    let recentUsersQuery = supabase
      .from("users")
      .select("id, full_name, email, created_at");
    if (scopedUserIds.length > 0) {
      recentUsersQuery = recentUsersQuery.or(
        `preferred_home_tenant_id.eq.${tenantId},id.in.(${scopedUserIds.join(",")})`
      );
    } else {
      recentUsersQuery = recentUsersQuery.eq("preferred_home_tenant_id", tenantId);
    }
    const { data: recentUsers } = await recentUsersQuery
      .order("created_at", { ascending: false })
      .limit(10);

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
      top_providers: topProviders
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      top_customers: topCustomers
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 5),
      system_health: {
        api_uptime: 99.9, // Mock value - in production, calculate from actual metrics
        database_status: 'operational', // In production, check actual database connection
        payment_gateway_status: 'operational', // In production, check Paystack API status
        notification_service_status: 'operational', // In production, check OneSignal API status
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load Gods Eye data');
  }
}
