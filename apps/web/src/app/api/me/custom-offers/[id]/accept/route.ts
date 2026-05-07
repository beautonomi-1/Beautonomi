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
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { chargeAuthorization } from "@/lib/payments/paystack-complete";
import { computeCustomOfferPricing } from "../../_helpers/custom-offer-pricing";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { toCents, percentOf } from "@beautonomi/utils";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";

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
  status?: string;
}

/** Best-effort template notification when an offer is marked expired during accept. */
async function notifyCustomerCustomOfferExpiredBestEffort(args: {
  customerId: string;
  providerId?: string;
  offerId: string;
  requestId?: string;
}): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    let providerName = "your provider";
    if (args.providerId) {
      const admin = getSupabaseAdmin();
      const { data: prow } = await admin
        .from("providers")
        .select("business_name")
        .eq("id", args.providerId)
        .maybeSingle();
      const bn = (prow as { business_name?: string } | null)?.business_name;
      if (bn && bn.trim()) providerName = bn.trim();
    }
    await sendTemplateNotification(
      "customer_custom_offer_expired",
      [args.customerId],
      {
        provider_name: providerName,
        offer_id: args.offerId,
        request_id: args.requestId ?? "",
      },
      ["push", "email"],
      { appType: "customer" },
    );
  } catch (e) {
    console.warn("[accept/expire] notify customer failed:", e);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;

    let body: {
      tip_amount?: number;
      promotion_code?: string;
      payment_option?: "full" | "deposit";
      payment_method_id?: string;
    } = {};
    try {
      body = (await request.json()) || {};
    } catch {
      // no body
    }

    // Load offer + request and validate ownership
    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select(
        "*, request:custom_requests(id, customer_id, provider_id, preferred_start_at, location_type, status)",
      )
      .eq("id", id)
      .single();
    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as OfferRow;
    const req = offer.request as RequestRow | undefined;
    if (req?.customer_id !== user.id) return notFoundResponse("Offer not found");

    const requestStatus = req?.status;
    if (
      requestStatus === "cancelled" ||
      requestStatus === "fulfilled" ||
      requestStatus === "expired"
    ) {
      return errorResponse(
        "This request is closed. You can no longer pay for this offer.",
        "REQUEST_CLOSED",
        400,
      );
    }

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

    if (offer.status === "declined") {
      return errorResponse("This offer was declined.", "OFFER_DECLINED", 400);
    }

    if (offer.status === "expired") {
      return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
    }

    // If payment already initialized, return existing URL to prevent duplicate Paystack sessions
    if (offer.status === "payment_pending" && offer.payment_url) {
      if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
        const adminEarly = getSupabaseAdmin();
        await adminEarly.from("custom_offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", id);
        await patchCustomOfferMessageAttachments(adminEarly, id, { status: "expired" });
        void notifyCustomerCustomOfferExpiredBestEffort({
          customerId: user.id,
          providerId: req?.provider_id,
          offerId: id,
          requestId: req?.id,
        });
        return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
      }
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: false });
    }

    /**
     * §Release-audit 2026-04: customers only have SELECT on custom_offers
     * (RLS migration 036). Updating status here under the user-scoped
     * client used to fail silently/explicitly. Use the admin client for
     * status mutations the customer triggers, while still authorising via
     * the request-owner check above.
     */
    const adminSupabase = getSupabaseAdmin();

    // Expiry check
    if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
      await adminSupabase.from("custom_offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", id);
      await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "expired" });
      void notifyCustomerCustomOfferExpiredBestEffort({
        customerId: user.id,
        providerId: req?.provider_id,
        offerId: id,
        requestId: req?.id,
      });
      return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
    }

    if (offer.status === "withdrawn") {
      return errorResponse("This offer has been withdrawn.", "OFFER_WITHDRAWN", 400);
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

    if (body.payment_method_id) {
      const { data: paymentMethod, error: pmError } = await (supabase
        .from("payment_methods") as any)
        .select("*")
        .eq("id", body.payment_method_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("provider", "paystack")
        .single();

      if (pmError || !paymentMethod) {
        return errorResponse("Payment method not found.", "NOT_FOUND", 404);
      }

      const authorizationCode = paymentMethod.provider_payment_method_id as string | undefined;
      if (!authorizationCode || !authorizationCode.startsWith("AUTH_")) {
        return errorResponse("This payment method is not a valid Paystack authorization.", "INVALID_METHOD", 400);
      }

      const { error: pendingErr } = await adminSupabase
        .from("custom_offers")
        .update({
          status: "payment_pending",
          payment_reference: reference,
          payment_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (pendingErr) {
        return handleApiError(new Error("Failed to save payment state"), "Unable to process payment.", "DB_ERROR", 500);
      }

      await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "payment_pending" });

      const chargeResult = await chargeAuthorization(
        authorizationCode,
        email,
        amountKobo,
        {
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
        { tenantId },
      );

      if (!chargeResult.status) {
        await adminSupabase
          .from("custom_offers")
          .update({
            status: "pending",
            payment_url: null,
            payment_reference: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "pending" });
        return errorResponse(chargeResult.message || "Failed to charge card", "CHARGE_FAILED", 400);
      }

      return successResponse({
        charged: true,
        reference: chargeResult.data?.reference ?? reference,
        deposit_required: providerRequiresDeposit,
        deposit_percentage: providerRequiresDeposit ? depositPct : 0,
        deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
        payment_option: paymentOption,
        total_amount: result.totalAmount,
      });
    }

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

    const { error: updateError } = await adminSupabase.from("custom_offers")
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

    await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "payment_pending" });

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

