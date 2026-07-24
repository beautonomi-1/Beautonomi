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
import { creditWalletForCustomOfferAbandon } from "@/lib/custom-offers/credit-wallet-for-offer-abandon";

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
 * - Wallet split-tender refunds on abandoned payments are credited here when
 *   the customer cancels before Paystack completes.
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
      .select("id, status, provider_id, request:custom_requests(id, customer_id)")
      .eq("id", id)
      .single();

    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as {
      id: string;
      status?: string;
      provider_id?: string | null;
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
    // Atomically claim the abandon only while still payment_pending. If a
    // charge.success webhook already moved the offer to paid, we must not
    // refund wallet — that would double-credit against a settled payment.
    const { data: claimed, error: updateError } = await admin
      .from("custom_offers")
      .update({
        status: "pending",
        payment_url: null,
        payment_reference: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "payment_pending")
      .select("id");

    if (updateError) {
      return handleApiError(updateError, "Failed to reset payment state");
    }

    if ((claimed?.length ?? 0) === 0) {
      const { data: latest } = await supabase
        .from("custom_offers")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      return successResponse({
        reset: false,
        status: (latest as { status?: string } | null)?.status ?? null,
      });
    }

    try {
      await creditWalletForCustomOfferAbandon(admin, id, user.id, offer.provider_id ?? null, {
        reason: "cancelled",
      });
    } catch (walletErr) {
      console.error("[custom-offers/cancel-payment] wallet refund failed:", walletErr);
    }

    await patchCustomOfferMessageAttachments(admin, id, { status: "pending" });

    return successResponse({ reset: true, status: "pending" });
  } catch (err) {
    return handleApiError(err, "Failed to cancel payment");
  }
}
