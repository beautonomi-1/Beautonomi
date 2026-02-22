import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/admin/payouts/[id]/reject
 * 
 * Reject a payout request
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(['superadmin']);
    if (!auth) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { reason } = body;

    if (!reason) {
      return errorResponse("Rejection reason is required", "VALIDATION_ERROR", 400);
    }

    // Verify payout exists
    const { data: payout } = await supabase
      .from("payouts")
      .select("id, status, provider_id, amount")
      .eq("id", id)
      .single();

    if (!payout) {
      return notFoundResponse("Payout not found");
    }

    if ((payout as any).status !== "pending") {
      return errorResponse("Payout is not pending", "INVALID_STATE", 400);
    }

    // Update payout status
    const { data: updatedPayout, error: updateError } = await supabase
      .from("payouts")
      .update({
        status: "failed",
        rejected_by: auth.user.id,
        rejected_at: new Date().toISOString(),
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(`
        *,
        provider:providers!payouts_provider_id_fkey(id, business_name, slug, user_id)
      `)
      .single();

    if (updateError || !updatedPayout) {
      return handleApiError(updateError, "Failed to reject payout");
    }

    // Notify provider
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const providerData = (updatedPayout as any).provider;
      if (providerData?.user_id) {
        await sendToUser(providerData.user_id, {
          title: "Payout Rejected",
          message: `Your payout request of ZAR ${(payout as any).amount.toFixed(2)} has been rejected. Reason: ${reason}`,
          data: {
            type: "payout_rejected",
            payout_id: id,
          },
          url: `/provider/finance`,
        });
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(updatedPayout);
  } catch (error) {
    return handleApiError(error, "Failed to reject payout");
  }
}
