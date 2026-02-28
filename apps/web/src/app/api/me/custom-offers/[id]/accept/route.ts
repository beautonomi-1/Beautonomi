import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { computeCustomOfferPricing } from "../../_helpers/custom-offer-pricing";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    let body: { tip_amount?: number; promotion_code?: string } = {};
    try {
      body = (await request.json()) || {};
    } catch {
      // no body
    }

    // Load offer + request and validate ownership
    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select("*, request:custom_requests(id, customer_id, provider_id, preferred_start_at, location_type)")
      .eq("id", id)
      .single();
    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as any;
    const req = offer.request as any;
    if (req?.customer_id !== user.id) return notFoundResponse("Offer not found");

    if (offer.status === "paid" || offer.status === "accepted") {
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: true });
    }

    // Expiry check
    if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
      await (supabase.from("custom_offers") as any).update({ status: "expired" }).eq("id", id);
      return handleApiError(new Error("Offer has expired"), "Offer expired");
    }

    const travelFee = Number(offer.travel_fee ?? 0) >= 0 ? Number(offer.travel_fee ?? 0) : 0;
    const pricing = await computeCustomOfferPricing(supabase, {
      offerPrice: Number(offer.price || 0),
      travelFee,
      currency: offer.currency || "ZAR",
      providerId: req.provider_id,
      customerId: req.customer_id,
      tipAmount: body.tip_amount,
      promotionCode: body.promotion_code ?? null,
      locationType: req.location_type || "at_salon",
      locationId: offer.location_id ?? null,
    });

    if (pricing.ok === false) {
      return handleApiError(new Error(pricing.error), pricing.error);
    }

    const { result } = pricing;
    const reference = `co_${id}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const callbackUrl = `${appUrl}/checkout/success?payment_type=custom_offer&offer_id=${encodeURIComponent(id)}`;

    const email = (user as any).email || "customer@example.com";
    const amountKobo = Math.round(result.totalAmount * 100);

    const init = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: amountKobo,
      currency: offer.currency || "ZAR",
      reference,
      callback_url: callbackUrl,
      metadata: {
        custom_offer_id: id,
        custom_request_id: offer.request_id,
        tip_amount: result.tipAmount,
        tax_amount: result.taxAmount,
        tax_rate: result.taxRate,
        travel_fee: result.travelFee,
        service_fee_amount: result.serviceFeeAmount,
        service_fee_percentage: result.serviceFeePercentage,
        promotion_id: result.promotionId ?? "",
        promotion_discount_amount: result.promotionDiscountAmount,
        commission_base: result.commissionBase,
      },
    });

    const paymentUrl = init.data.authorization_url;

    await (supabase.from("custom_offers") as any)
      .update({
        status: "payment_pending",
        payment_reference: reference,
        payment_url: paymentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return successResponse({ paymentUrl });
  } catch (error) {
    return handleApiError(error, "Failed to accept offer");
  }
}

