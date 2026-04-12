import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { collectTenantScopedUserIds } from "@/lib/tenant/admin-tenant-scope";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const scopedUserIds = await collectTenantScopedUserIds(supabase, tenantId);

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

    let customersQuery = supabase
      .from("users")
      .select("id, full_name, email, created_at")
      .eq("role", "customer");
    if (scopedUserIds.length > 0) {
      customersQuery = customersQuery.or(
        `preferred_home_tenant_id.eq.${tenantId},id.in.(${scopedUserIds.join(",")})`
      );
    } else {
      customersQuery = customersQuery.eq("preferred_home_tenant_id", tenantId);
    }
    const { data: customers } = await customersQuery;

    const customerIds = (customers || []).map((c: { id: string }) => c.id);

    // Bookings in period by customer
    const { data: bookings } = customerIds.length > 0
      ? await supabase
          .from('bookings')
          .select('id, customer_id, scheduled_at, total_amount, status')
          .eq('tenant_id', tenantId)
          .in('customer_id', customerIds)
          .in('status', ['confirmed', 'completed'])
          .gte('scheduled_at', startISO)
          .lte('scheduled_at', endISO)
      : { data: [] };

    const bookingsByCustomer: Record<string, { count: number; total_amount: number; last_booking_at?: string }> = {};
    (bookings || []).forEach((b: { customer_id: string; total_amount?: number; status: string; scheduled_at?: string }) => {
      const id = b.customer_id;
      if (!bookingsByCustomer[id]) bookingsByCustomer[id] = { count: 0, total_amount: 0 };
      bookingsByCustomer[id].count += 1;
      if (b.total_amount) bookingsByCustomer[id].total_amount += Number(b.total_amount);
      if (b.scheduled_at) {
        const prev = bookingsByCustomer[id].last_booking_at;
        if (!prev || new Date(b.scheduled_at) > new Date(prev)) {
          bookingsByCustomer[id].last_booking_at = b.scheduled_at;
        }
      }
    });

    type CustomerRow = { id: string; full_name?: string | null; email?: string | null; created_at?: string };
    const customersWithMetrics = (customers || []).map((c: CustomerRow) => {
      const data = bookingsByCustomer[c.id] || { count: 0, total_amount: 0, last_booking_at: null };
      return {
        customer_id: c.id,
        customer_name: c.full_name ?? c.email ?? "Unknown",
        bookings_count: data.count,
        total_spent: data.total_amount,
        last_booking_at: data.last_booking_at ?? null,
        created_at: c.created_at ?? null,
      };
    });

    const sorted = customersWithMetrics.sort((a, b) => b.total_spent - a.total_spent);
    const totalCustomers = sorted.length;
    const activeCustomers = sorted.filter((c) => c.bookings_count > 0).length;
    const totalBookings = sorted.reduce((sum, c) => sum + c.bookings_count, 0);
    const newCustomers = sorted.filter((c) => {
      if (!c.created_at) return false;
      const created = new Date(c.created_at);
      return created >= startDate && created <= endDate;
    }).length;
    const avgBookingsPerCustomer = totalCustomers > 0 ? totalBookings / totalCustomers : 0;

    return successResponse({
      period,
      totalCustomers,
      activeCustomers,
      newCustomers,
      avgBookingsPerCustomer: Number(avgBookingsPerCustomer.toFixed(2)),
      customers: sorted,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load customer report');
  }
}
