import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dateRangeBoundsUtc } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import {
  handlePaystackTerminalPaymentsPost,
  listPaystackTerminalPaymentsMobile,
} from "@/lib/payments/paystack-terminal-provider-mobile-api";

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

type ProviderPaymentBookingRow = {
  id: string;
  provider_id?: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  ref_number: string | null;
  booking_number: string | null;
};

function mapPaymentMethod(method: string | null) {
  switch (method) {
    case "yoco":
      return "yoco";
    case "paystack":
    case "card":
      return "card";
    case "cash":
    case "bank_transfer":
    case "other":
    default:
      return "cash";
  }
}

/**
 * GET /api/provider/payments
 * 
 * List payment transactions for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("paystack_terminal") === "1") {
      return await listPaystackTerminalPaymentsMobile(request);
    }

    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { timezone: tz } = await getProviderReportContext(supabaseAdmin, providerId);
    const ymdParam = /^\d{4}-\d{2}-\d{2}$/;
    
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

    const listPaymentsWithoutEmbeddedJoin = async (): Promise<{
      payments: BookingPaymentRow[];
      count: number;
    }> => {
      const { data: bookingRows, error: bookingsError } = await supabaseAdmin
        .from("bookings")
        .select("id, provider_id, scheduled_at, duration_minutes, ref_number, booking_number")
        .eq("provider_id", providerId);

      if (bookingsError) {
        throw bookingsError;
      }

      const bookings = (bookingRows || []) as ProviderPaymentBookingRow[];
      if (bookings.length === 0) {
        return { payments: [], count: 0 };
      }

      const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
      const bookingIds = bookings.map((booking) => booking.id);
      const chunks: string[][] = [];
      for (let i = 0; i < bookingIds.length; i += 500) {
        chunks.push(bookingIds.slice(i, i + 500));
      }

      const allPayments: BookingPaymentRow[] = [];
      for (const chunk of chunks) {
        let query = supabaseAdmin
          .from("booking_payments")
          .select(
            "id, booking_id, amount, payment_method, payment_provider, status, notes, created_at, created_by",
          )
          .in("booking_id", chunk)
          .order("created_at", { ascending: false });

        if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
          const d0 = dateFrom.slice(0, 10);
          query = query.gte("created_at", dateRangeBoundsUtc(d0, d0, tz).fromIso);
        }
        if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
          const d1 = dateTo.slice(0, 10);
          query = query.lte("created_at", dateRangeBoundsUtc(d1, d1, tz).toIso);
        }
        if (paymentMethod) {
          query = query.eq("payment_method", paymentMethod);
        }
        if (teamMemberId) {
          query = query.eq("created_by", teamMemberId);
        }

        const { data, error } = await query;
        if (error) {
          throw error;
        }

        for (const payment of (data || []) as BookingPaymentRow[]) {
          const booking = bookingById.get(payment.booking_id);
          if (booking) {
            allPayments.push({ ...payment, booking });
          }
        }
      }

      allPayments.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      return {
        payments: allPayments.slice(offset, offset + limit),
        count: allPayments.length,
      };
    };

    // Scope through the booking join. This avoids oversized `.in(booking_id, ...)`
    // queries and does not depend on optional booking_payments.tenant_id rollout state.
    const buildPaymentsQuery = (bookingRelation: string) => {
      let query = supabaseAdmin
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
        booking:${bookingRelation}(
          id,
          provider_id,
          scheduled_at,
          duration_minutes,
          ref_number,
          booking_number
        )
      `, { count: 'exact' })
      .eq('booking.provider_id', providerId);

      query = query.order('created_at', { ascending: false });

      // Apply filters
      if (dateFrom && ymdParam.test(dateFrom.slice(0, 10))) {
        const d0 = dateFrom.slice(0, 10);
        query = query.gte("created_at", dateRangeBoundsUtc(d0, d0, tz).fromIso);
      }
      if (dateTo && ymdParam.test(dateTo.slice(0, 10))) {
        const d1 = dateTo.slice(0, 10);
        query = query.lte("created_at", dateRangeBoundsUtc(d1, d1, tz).toIso);
      }
      if (paymentMethod) {
        query = query.eq('payment_method', paymentMethod);
      }
      if (teamMemberId) {
        query = query.eq('created_by', teamMemberId);
      }

      return query.range(offset, offset + limit - 1);
    };

    let paymentResult: {
      data: unknown[] | null;
      error: unknown;
      count: number | null;
    } = await buildPaymentsQuery("bookings!booking_payments_booking_id_fkey!inner");
    if (paymentResult.error) {
      // Older Supabase schema cache deployments may not know the generated FK
      // hint yet. Fall back to the unhinted relationship instead of 500ing.
      paymentResult = await buildPaymentsQuery("bookings!inner");
    }

    let payments: unknown[] | null = paymentResult.data;
    let paymentsError = paymentResult.error;
    let count = paymentResult.count;

    if (paymentsError) {
      const fallback = await listPaymentsWithoutEmbeddedJoin();
      payments = fallback.payments;
      paymentsError = null;
      count = fallback.count;
    }

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
        method: mapPaymentMethod(p.payment_method),
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

/**
 * POST /api/provider/payments
 * Paystack Terminal mobile fallback actions (`paystackTerminalAction`).
 */
export async function POST(request: NextRequest) {
  return handlePaystackTerminalPaymentsPost(request);
}
