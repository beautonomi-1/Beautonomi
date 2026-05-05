import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { sendToUser } from "@/lib/notifications/onesignal";
import { insertNotification } from "@/lib/notifications/insert-notification";

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
      .select("id, provider_id, status, request_id")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) return notFoundResponse("Offer not found");
    if ((offer as any).provider_id !== providerId) return notFoundResponse("Offer not found");

    const offerData = offer as { id: string; provider_id: string; status: string; request_id?: string };
    const status = offerData.status;
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

    // Reset the parent request back to "pending" if no other active offers remain
    if (offerData.request_id) {
      const { data: activeOffers } = await supabaseAdmin
        .from("custom_offers")
        .select("id")
        .eq("request_id", offerData.request_id)
        .in("status", ["pending", "payment_pending"])
        .neq("id", offerId)
        .limit(1);

      if (!activeOffers || activeOffers.length === 0) {
        await supabaseAdmin
          .from("custom_requests")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", offerData.request_id)
          .eq("status", "offered");
      }

      // Notify the customer that their offer was withdrawn
      const { data: reqRow } = await supabaseAdmin
        .from("custom_requests")
        .select("customer_id")
        .eq("id", offerData.request_id)
        .maybeSingle();

      const customerId = (reqRow as any)?.customer_id as string | undefined;
      if (customerId) {
        try {
          await sendToUser(customerId, {
            title: "Offer withdrawn",
            message: "The provider has withdrawn their custom offer. You can still receive new offers for your request.",
            data: { custom_offer_id: offerId, custom_request_id: offerData.request_id },
          });
          await insertNotification({
            user_id: customerId,
            type: "custom_offer",
            title: "Offer withdrawn",
            message: "The provider has withdrawn their custom offer. You can still receive new offers for your request.",
            data: { custom_offer_id: offerId, custom_request_id: offerData.request_id },
          });
        } catch (notifyErr) {
          console.warn("[retract] failed to notify customer:", notifyErr);
        }
      }
    }

    return successResponse({ withdrawn: true });
  } catch (error) {
    return handleApiError(error, "Failed to retract offer");
  }
}
