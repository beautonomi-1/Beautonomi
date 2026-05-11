import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { computeCustomOfferPricing } from "../../_helpers/custom-offer-pricing";
import { computeCustomOfferSplits } from "../../_helpers/custom-offer-splits";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { percentOf } from "@beautonomi/utils";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

/**
 * GET /api/me/custom-offers/:id/quote
 * Canonical pricing breakdown for checkout UIs (web + mobile).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;

    const tipRaw = request.nextUrl.searchParams.get("tip_amount");
    const promotionCode = request.nextUrl.searchParams.get("promotion_code");
    const tipAmount = tipRaw != null && tipRaw !== "" ? Number(tipRaw) : undefined;
    const useWalletParam = request.nextUrl.searchParams.get("use_wallet");
    const useWallet = useWalletParam === "1" || useWalletParam === "true";
    const giftCardCode = request.nextUrl.searchParams.get("gift_card_code");
    const paymentOptionParam = request.nextUrl.searchParams.get("payment_option");
    const paymentOption = paymentOptionParam === "deposit" ? "deposit" : "full";
    const loyaltyPointsRaw = request.nextUrl.searchParams.get("loyalty_points_to_redeem");
    const loyaltyPointsToRedeem =
      loyaltyPointsRaw != null && loyaltyPointsRaw !== ""
        ? Math.max(0, Math.floor(Number(loyaltyPointsRaw) || 0))
        : 0;

    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select(
        "*, request:custom_requests(id, customer_id, provider_id, preferred_start_at, location_type, status)",
      )
      .eq("id", id)
      .single();
    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as {
      travel_fee?: number;
      price?: number;
      currency?: string;
      location_id?: string | null;
      request?: {
        customer_id?: string;
        provider_id?: string;
        location_type?: string;
        status?: string;
      } | null;
    };
    const req = offer.request;
    if (!req || req.customer_id !== user.id) return notFoundResponse("Offer not found");

    if (req.provider_id) {
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
        return notFoundResponse("Offer not found");
      }
    }

    const travelFee = Number(offer.travel_fee ?? 0) >= 0 ? Number(offer.travel_fee ?? 0) : 0;
    const pricing = await computeCustomOfferPricing(supabase, {
      offerPrice: Number(offer.price || 0),
      travelFee,
      currency: offer.currency || lastResortCurrency,
      providerId: req.provider_id ?? "",
      customerId: req.customer_id ?? "",
      tipAmount,
      promotionCode: promotionCode ?? null,
      locationType: req.location_type === "at_home" ? "at_home" : "at_salon",
      locationId: offer.location_id ?? null,
    });

    if (pricing.ok === false) {
      return handleApiError(new Error(pricing.error), pricing.error);
    }

    const { data: providerRow } = await supabase
      .from("providers")
      .select("requires_deposit, deposit_percentage")
      .eq("id", req.provider_id ?? "")
      .maybeSingle();

    const providerRequiresDeposit = Boolean((providerRow as { requires_deposit?: boolean })?.requires_deposit);
    const depositPct = Number((providerRow as { deposit_percentage?: number })?.deposit_percentage || 30);
    const depositAmount = providerRequiresDeposit ? percentOf(pricing.result.totalAmount, depositPct) : 0;

    const fullCheckoutEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.CUSTOM_OFFER_FULL_CHECKOUT,
      tenantId,
    );

    let wallet_balance = 0;
    try {
      const { data: w } = await supabase
        .from("user_wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      wallet_balance = Number((w as { balance?: number } | null)?.balance ?? 0);
    } catch {
      /* ignore */
    }

    let loyalty_points_available: number | null = null;
    try {
      const { data: ledgerBal } = await (supabase.rpc as any)("get_customer_available_points", {
        customer_uuid: user.id,
      });
      loyalty_points_available = Number(ledgerBal) || 0;
    } catch {
      /* ignore */
    }

    // ── Split preview (wallet + gift + loyalty) when full-checkout is enabled.
    //    Customers see exactly what each tender covers and what Paystack must
    //    charge before they confirm — same UX as the booking checkout.
    let splits: Awaited<ReturnType<typeof computeCustomOfferSplits>> | null = null;
    if (fullCheckoutEnabled && (useWallet || giftCardCode || loyaltyPointsToRedeem > 0)) {
      const collectible = providerRequiresDeposit && paymentOption === "deposit"
        ? depositAmount > 0
          ? depositAmount
          : pricing.result.totalAmount
        : pricing.result.totalAmount;
      splits = await computeCustomOfferSplits(supabase, {
        collectibleAmount: collectible,
        bookingSubtotal: pricing.result.subtotal,
        customerId: user.id,
        currency: offer.currency || lastResortCurrency,
        useWallet,
        giftCardCode: giftCardCode ?? null,
        loyaltyPointsToRedeem,
      });
    }

    return successResponse({
      offer_id: id,
      status: (offerRow as { status?: string }).status,
      booking_id: (offerRow as { booking_id?: string | null }).booking_id ?? null,
      pricing: pricing.result,
      deposit: {
        required: providerRequiresDeposit,
        percentage: providerRequiresDeposit ? depositPct : 0,
        deposit_amount: depositAmount,
        full_total: pricing.result.totalAmount,
      },
      payment_option: paymentOption,
      /** When true, clients may show wallet / gift / loyalty controls and call `POST .../pay`. */
      feature_custom_offer_full_checkout: fullCheckoutEnabled,
      wallet_balance,
      loyalty_points_available,
      splits: splits && splits.ok ? splits.result : null,
      splits_error:
        splits && splits.ok === false
          ? { code: splits.code ?? "SPLIT_ERROR", message: splits.error }
          : null,
    });
  } catch (e) {
    return handleApiError(e, "Failed to load quote");
  }
}
