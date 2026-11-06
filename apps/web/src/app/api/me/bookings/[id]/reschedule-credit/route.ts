import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, errorResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { loadRescheduleCarryOver } from "@/lib/bookings/reschedule-carry-over";

/**
 * GET /api/me/bookings/[id]/reschedule-credit
 *
 * The amount already paid on the booking being rescheduled, as checkout will
 * apply it to the replacement booking. Checkout caps it at the amount due now;
 * any surplus stays in the customer's wallet.
 *
 * @tenant-hint Service-role read is limited to the authenticated customer:
 * loadRescheduleCarryOver rejects customer_id !== user.id, and the currency
 * read uses .eq("customer_id", user.id).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const carry = await loadRescheduleCarryOver(admin, id, user.id);
    if (carry.ok === false) {
      return errorResponse(carry.message, carry.code, carry.code === "NOT_FOUND" ? 404 : 409);
    }
    const { data: booking } = await admin
      .from("bookings")
      .select("currency")
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();
    return successResponse({
      credit: carry.credit,
      currency: (booking as { currency?: string | null } | null)?.currency ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load reschedule credit");
  }
}
