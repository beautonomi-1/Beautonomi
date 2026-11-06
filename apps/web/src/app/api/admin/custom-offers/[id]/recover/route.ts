/**
 * POST /api/admin/custom-offers/[id]/recover
 * Body: { action: "retry" | "refund" }
 * For offers stuck at finalize_failed after the customer was charged.
 * Both actions re-read the charge from the gateway; the gift card is never
 * captured on a finalize_failed offer, so only card and wallet legs move.
 */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { finalizeCustomOfferPayment } from "@/lib/custom-offers/finalize-custom-offer-payment";
import { autoRefundStaleCustomOfferPayment } from "@/lib/custom-offers/auto-refund-stale-custom-offer-payment";
import { loadVerifiedCustomOfferCharge } from "@/lib/custom-offers/load-verified-custom-offer-charge";
import {
  creditWalletForCustomOfferAbandon,
  getCustomOfferWalletOutstanding,
} from "@/lib/custom-offers/credit-wallet-for-offer-abandon";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { convertFromSmallestUnit } from "@/lib/payments/paystack-complete";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "retry" && body.action !== "refund") {
      return errorResponse("action must be retry or refund", "INVALID_ACTION", 400);
    }
    const admin = getSupabaseAdmin();
    const { data: offer, error } = await admin
      .from("custom_offers")
      .select("id, status, payment_reference, currency, provider_id, request:custom_requests(customer_id, provider_id)")
      .eq("id", id)
      .maybeSingle();
    if (error || !offer) return errorResponse("Offer not found", "NOT_FOUND", 404);
    if (offer.status !== "finalize_failed") {
      return errorResponse("This offer is not waiting on a failed finalize.", "NOT_FINALIZE_FAILED", 409);
    }
    const reference = String(offer.payment_reference ?? "").trim();
    if (!reference) return errorResponse("No payment reference on this offer.", "MISSING_REFERENCE", 409);

    const req = (Array.isArray(offer.request) ? offer.request[0] : offer.request) as
      | { customer_id?: string | null; provider_id?: string | null }
      | null;
    const customerId = req?.customer_id ?? null;
    const providerId = req?.provider_id ?? (offer as { provider_id?: string | null }).provider_id ?? null;
    if (!customerId) return errorResponse("Offer has no customer.", "MISSING_CUSTOMER", 409);

    const verified = await loadVerifiedCustomOfferCharge(id, reference, String(offer.currency ?? "ZAR"));
    if (verified.ok === false) {
      return errorResponse(
        `The payment could not be verified with the gateway (${verified.reason}). Reconcile it manually.`,
        "CHARGE_NOT_VERIFIED",
        409,
      );
    }
    const charge = verified.charge;
    const meta = charge.metadata;
    const walletHeld = await getCustomOfferWalletOutstanding(admin, id, customerId);
    const walletOutstanding = Math.max(0, walletHeld?.outstanding ?? 0);

    if (body.action === "refund") {
      let tenantId: string | null = null;
      if (providerId) {
        const { data: prov } = await admin.from("providers").select("tenant_id").eq("id", providerId).maybeSingle();
        tenantId = (prov as { tenant_id?: string | null } | null)?.tenant_id ?? null;
      }
      if (charge.provider !== "none") {
        const cardRefund = await autoRefundStaleCustomOfferPayment(admin, {
          offerId: id,
          reference,
          amountMinor: charge.amountMinor,
          currency: charge.currency,
          offerStatus: offer.status,
          finalizeReason: "admin_refund",
          tenantId,
        });
        if (!cardRefund.refunded && cardRefund.skipped !== "already_refunded") {
          return errorResponse(
            `The card refund did not go through (${cardRefund.skipped ?? "unknown"}). Nothing else was changed.`,
            "CARD_REFUND_FAILED",
            502,
          );
        }
      }
      const wallet = await creditWalletForCustomOfferAbandon(admin, id, customerId, providerId, {
        reason: "failed",
      });
      await admin
        .from("custom_offers")
        .update({ status: "withdrawn", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "finalize_failed");
      await patchCustomOfferMessageAttachments(admin, id, { status: "withdrawn" });
      return successResponse({
        refunded: true,
        card_refunded: charge.provider === "none" ? 0 : convertFromSmallestUnit(charge.amountMinor, charge.currency),
        wallet_credited: wallet.credited,
      });
    }

    const walletApplied = Math.max(0, Number(meta.wallet_amount_applied ?? 0));
    if (walletApplied > walletOutstanding + 0.01) {
      return errorResponse(
        "The wallet portion of this payment was already returned to the customer. Refund the card instead.",
        "WALLET_ALREADY_RETURNED",
        409,
      );
    }

    const { data: reopened } = await admin
      .from("custom_offers")
      .update({ status: "payment_pending", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "finalize_failed")
      .select("id");
    if (!reopened?.length) {
      return errorResponse("Another recovery is already running for this offer.", "RECOVERY_IN_PROGRESS", 409);
    }

    const giftApplied = Math.max(0, Number(meta.gift_card_amount_applied ?? 0));
    const result = await finalizeCustomOfferPayment(admin, {
      offerId: id,
      reference,
      paystackAmountMajor: convertFromSmallestUnit(charge.amountMinor, charge.currency),
      paystackFeesMajor: convertFromSmallestUnit(charge.feesMinor, charge.currency),
      walletAmountApplied: walletApplied,
      giftCardAmountApplied: giftApplied,
      giftCardId: (meta.gift_card_id as string | null | undefined) ?? null,
      giftCardCode: (meta.gift_card_code as string | null | undefined) ?? null,
      loyaltyPointsRedeemed: Number(meta.loyalty_points_used ?? 0),
      loyaltyDiscountAmount: Number(meta.loyalty_discount_amount ?? 0),
      pricingMetadata: meta,
      customerEmail: charge.customerEmail,
      paymentProvider:
        walletApplied > 0 || giftApplied > 0 ? "split" : charge.provider === "stripe" ? "stripe" : "paystack",
    });
    if (!result.ok) {
      await admin
        .from("custom_offers")
        .update({ status: "finalize_failed", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "payment_pending");
      await patchCustomOfferMessageAttachments(admin, id, { status: "finalize_failed" });
    }
    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to recover custom offer");
  }
}
