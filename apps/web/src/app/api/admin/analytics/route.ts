import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, 1y

    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get daily time series data (optional extra filter, e.g. for users by role)
    const getDailyTimeSeries = async (
      table: string,
      dateField: string = 'created_at',
      extraFilter?: { column: string; value: string }
    ) => {
      let query = supabase
        .from(table)
        .select(dateField)
        .gte(dateField, startDate.toISOString())
        .order(dateField, { ascending: true });
      if (extraFilter) {
        query = query.eq(extraFilter.column, extraFilter.value);
      }
      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        return [];
      }

      // Group by date
      const grouped: Record<string, number> = {};
      (data || []).forEach((item: any) => {
        const date = new Date(item[dateField]).toISOString().split('T')[0];
        grouped[date] = (grouped[date] || 0) + 1;
      });

      // Fill in missing dates with 0
      const result: Array<{ date: string; count: number }> = [];
      const current = new Date(startDate);
      while (current <= now) {
        const dateStr = current.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          count: grouped[dateStr] || 0,
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    };

    // Get revenue time series
    const getRevenueTimeSeries = async () => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('created_at, net, transaction_type')
        .gte('created_at', startDate.toISOString())
        .in('transaction_type', ['payment', 'additional_charge_payment', 'refund'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching revenue:', error);
        return [];
      }

      const grouped: Record<string, number> = {};
      (data || []).forEach((item: any) => {
        const date = new Date(item.created_at).toISOString().split('T')[0];
        const amount = item.transaction_type === 'refund' ? -Math.abs(item.net || 0) : Math.abs(item.net || 0);
        grouped[date] = (grouped[date] || 0) + amount;
      });

      const result: Array<{ date: string; revenue: number }> = [];
      const current = new Date(startDate);
      while (current <= now) {
        const dateStr = current.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          revenue: grouped[dateStr] || 0,
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    };

    // Get provider status breakdown (all providers by current status)
    const getProviderStatusBreakdown = async () => {
      const { data, error } = await supabase
        .from('providers')
        .select('status');

      if (error) {
        console.error('Error fetching provider status:', error);
        return { active: 0, pending: 0, suspended: 0, rejected: 0 };
      }

      const breakdown = {
        active: 0,
        pending: 0,
        suspended: 0,
        rejected: 0,
      };

      (data || []).forEach((p: any) => {
        if (p.status === 'active') breakdown.active++;
        else if (p.status === 'pending_approval') breakdown.pending++;
        else if (p.status === 'suspended') breakdown.suspended++;
        else if (p.status === 'rejected') breakdown.rejected++;
      });

      return breakdown;
    };

    // Get booking status breakdown
    const getBookingStatusBreakdown = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('status')
        .gte('created_at', startDate.toISOString());

      if (error) {
        console.error('Error fetching booking status:', error);
        return { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
      }

      const breakdown = {
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0,
      };

      (data || []).forEach((b: any) => {
        if (b.status === 'confirmed') breakdown.confirmed++;
        else if (b.status === 'completed') breakdown.completed++;
        else if (b.status === 'cancelled') breakdown.cancelled++;
        else if (b.status === 'no_show') breakdown.no_show++;
      });

      return breakdown;
    };

    // Get top providers by revenue (provider earnings: provider_earnings, travel_fee, tip)
    const getTopProviders = async () => {
      const { data, error } = await supabase
        .from('finance_transactions')
        .select('provider_id, net, amount')
        .gte('created_at', startDate.toISOString())
        .in('transaction_type', ['provider_earnings', 'travel_fee', 'tip']);

      if (error) {
        console.error('Error fetching top providers:', error);
        return [];
      }

      const providerRevenue: Record<string, number> = {};
      (data || []).forEach((t: any) => {
        if (t.provider_id) {
          const amt = Number(t.net ?? t.amount ?? 0);
          providerRevenue[t.provider_id] = (providerRevenue[t.provider_id] || 0) + amt;
        }
      });

      const topProviders = Object.entries(providerRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([providerId, revenue]) => ({ provider_id: providerId, revenue }));

      // Fetch provider names
      if (topProviders.length > 0) {
        const providerIds = topProviders.map(p => p.provider_id);
        const { data: providers } = await supabase
          .from('providers')
          .select('id, business_name')
          .in('id', providerIds);

        const providerMap = new Map((providers || []).map((p: any) => [p.id, p.business_name]));

        return topProviders.map(p => ({
          provider_id: p.provider_id,
          business_name: providerMap.get(p.provider_id) || 'Unknown',
          revenue: p.revenue,
        }));
      }

      return [];
    };

    // Run all queries in parallel (users = customers only for growth chart)
    const [
      usersTimeSeries,
      providersTimeSeries,
      bookingsTimeSeries,
      revenueTimeSeries,
      providerStatusBreakdown,
      bookingStatusBreakdown,
      topProviders,
    ] = await Promise.all([
      getDailyTimeSeries('users', 'created_at', { column: 'role', value: 'customer' }),
      getDailyTimeSeries('providers', 'created_at'),
      getDailyTimeSeries('bookings', 'created_at'),
      getRevenueTimeSeries(),
      getProviderStatusBreakdown(),
      getBookingStatusBreakdown(),
      getTopProviders(),
    ]);

    return successResponse({
      period,
      timeSeries: {
        users: usersTimeSeries,
        providers: providersTimeSeries,
        bookings: bookingsTimeSeries,
        revenue: revenueTimeSeries,
      },
      breakdowns: {
        providerStatus: providerStatusBreakdown,
        bookingStatus: bookingStatusBreakdown,
      },
      topProviders,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load analytics');
  }
}
