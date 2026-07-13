import { NextRequest } from "next/server";
import { z } from "zod";
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

const requestChangesSchema = z.object({
  note: z.string().min(1).max(4000),
});

/**
 * POST /api/me/custom-offers/[id]/request-changes
 * Customer requests revisions on a pending custom offer.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const { note } = requestChangesSchema.parse(await request.json());

    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select("id, status, request_id, request:custom_requests(id, customer_id, provider_id, status)")
      .eq("id", id)
      .single();

    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as {
      id: string;
      status?: string;
      request_id?: string;
      request?: { customer_id?: string; provider_id?: string; status?: string } | null;
    };
    const req = offer.request;
    if (!req || req.customer_id !== user.id) return notFoundResponse("Offer not found");

    const st = offer.status ?? "";
    if (st === "changes_requested") {
      return successResponse({ changesRequested: true, alreadyRequested: true });
    }
    if (st === "paid" || st === "accepted") {
      return errorResponse("This offer can no longer be revised.", "OFFER_NOT_REVISABLE", 400);
    }
    if (st === "payment_pending") {
      return errorResponse(
        "Payment is already in progress for this offer. Open checkout or wait for it to complete.",
        "PAYMENT_IN_PROGRESS",
        409,
      );
    }
    if (st === "withdrawn" || st === "expired" || st === "declined") {
      return errorResponse("This offer is no longer active.", "OFFER_INACTIVE", 400);
    }

    const allowed = ["pending"];
    if (!allowed.includes(st)) {
      return errorResponse(`This offer cannot be revised (status: ${st}).`, "OFFER_NOT_REVISABLE", 400);
    }

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const trimmedNote = note.trim();

    const { error: upErr } = await admin
      .from("custom_offers")
      .update({
        status: "changes_requested",
        change_request_note: trimmedNote,
        changes_requested_at: now,
        updated_at: now,
      })
      .eq("id", id);

    if (upErr) {
      return handleApiError(upErr, "Failed to request changes");
    }

    await patchCustomOfferMessageAttachments(admin, id, {
      status: "changes_requested",
      changeRequestNote: trimmedNote,
    });

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

          const template = await getNotificationTemplate("provider_custom_offer_changes_requested");
          if (template?.enabled) {
            await sendTemplateNotification(
              "provider_custom_offer_changes_requested",
              [providerUserId],
              {
                customer_name: customerName,
                offer_id: id,
                request_id: offer.request_id ?? "",
                change_note: trimmedNote,
              },
              template.channels || ["push", "email"],
              { appType: "provider" },
            );
          } else {
            await sendToUser(
              providerUserId,
              {
                title: "Changes requested",
                message: `${customerName} requested changes to your custom offer.`,
                data: {
                  type: "provider_custom_offer_changes_requested",
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
        console.warn("[request-changes] notify provider failed:", e);
      }
    }

    return successResponse({ changesRequested: true });
  } catch (err) {
    return handleApiError(err, "Failed to request changes");
  }
}
