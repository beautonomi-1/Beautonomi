import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const paymentMethod = searchParams.get('payment_method');
    const teamMemberId = searchParams.get('team_member_id');

    // Get bookings for this provider
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('id, scheduled_at, ref_number, booking_number')
      .eq('provider_id', providerId);

    if (dateFrom) {
      bookingsQuery = bookingsQuery.gte('scheduled_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      bookingsQuery = bookingsQuery.lte('scheduled_at', `${dateTo}T23:59:59`);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      throw bookingsError;
    }

    const bookingIds = bookings?.map(b => b.id) || [];
    const bookingMap = new Map(bookings?.map(b => [b.id, b]) || []);

    if (bookingIds.length === 0) {
      return successResponse({
        data: [],
        total: 0,
        page,
        limit,
        total_pages: 1,
      });
    }

    // Get booking payments
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
        bookings!inner(
          id,
          scheduled_at,
          duration_minutes,
          ref_number,
          booking_number
        )
      `, { count: 'exact' })
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false });

    // Apply filters
    if (paymentMethod) {
      paymentsQuery = paymentsQuery.eq('payment_method', paymentMethod);
    }

    // Apply pagination
    paymentsQuery = paymentsQuery.range(offset, offset + limit - 1);

    const { data: payments, error: paymentsError, count } = await paymentsQuery;

    if (paymentsError) {
      throw paymentsError;
    }

    // Get team member info if needed
    const teamMemberIds = new Set<string>();
    payments?.forEach((p: any) => {
      if (p.created_by) {
        teamMemberIds.add(p.created_by);
      }
    });

    let teamMembersMap = new Map();
    if (teamMemberIds.size > 0) {
      const { data: teamMembers } = await supabaseAdmin
        .from('provider_staff')
        .select('id, name')
        .in('id', Array.from(teamMemberIds));
      
      teamMembersMap = new Map(teamMembers?.map(tm => [tm.id, tm.name]) || []);
    }

    // Map to PaymentTransaction format
    const transactions = (payments || []).map((p: any) => {
      const booking = p.bookings || bookingMap.get(p.booking_id);
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

    // Apply team member filter if provided
    if (teamMemberId) {
      filteredTransactions = filteredTransactions.filter(t => t.team_member_id === teamMemberId);
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
