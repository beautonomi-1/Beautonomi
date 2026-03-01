import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/bookings/[id]/payments
 * Get all payments for a booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Verify booking belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, provider_id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return badRequestResponse("Booking not found or not accessible");
    }

    // Get all payments
    const { data: payments, error: paymentsError } = await supabase
      .from("booking_payments")
      .select(`
        *,
        created_by_user:users!booking_payments_created_by_fkey (
          id,
          full_name
        )
      `)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      throw paymentsError;
    }

    // Get all refunds
    const { data: refunds, error: refundsError } = await supabase
      .from("booking_refunds")
      .select(`
        *,
        created_by_user:users!booking_refunds_created_by_fkey (
          id,
          full_name
        )
      `)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });

    if (refundsError) {
      throw refundsError;
    }

    // Calculate summary
    const total_paid = payments
      ?.filter(p => p.status === 'completed' || p.status === 'partially_refunded')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;

    const total_refunded = refunds
      ?.filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + parseFloat(r.amount), 0) || 0;

    return successResponse({
      payments: payments || [],
      refunds: refunds || [],
      summary: {
        total_paid,
        total_refunded,
        net_amount: total_paid - total_refunded,
      },
    });

  } catch (error) {
    return handleApiError(error, "Failed to fetch payments");
  }
}
