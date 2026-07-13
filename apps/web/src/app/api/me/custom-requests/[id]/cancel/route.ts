/**
 * POST /api/me/custom-requests/[id]/cancel
 *
 * Cancel (withdraw) a custom request. Only allowed when:
 * - Request belongs to the current customer
 * - Request status is pending or offered
 * - No offer on this request has status "paid" (cannot cancel if already paid)
 */

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
import { sendToUser } from "@/lib/notifications/onesignal";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    if (!id) {
      return errorResponse("Request ID is required", "VALIDATION_ERROR", 400);
    }

    const { data: reqRow, error: fetchError } = await supabase
      .from("custom_requests")
      .select("id, customer_id, status")
      .eq("id", id)
      .single();

    if (fetchError || !reqRow) {
      return notFoundResponse("Custom request not found");
    }

    const req = reqRow as { id: string; customer_id: string; status: string };
    if (req.customer_id !== user.id) {
      return notFoundResponse("Custom request not found");
    }

    if (req.status === "cancelled") {
      return successResponse({ cancelled: true, alreadyCancelled: true });
    }

    if (req.status !== "pending" && req.status !== "offered") {
      return errorResponse(
        `This request can no longer be cancelled. Current status: ${req.status}.`,
        "INVALID_STATUS",
        400
      );
    }

    const { data: paidOffer } = await supabase
      .from("custom_offers")
      .select("id")
      .eq("request_id", id)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();

    if (paidOffer) {
      return errorResponse(
        "This request has a paid offer and cannot be cancelled.",
        "HAS_PAID_OFFER",
        400
      );
    }

    const { error: updateError } = await supabase
      .from("custom_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("customer_id", user.id);

    if (updateError) {
      throw updateError;
    }

    // Cascade: withdraw all still-actionable offers and notify each unique provider
    try {
      const adminSupabase = getSupabaseAdmin();

      // Fetch pending/payment_pending offers so we know which providers to notify
      const { data: activeOffers } = await adminSupabase
        .from("custom_offers")
        .select("id, provider_id")
        .eq("request_id", id)
        .in("status", ["pending", "changes_requested", "payment_pending"]);

      if (activeOffers && activeOffers.length > 0) {
        const offerIds = (activeOffers as { id: string; provider_id?: string }[]).map((o) => o.id);

        // Bulk-withdraw offers
        await adminSupabase
          .from("custom_offers")
          .update({ status: "withdrawn", updated_at: new Date().toISOString() })
          .in("id", offerIds);

        for (const oid of offerIds) {
          await patchCustomOfferMessageAttachments(adminSupabase, oid, { status: "withdrawn" });
        }

        // Notify each unique provider whose offer was withdrawn
        const providerIds = [...new Set(
          (activeOffers as { id: string; provider_id?: string }[])
            .map((o) => o.provider_id)
            .filter(Boolean) as string[]
        )];

        // Resolve provider owner user IDs
        for (const pid of providerIds) {
          try {
            const { data: provRow } = await adminSupabase
              .from("providers")
              .select("user_id")
              .eq("id", pid)
              .maybeSingle();

            const provUserId = (provRow as any)?.user_id as string | undefined;
            if (!provUserId) continue;

            await sendToUser(provUserId, {
              title: "Custom request cancelled",
              message: "The customer has cancelled their custom request. Your offer has been automatically withdrawn.",
              data: { custom_request_id: id },
            });
            await insertNotification({
              user_id: provUserId,
              type: "custom_request",
              title: "Custom request cancelled",
              message: "The customer has cancelled their custom request. Your offer has been automatically withdrawn.",
              data: { custom_request_id: id },
            });
          } catch (notifyErr) {
            console.warn("[cancel] failed to notify provider:", pid, notifyErr);
          }
        }
      }
    } catch (cascadeErr) {
      // Non-fatal: log but don't block the cancellation response
      console.warn("[cancel] cascade withdraw/notify failed:", cascadeErr);
    }

    return successResponse({ cancelled: true });
  } catch (error) {
    return handleApiError(error, "Failed to cancel custom request");
  }
}
