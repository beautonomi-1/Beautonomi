import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    type PayoutRow = { status: string; provider_id?: string; amount: number };
    const payoutRow = payout as PayoutRow;
    if (payoutRow.status !== "pending") {
      return errorResponse("Payout is not pending", "INVALID_STATE", 400);
    }

    // Update payout status
    const { data: updatedPayout, error: updateError } = await supabase
      .from("payouts")
      .update({
        status: "failed",
        rejected_by: user.id,
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
      const updatedWithProvider = updatedPayout as PayoutRow & { provider?: { user_id?: string } };
      const providerData = updatedWithProvider.provider;
      if (providerData?.user_id) {
        await sendToUser(
          providerData.user_id,
          {
            title: "Payout Rejected",
            message: `Your payout request of ZAR ${payoutRow.amount.toFixed(2)} has been rejected. Reason: ${reason}`,
            data: {
              type: "payout_rejected",
              payout_id: id,
            },
            url: `/provider/finance`,
          },
          ["push"],
          { appType: "provider" }
        );
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.payout.reject",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: payoutRow.provider_id, amount: payoutRow.amount, reason },
    });

    return successResponse(updatedPayout);
  } catch (error) {
    return handleApiError(error, "Failed to reject payout");
  }
}
