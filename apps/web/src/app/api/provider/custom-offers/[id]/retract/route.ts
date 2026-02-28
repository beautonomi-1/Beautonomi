import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/custom-offers/[id]/retract
 * Withdraw a pending custom offer. Updates the offer status and marks the in-chat message as withdrawn.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id: offerId } = await params;

    const { data: offer, error: offerError } = await supabase
      .from("custom_offers")
      .select("id, provider_id, status")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) return notFoundResponse("Offer not found");
    if ((offer as any).provider_id !== providerId) return notFoundResponse("Offer not found");

    const status = (offer as { status: string }).status;
    if (status === "withdrawn") {
      return successResponse({ withdrawn: true, alreadyWithdrawn: true });
    }
    const allowedStatuses = ["pending", "payment_pending"];
    if (!allowedStatuses.includes(status)) {
      return errorResponse(
        `This offer can no longer be withdrawn. Current status: ${status}. Only pending or payment_pending offers can be withdrawn.`,
        "OFFER_NOT_WITHDRAWABLE",
        400,
        { currentStatus: status }
      );
    }

    await supabaseAdmin
      .from("custom_offers")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    // Find messages that reference this offer and set withdrawn on the attachment
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("id, attachments")
      .not("attachments", "is", null);

    for (const msg of messages || []) {
      const attachments = (msg as any).attachments;
      if (!Array.isArray(attachments)) continue;
      const updated = attachments.map((a: any) =>
        a.type === "custom_offer" && a.offer_id === offerId ? { ...a, withdrawn: true } : a
      );
      if (JSON.stringify(updated) !== JSON.stringify(attachments)) {
        await supabaseAdmin.from("messages").update({ attachments: updated }).eq("id", (msg as any).id);
      }
    }

    return successResponse({ withdrawn: true });
  } catch (error) {
    return handleApiError(error, "Failed to retract offer");
  }
}
