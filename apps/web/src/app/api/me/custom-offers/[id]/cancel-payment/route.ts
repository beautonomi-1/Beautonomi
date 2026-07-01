import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";

/**
 * POST /api/me/custom-offers/[id]/cancel-payment
 *
 * Resets a `payment_pending` offer back to `pending` so the customer can
 * retry payment with a fresh Paystack session. Called by the client when
 * the user cancels or closes the hosted Paystack checkout window before
 * completing payment.
 *
 * - Safe to call for any status: non-`payment_pending` offers are a no-op.
 * - Only resets the status/reference/url — does NOT reverse a completed
 *   Paystack charge (if a charge actually succeeded the offer moves to
 *   `paid` via the webhook and never comes back here).
 * - Wallet split-tender refunds on abandoned payments are handled separately.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select("id, status, request:custom_requests(id, customer_id)")
      .eq("id", id)
      .single();

    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as {
      id: string;
      status?: string;
      request?: { customer_id?: string } | null;
    };
    if (!offer.request || offer.request.customer_id !== user.id) {
      return notFoundResponse("Offer not found");
    }

    // Only `payment_pending` offers need resetting; all other statuses are no-ops.
    if (offer.status !== "payment_pending") {
      return successResponse({ reset: false, status: offer.status ?? null });
    }

    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin
      .from("custom_offers")
      .update({
        status: "pending",
        payment_url: null,
        payment_reference: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "payment_pending"); // optimistic guard against a race

    if (updateError) {
      return handleApiError(updateError, "Failed to reset payment state");
    }

    await patchCustomOfferMessageAttachments(admin, id, { status: "pending" });

    return successResponse({ reset: true, status: "pending" });
  } catch (err) {
    return handleApiError(err, "Failed to cancel payment");
  }
}
