import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { getNotificationTemplate, sendTemplateNotification, sendToUser } from "@/lib/notifications/onesignal";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";

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
    if (status === "payment_pending") {
      return errorResponse(
        "This offer cannot be withdrawn because the customer is currently processing payment. Wait for payment to complete.",
        "PAYMENT_IN_PROGRESS",
        409,
        { currentStatus: status },
      );
    }
    const allowedStatuses = ["pending"];
    if (!allowedStatuses.includes(status)) {
      return errorResponse(
        `This offer can no longer be withdrawn. Current status: ${status}. Only pending offers can be withdrawn.`,
        "OFFER_NOT_WITHDRAWABLE",
        400,
        { currentStatus: status },
      );
    }

    await supabaseAdmin
      .from("custom_offers")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("id", offerId);

    await patchCustomOfferMessageAttachments(supabaseAdmin, offerId, { status: "withdrawn" });

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
          let providerName = "The provider";
          const { data: pnRow } = await supabaseAdmin
            .from("providers")
            .select("business_name")
            .eq("id", providerId)
            .maybeSingle();
          const bn = (pnRow as { business_name?: string } | null)?.business_name;
          if (bn && bn.trim()) providerName = bn.trim();

          const template = await getNotificationTemplate("customer_custom_offer_withdrawn");
          if (template?.enabled) {
            await sendTemplateNotification(
              "customer_custom_offer_withdrawn",
              [customerId],
              {
                provider_name: providerName,
                offer_id: offerId,
                request_id: offerData.request_id ?? "",
              },
              template.channels || ["push", "email"],
              { appType: "customer" },
            );
          } else {
            await sendToUser(
              customerId,
              {
                title: "Offer withdrawn",
                message: `${providerName} withdrew a custom offer. You can still view your request in the app.`,
                data: {
                  type: "customer_custom_offer_withdrawn",
                  offer_id: offerId,
                  request_id: offerData.request_id ?? "",
                },
                url: `/account-settings/custom-requests?request_id=${encodeURIComponent(offerData.request_id ?? "")}`,
              },
              ["push", "email"],
              { appType: "customer" },
            );
          }
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
