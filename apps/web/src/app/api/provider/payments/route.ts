import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

type BookingPaymentRow = {
  id: string;
  booking_id: string;
  amount: number | string | null;
  payment_method: string | null;
  payment_provider: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  booking?: {
    id: string;
    provider_id?: string | null;
    scheduled_at: string | null;
    duration_minutes: number | null;
    ref_number: string | null;
    booking_number: string | null;
  } | Array<{
    id: string;
    provider_id?: string | null;
    scheduled_at: string | null;
    duration_minutes: number | null;
    ref_number: string | null;
    booking_number: string | null;
  }> | null;
};

/**
 * GET /api/provider/payments
 * 
 * List payment transactions for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

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

    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const search = searchParams.get('search');
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const offset = (page - 1) * limit;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const paymentMethod = searchParams.get('payment_method');
    const teamMemberId = searchParams.get('team_member_id');

    // Scope through the booking join. This avoids oversized `.in(booking_id, ...)`
    // queries and does not depend on optional booking_payments.tenant_id rollout state.
    let paymentsQuery = supabaseAdmin
      .from('booking_payments')
      .select(`
        id,
        booking_id,
        amount,
        payment_method,
        payment_provider,
        status,
        notes,
        created_at,
        created_by,
        booking:bookings!inner(
          id,
          provider_id,
          scheduled_at,
          duration_minutes,
          ref_number,
          booking_number
        )
      `, { count: 'exact' })
      .eq('booking.provider_id', providerId);
    paymentsQuery = paymentsQuery.order('created_at', { ascending: false });

    // Apply filters
    if (dateFrom) {
      paymentsQuery = paymentsQuery.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      paymentsQuery = paymentsQuery.lte('created_at', `${dateTo}T23:59:59.999`);
    }
    if (paymentMethod) {
      paymentsQuery = paymentsQuery.eq('payment_method', paymentMethod);
    }
    if (teamMemberId) {
      paymentsQuery = paymentsQuery.eq('created_by', teamMemberId);
    }

    // Apply pagination
    paymentsQuery = paymentsQuery.range(offset, offset + limit - 1);

    const { data: payments, error: paymentsError, count } = await paymentsQuery;

    if (paymentsError) {
      throw paymentsError;
    }

    // Get team member info if needed
    const teamMemberIds = new Set<string>();
    const paymentRows = (payments || []) as unknown as BookingPaymentRow[];
    paymentRows.forEach((p) => {
      if (p.created_by) {
        teamMemberIds.add(p.created_by);
      }
    });

    let teamMembersMap = new Map();
    if (teamMemberIds.size > 0) {
      const { data: teamMembers } = await supabaseAdmin
        .from('users')
        .select('id, full_name')
        .in('id', Array.from(teamMemberIds));
      
      teamMembersMap = new Map(teamMembers?.map(tm => [tm.id, tm.full_name]) || []);
    }

    // Map to PaymentTransaction format
    const transactions = paymentRows.map((p) => {
      const booking = Array.isArray(p.booking) ? p.booking[0] : p.booking;
      const teamMemberName = p.created_by ? teamMembersMap.get(p.created_by) : undefined;

      return {
        id: p.id,
        ref_number: booking?.ref_number || booking?.booking_number || `PAY-${p.id.slice(0, 8).toUpperCase()}`,
        payment_date: p.created_at,
        appointment_id: p.booking_id,
        appointment_duration: booking?.duration_minutes,
        team_member_id: p.created_by || undefined,
        team_member_name: teamMemberName,
        method: p.payment_method === 'yoco' ? 'yoco' : 
                p.payment_method === 'paystack' ? 'card' :
                p.payment_method === 'card' ? 'card' :
                p.payment_method === 'cash' ? 'cash' :
                p.payment_method === 'bank_transfer' ? 'cash' : // Map bank_transfer to cash for display
                'cash', // Default fallback
        amount: Number(p.amount || 0),
        status: p.status === 'completed' ? 'completed' : 
                p.status === 'pending' ? 'pending' : 'failed',
        yoco_payment_id: p.payment_provider === 'yoco' ? p.id : undefined,
        yoco_device_id: undefined, // Would need to join with yoco_payments table
      };
    });

    // Apply search filter if provided
    let filteredTransactions = transactions;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredTransactions = transactions.filter(t => 
        t.ref_number.toLowerCase().includes(searchLower) ||
        t.team_member_name?.toLowerCase().includes(searchLower) ||
        t.method.toLowerCase().includes(searchLower)
      );
    }

    const totalPages = count ? Math.ceil(count / limit) : 1;

    return successResponse({
      data: filteredTransactions,
      total: count || filteredTransactions.length,
      page,
      limit,
      total_pages: totalPages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch payment transactions");
  }
}
