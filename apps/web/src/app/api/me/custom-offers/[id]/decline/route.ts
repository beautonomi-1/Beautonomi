import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { getNotificationTemplate, sendTemplateNotification, sendToUser } from "@/lib/notifications/onesignal";

/**
 * POST /api/me/custom-offers/[id]/decline
 * Customer declines a pending custom offer (before paying).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select("id, status, request_id, request:custom_requests(id, customer_id, provider_id)")
      .eq("id", id)
      .single();

    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as {
      id: string;
      status?: string;
      request_id?: string;
      request?: { customer_id?: string; provider_id?: string } | null;
    };
    const req = offer.request;
    if (!req || req.customer_id !== user.id) return notFoundResponse("Offer not found");

    const st = offer.status ?? "";
    if (st === "declined") {
      return successResponse({ declined: true, alreadyDeclined: true });
    }
    if (st === "paid" || st === "accepted") {
      return errorResponse("This offer can no longer be declined.", "OFFER_NOT_DECLINABLE", 400);
    }
    if (st === "payment_pending") {
      return errorResponse(
        "Payment is already in progress for this offer. Open checkout or wait for it to complete.",
        "PAYMENT_IN_PROGRESS",
        409,
      );
    }
    if (st === "withdrawn" || st === "expired") {
      return errorResponse("This offer is no longer active.", "OFFER_INACTIVE", 400);
    }

    const allowed = ["pending", "changes_requested"];
    if (!allowed.includes(st)) {
      return errorResponse(`This offer cannot be declined (status: ${st}).`, "OFFER_NOT_DECLINABLE", 400);
    }

    const admin = getSupabaseAdmin();
    const { error: upErr } = await admin
      .from("custom_offers")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (upErr) {
      return handleApiError(upErr, "Failed to decline offer");
    }

    await patchCustomOfferMessageAttachments(admin, id, { status: "declined" });

    const providerId = req.provider_id;
    if (providerId) {
      try {
        const { data: provRow } = await admin.from("providers").select("user_id").eq("id", providerId).maybeSingle();
        const providerUserId = (provRow as { user_id?: string } | null)?.user_id;
        if (providerUserId) {
          let customerName = "A customer";
          const { data: prof } = await admin
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .maybeSingle();
          const fn = (prof as { full_name?: string } | null)?.full_name;
          if (fn && fn.trim()) customerName = fn.trim();

          const template = await getNotificationTemplate("provider_custom_offer_declined");
          if (template?.enabled) {
            await sendTemplateNotification(
              "provider_custom_offer_declined",
              [providerUserId],
              {
                customer_name: customerName,
                offer_id: id,
                request_id: offer.request_id ?? "",
              },
              template.channels || ["push", "email"],
              { appType: "provider" },
            );
          } else {
            await sendToUser(
              providerUserId,
              {
                title: "Custom offer declined",
                message: `${customerName} declined your custom offer.`,
                data: {
                  type: "provider_custom_offer_declined",
                  offer_id: id,
                  request_id: offer.request_id ?? "",
                },
                url: `/provider/custom-requests/${offer.request_id ?? ""}`,
              },
              ["push", "email"],
              { appType: "provider" },
            );
          }
        }
      } catch (e) {
        console.warn("[decline] notify provider failed:", e);
      }
    }

    return successResponse({ declined: true });
  } catch (err) {
    return handleApiError(err, "Failed to decline offer");
  }
}
