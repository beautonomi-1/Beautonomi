import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { getNotificationTemplate, sendTemplateNotification, sendToUser } from "@/lib/notifications/onesignal";

const declineRequestSchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
});

/**
 * POST /api/provider/custom-requests/[id]/decline
 * Provider declines an inbound custom request without sending an offer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id: requestId } = await params;
    const body = declineRequestSchema.parse(await request.json().catch(() => ({})));
    const reason = body.reason?.trim() || null;

    const { data: reqRow, error: reqError } = await supabase
      .from("custom_requests")
      .select("id, customer_id, provider_id, status")
      .eq("id", requestId)
      .eq("provider_id", providerId)
      .single();

    if (reqError || !reqRow) return notFoundResponse("Custom request not found");

    const req = reqRow as { id: string; customer_id: string; provider_id: string; status: string };
    if (req.status === "declined") {
      return successResponse({ declined: true, alreadyDeclined: true });
    }

    const allowedStatuses = ["pending", "offered"];
    if (!allowedStatuses.includes(req.status)) {
      return errorResponse(
        `This request can no longer be declined. Current status: ${req.status}.`,
        "REQUEST_NOT_DECLINABLE",
        400,
        { currentStatus: req.status },
      );
    }

    const { data: paidOffer } = await supabaseAdmin
      .from("custom_offers")
      .select("id")
      .eq("request_id", requestId)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();

    if (paidOffer) {
      return errorResponse(
        "This request has a paid offer and cannot be declined.",
        "HAS_PAID_OFFER",
        400,
      );
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("custom_requests")
      .update({
        status: "declined",
        declined_reason: reason,
        declined_at: now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateErr) {
      return handleApiError(updateErr, "Failed to decline request");
    }

    const { data: activeOffers } = await supabaseAdmin
      .from("custom_offers")
      .select("id")
      .eq("request_id", requestId)
      .eq("provider_id", providerId)
      .in("status", ["pending", "changes_requested", "payment_pending"]);

    const offerIds = (activeOffers ?? []).map((o: { id: string }) => o.id);
    if (offerIds.length > 0) {
      await supabaseAdmin
        .from("custom_offers")
        .update({ status: "withdrawn", updated_at: now })
        .in("id", offerIds);

      for (const oid of offerIds) {
        await patchCustomOfferMessageAttachments(supabaseAdmin, oid, { status: "withdrawn" });
      }
    }

    const customerId = req.customer_id;
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

        const template = await getNotificationTemplate("customer_custom_request_declined");
        if (template?.enabled) {
          await sendTemplateNotification(
            "customer_custom_request_declined",
            [customerId],
            {
              provider_name: providerName,
              request_id: requestId,
              reason: reason ?? "",
            },
            template.channels || ["push", "email"],
            { appType: "customer" },
          );
        } else {
          await sendToUser(
            customerId,
            {
              title: "Request declined",
              message: reason
                ? `${providerName} declined your custom request: ${reason}`
                : `${providerName} is unable to fulfil your custom request.`,
              data: {
                type: "customer_custom_request_declined",
                request_id: requestId,
              },
              url: `/account-settings/custom-requests?request=${encodeURIComponent(requestId)}`,
            },
            ["push", "email"],
            { appType: "customer" },
          );
        }
      } catch (notifyErr) {
        console.warn("[decline-request] notify customer failed:", notifyErr);
      }
    }

    return successResponse({ declined: true });
  } catch (error) {
    return handleApiError(error, "Failed to decline custom request");
  }
}
