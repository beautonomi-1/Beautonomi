import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
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
    }

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    // All providers with basic info
    const { data: providers } = await supabase
      .from('providers')
      .select('id, business_name, owner_name, status, rating_average, created_at');

    const providerIds = (providers || []).map((p: { id: string }) => p.id);

    // Bookings in period (count + revenue via completed bookings)
    const { data: bookings } = providerIds.length > 0
      ? await supabase
          .from('bookings')
          .select('provider_id, scheduled_at, total_amount, status')
          .in('provider_id', providerIds)
          .gte('scheduled_at', startISO)
          .lte('scheduled_at', endISO)
      : { data: [] };

    const bookingsByProvider: Record<string, { count: number; revenue: number }> = {};
    (bookings || []).forEach((b: { provider_id: string; total_amount?: number; status: string }) => {
      const id = b.provider_id;
      if (!bookingsByProvider[id]) bookingsByProvider[id] = { count: 0, revenue: 0 };
      bookingsByProvider[id].count += 1;
      if (b.status === 'completed' && b.total_amount) {
        bookingsByProvider[id].revenue += Number(b.total_amount);
      }
    });

    // Provider earnings from finance_transactions for period (more accurate revenue)
    const { data: txRows } = providerIds.length > 0
      ? await supabase
          .from('finance_transactions')
          .select('provider_id, net, amount')
          .in('provider_id', providerIds)
          .in('transaction_type', ['provider_earnings', 'travel_fee', 'tip'])
          .gte('created_at', startISO)
          .lte('created_at', endISO)
      : { data: [] };

    const revenueByProvider: Record<string, number> = {};
    (txRows || []).forEach((t: { provider_id: string; net?: number; amount?: number }) => {
      const id = t.provider_id;
      if (!revenueByProvider[id]) revenueByProvider[id] = 0;
      revenueByProvider[id] += Number(t.net ?? t.amount ?? 0);
    });

    const providersWithMetrics = (providers || []).map((p: any) => {
      const bookingsData = bookingsByProvider[p.id] || { count: 0, revenue: 0 };
      const txRevenue = revenueByProvider[p.id] ?? 0;
      return {
        provider_id: p.id,
        provider_name: p.business_name || p.owner_name || 'Unknown',
        status: p.status,
        rating_average: Number(p.rating_average) || 0,
        bookings_count: bookingsData.count,
        revenue: txRevenue > 0 ? txRevenue : bookingsData.revenue,
      };
    });

    const sorted = providersWithMetrics.sort((a, b) => b.revenue - a.revenue);
    const totalProviders = sorted.length;
    const activeCount = sorted.filter((p) => p.status === 'active').length;

    return successResponse({
      period,
      totalProviders,
      activeProviders: activeCount,
      providers: sorted,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load provider report');
  }
}
