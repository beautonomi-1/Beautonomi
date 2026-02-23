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

    // Customers (role = customer)
    const { data: customers } = await supabase
      .from('users')
      .select('id, full_name, email, created_at')
      .eq('role', 'customer');

    const customerIds = (customers || []).map((c: { id: string }) => c.id);

    // Bookings in period by customer
    const { data: bookings } = customerIds.length > 0
      ? await supabase
          .from('bookings')
          .select('id, customer_id, scheduled_at, total_amount, status')
          .in('customer_id', customerIds)
          .gte('scheduled_at', startISO)
          .lte('scheduled_at', endISO)
      : { data: [] };

    const bookingsByCustomer: Record<string, { count: number; total_amount: number }> = {};
    (bookings || []).forEach((b: { customer_id: string; total_amount?: number; status: string }) => {
      const id = b.customer_id;
      if (!bookingsByCustomer[id]) bookingsByCustomer[id] = { count: 0, total_amount: 0 };
      bookingsByCustomer[id].count += 1;
      if (b.total_amount) bookingsByCustomer[id].total_amount += Number(b.total_amount);
    });

    const customersWithMetrics = (customers || []).map((c: any) => {
      const data = bookingsByCustomer[c.id] || { count: 0, total_amount: 0 };
      return {
        customer_id: c.id,
        customer_name: c.full_name || c.email || 'Unknown',
        bookings_count: data.count,
        total_spent: data.total_amount,
      };
    });

    const sorted = customersWithMetrics.sort((a, b) => b.total_spent - a.total_spent);
    const totalCustomers = sorted.length;
    const customersWithBookings = sorted.filter((c) => c.bookings_count > 0).length;

    return successResponse({
      period,
      totalCustomers,
      customersWithBookings,
      customers: sorted,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load customer report');
  }
}
