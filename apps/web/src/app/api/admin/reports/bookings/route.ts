import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    
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

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select('scheduled_at, status, provider_id')
      .gte('scheduled_at', startDate.toISOString())
      .lte('scheduled_at', endDate.toISOString());

    const bookingsByDay: Record<string, number> = {};
    const bookingsByStatus: Record<string, number> = {};
    const bookingsByProvider: Record<string, { count: number; provider_name: string }> = {};

    let totalBookings = 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;

    (bookings || []).forEach((booking: any) => {
      const date = new Date(booking.scheduled_at).toISOString().split('T')[0];
      
      // By day
      bookingsByDay[date] = (bookingsByDay[date] || 0) + 1;

      // By status
      bookingsByStatus[booking.status] = (bookingsByStatus[booking.status] || 0) + 1;

      // By provider
      if (booking.provider_id) {
        if (!bookingsByProvider[booking.provider_id]) {
          bookingsByProvider[booking.provider_id] = { count: 0, provider_name: 'Unknown' };
        }
        bookingsByProvider[booking.provider_id].count += 1;
      }

      totalBookings += 1;
      if (booking.status === 'completed') completed += 1;
      if (booking.status === 'cancelled') cancelled += 1;
      if (booking.status === 'no_show') noShow += 1;
    });

    // Get provider names
    const providerIds = Object.keys(bookingsByProvider);
    if (providerIds.length > 0) {
      const { data: providers } = await supabase
        .from('providers')
        .select('id, business_name')
        .in('id', providerIds);

      (providers || []).forEach((p: any) => {
        if (bookingsByProvider[p.id]) {
          bookingsByProvider[p.id].provider_name = p.business_name;
        }
      });
    }

    // Fill missing dates
    const bookingsByDayArray = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      bookingsByDayArray.push({
        date: dateStr,
        count: bookingsByDay[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    const completionRate = totalBookings > 0 ? (completed / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelled / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShow / totalBookings) * 100 : 0;

    return successResponse({
      period,
      totalBookings,
      bookingsByDay: bookingsByDayArray,
      bookingsByStatus: Object.entries(bookingsByStatus).map(([status, count]) => ({
        status,
        count,
        percentage: totalBookings > 0 ? (count / totalBookings) * 100 : 0,
      })),
      bookingsByProvider: Object.entries(bookingsByProvider).map(([provider_id, data]) => ({
        provider_id,
        ...data,
      })).sort((a, b) => b.count - a.count),
      completionRate,
      cancellationRate,
      noShowRate,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load booking report');
  }
}
