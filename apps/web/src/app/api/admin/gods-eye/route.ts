import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    // Require superadmin role
    await requireRoleInApi(['superadmin'], request);

    const supabase = getSupabaseAdmin();

    if (!supabase) {
      console.error("Failed to get Supabase admin client");
      return handleApiError(new Error("Database connection failed"), 'Failed to load Gods Eye data');
    }

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
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['confirmed', 'pending', 'in_progress']),
      supabase.from('providers').select('*', { count: 'exact', head: true }).eq('status', 'pending_approval'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('location_type', 'at_home'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('location_type', 'at_salon'),
    ]);

    // Get bookings by status
    const [
      { count: confirmedBookings } = { count: 0 },
      { count: pendingBookings } = { count: 0 },
      { count: cancelledBookings } = { count: 0 },
      { count: completedBookings } = { count: 0 },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    ]);

    // Get revenue breakdown (GMV = sum of amount for payment types)
    const getRevenue = async (startISO: string, endISO?: string) => {
      try {
        let query = supabase
          .from("finance_transactions")
          .select("transaction_type, amount")
          .in("transaction_type", ["payment", "additional_charge_payment"])
          .gte("created_at", startISO);

        if (endISO) {
          query = query.lte("created_at", endISO);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching revenue:", error);
          return 0;
        }

        const rows = data || [];
        return rows.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
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
      .limit(20);

    const allProviderIds = (activeProvidersData || []).map((p: any) => p.id);

    // Revenue from finance_transactions (provider_earnings, travel_fee, tip)
    const providerRevenue: Record<string, number> = {};
    if (allProviderIds.length > 0) {
      const { data: providerTxRows } = await supabase
        .from('finance_transactions')
        .select('provider_id, net, amount')
        .in('provider_id', allProviderIds)
        .in('transaction_type', ['provider_earnings', 'travel_fee', 'tip']);
      (providerTxRows || []).forEach((t: any) => {
        const id = t.provider_id;
        if (!id) return;
        if (!providerRevenue[id]) providerRevenue[id] = 0;
        providerRevenue[id] += Number(t.net ?? t.amount ?? 0);
      });
    }

    // Bookings count per provider
    const bookingsCounts: Record<string, number> = {};
    if (allProviderIds.length > 0) {
      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('provider_id')
        .in('provider_id', allProviderIds);
      (bookingRows || []).forEach((b: any) => {
        bookingsCounts[b.provider_id] = (bookingsCounts[b.provider_id] || 0) + 1;
      });
    }

    const topProviders = (activeProvidersData || [])
      .map((provider: any) => ({
        id: provider.id,
        name: provider.business_name || provider.owner_name || 'Unknown',
        bookings_count: bookingsCounts[provider.id] || 0,
        revenue: providerRevenue[provider.id] ?? 0,
        rating: Number(provider.rating_average) || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Get top customers (by total spent) - finance_transactions has booking_id not customer_id, so derive via bookings
    const { data: topCustomersData } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'customer')
      .limit(20);

    const customerIds = (topCustomersData || []).map((c: any) => c.id);
    const customerBookingsCounts: Record<string, number> = {};
    const customerSpent: Record<string, number> = {};

    if (customerIds.length > 0) {
      const { data: customerBookings } = await supabase
        .from('bookings')
        .select('id, customer_id')
        .in('customer_id', customerIds);
      (customerBookings || []).forEach((b: any) => {
        customerBookingsCounts[b.customer_id] = (customerBookingsCounts[b.customer_id] || 0) + 1;
      });
      const bookingIds = (customerBookings || []).map((b: any) => b.id);
      if (bookingIds.length > 0) {
        const { data: txRows } = await supabase
          .from('finance_transactions')
          .select('booking_id, amount')
          .in('booking_id', bookingIds)
          .in('transaction_type', ['payment', 'additional_charge_payment']);
        const bookingToCustomer: Record<string, string> = {};
        (customerBookings || []).forEach((b: any) => {
          bookingToCustomer[b.id] = b.customer_id;
        });
        (txRows || []).forEach((t: any) => {
          const cid = bookingToCustomer[t.booking_id];
          if (cid) {
            customerSpent[cid] = (customerSpent[cid] || 0) + Number(t.amount || 0);
          }
        });
      }
    }

    const topCustomers = (topCustomersData || []).map((customer: any) => ({
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
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentBookings) {
      recentBookings.forEach((booking: any) => {
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

    // Recent users
    const { data: recentUsers } = await supabase
      .from('users')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentUsers) {
      recentUsers.forEach((user: any) => {
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
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentProviders) {
      recentProviders.forEach((provider: any) => {
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
