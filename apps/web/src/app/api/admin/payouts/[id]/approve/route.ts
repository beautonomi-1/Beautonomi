import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/payouts/[id]/approve
 * 
 * Approve a payout request
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

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
        status: "processing",
        approved_by: auth.user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        admin_notes: body.notes || null,
      })
      .eq("id", id)
      .select(`
        *,
        provider:providers!payouts_provider_id_fkey(id, business_name, slug, user_id)
      `)
      .single();

    if (updateError || !updatedPayout) {
      return handleApiError(updateError, "Failed to approve payout");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.payout.approve",
      entity_type: "payout",
      entity_id: id,
      metadata: { provider_id: (payout as any).provider_id, amount: (payout as any).amount },
    });

    // Notify provider
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const providerData = (updatedPayout as any).provider;
      if (providerData?.user_id) {
        await sendToUser(providerData.user_id, {
          title: "Payout Approved",
          message: `Your payout request of ZAR ${(payout as any).amount.toFixed(2)} has been approved and is being processed.`,
          data: {
            type: "payout_approved",
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
    return handleApiError(error, "Failed to approve payout");
  }
}
