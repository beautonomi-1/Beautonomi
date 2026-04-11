import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { computeCustomOfferPricing } from "../../_helpers/custom-offer-pricing";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { toCents, percentOf } from "@beautonomi/utils";

interface OfferRow {
  id: string;
  status?: string;
  payment_url?: string;
  expiration_at?: string;
  travel_fee?: number;
  price?: number;
  currency?: string;
  request_id?: string;
  location_id?: string | null;
  request?: RequestRow | null;
}
interface RequestRow {
  id: string;
  customer_id?: string;
  provider_id?: string;
  preferred_start_at?: string;
  location_type?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;

    let body: { tip_amount?: number; promotion_code?: string; payment_option?: "full" | "deposit" } = {};
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

    const offer = offerRow as OfferRow;
    const req = offer.request as RequestRow | undefined;
    if (req?.customer_id !== user.id) return notFoundResponse("Offer not found");

    if (req?.provider_id) {
      const { data: provRow } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("id", req.provider_id)
        .maybeSingle();
      if (
        !resourceTenantMatchesHostTenant(
          tenantId,
          (provRow as { tenant_id?: string | null } | null)?.tenant_id,
        )
      ) {
        return errorResponse(
          "This offer belongs to a different market. Switch to the correct site or app to pay.",
          "TENANT_MISMATCH",
          403,
        );
      }
    }

    if (offer.status === "paid" || offer.status === "accepted") {
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: true });
    }

    // If payment already initialized, return existing URL to prevent duplicate Paystack sessions
    if (offer.status === "payment_pending" && offer.payment_url) {
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: false });
    }

    // Expiry check
    if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
      await supabase.from("custom_offers").update({ status: "expired" }).eq("id", id);
      return handleApiError(new Error("Offer has expired"), "Offer expired");
    }

    const travelFee = Number(offer.travel_fee ?? 0) >= 0 ? Number(offer.travel_fee ?? 0) : 0;
    const pricing = await computeCustomOfferPricing(supabase, {
      offerPrice: Number(offer.price || 0),
      travelFee,
      currency: offer.currency || lastResortCurrency,
      providerId: req?.provider_id ?? "",
      customerId: req?.customer_id ?? "",
      tipAmount: body.tip_amount,
      promotionCode: body.promotion_code ?? null,
      locationType: (req?.location_type === "at_home" ? "at_home" : "at_salon"),
      locationId: offer.location_id ?? null,
    });

    if (pricing.ok === false) {
      return handleApiError(new Error(pricing.error), pricing.error);
    }

    const { result } = pricing;

    // Deposit support: check if the provider requires deposits
    const { data: providerRow } = await supabase
      .from("providers")
      .select("requires_deposit, deposit_percentage")
      .eq("id", req?.provider_id ?? "")
      .maybeSingle();

    const providerRequiresDeposit = Boolean((providerRow as any)?.requires_deposit);
    const depositPct = Number((providerRow as any)?.deposit_percentage || 30);
    const paymentOption = providerRequiresDeposit && body.payment_option === "deposit" ? "deposit" : "full";
    const depositAmount = providerRequiresDeposit ? percentOf(result.totalAmount, depositPct) : 0;
    const chargeAmount = paymentOption === "deposit" ? depositAmount : result.totalAmount;

    const reference = `co_${id}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
    const callbackUrl = `${appUrl}/checkout/success?payment_type=custom_offer&offer_id=${encodeURIComponent(id)}`;

    const email = (user as { email?: string }).email ?? "customer@example.com";
    const amountKobo = toCents(chargeAmount);

    const init = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: amountKobo,
      currency: offer.currency || lastResortCurrency,
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
        payment_option: paymentOption,
        total_amount: result.totalAmount,
        deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
        deposit_percentage: providerRequiresDeposit ? depositPct : 0,
        requires_deposit: providerRequiresDeposit,
      },
      tenantId,
    });

    const paymentUrl = init.data.authorization_url;

    const { error: updateError } = await supabase.from("custom_offers")
      .update({
        status: "payment_pending",
        payment_reference: reference,
        payment_url: paymentUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("[custom-offers/accept] failed to persist payment_pending:", updateError.message);
      return handleApiError(new Error("Failed to save payment state"), "Unable to process payment. Please try again.", "DB_ERROR", 500);
    }

    return successResponse({
      paymentUrl,
      deposit_required: providerRequiresDeposit,
      deposit_percentage: providerRequiresDeposit ? depositPct : 0,
      deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
      payment_option: paymentOption,
      total_amount: result.totalAmount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to accept offer");
  }
}

