import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  optionalAuthInApi,
  errorResponse,
  notFoundResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { notifyProductOrderPaidIfTransitioned } from "@/lib/notifications/notify-product-order-paid";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { applyWalletTopupFromSuccessfulPaystackCharge } from "@/lib/wallet/apply-wallet-topup-from-paystack-success";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { applyMarketingTopupFromPaystackSuccess } from "@/lib/marketing/apply-marketing-topup-from-paystack";
import { enrichWalletTopupMetadataFromReference } from "@/lib/wallet/enrich-wallet-topup-metadata-from-reference";

/**
 * GET /api/paystack/verify
 * 
 * Verify Paystack payment status.
 * Authentication is optional to support cross-site redirect callbacks where
 * browser cookies may not be present after 3DS/bank handoff.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await optionalAuthInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { searchParams } = new URL(request.url);
    const reference =
      searchParams.get("reference") || searchParams.get("trxref");

    if (!reference) {
      return successResponse({ status: "error", message: "Reference required" });
    }

    const sessionId = searchParams.get("session_id");
    const adminEarly = getSupabaseAdmin();
    const { getOnlinePaymentCheckoutByReference } = await import(
      "@/lib/payments/online-payment-checkouts"
    );
    const checkoutRow = await getOnlinePaymentCheckoutByReference(reference);
    const { shouldUseStripeOnlineVerify, verifyAndSettleOnlinePayment } = await import(
      "@/lib/payments/resolve-online-verify"
    );
    if (shouldUseStripeOnlineVerify(checkoutRow?.provider, sessionId)) {
      const stripeResult = await verifyAndSettleOnlinePayment(
        { reference, tenantId, sessionId },
        adminEarly,
      );
      if (stripeResult.paid) {
        return successResponse({
          status: "success",
          provider: "stripe",
          reference,
          message: "Payment verified",
        });
      }
      return successResponse({
        status: stripeResult.provider === "stripe" ? "pending" : "error",
        provider: stripeResult.provider,
        reference,
        message: "Payment not completed yet",
      });
    }

    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey({ tenantId });

    if (!PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack secret key not configured");
    }

    // Verify payment with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (!paystackResponse.ok) {
      throw new Error("Failed to verify payment");
    }

    const data = await paystackResponse.json();

    if (data.data.status === "success") {
      const rawMeta = data.data.metadata;
      let metadata: Record<string, unknown> =
        rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
          ? { ...(rawMeta as Record<string, unknown>) }
          : {};
      // Paystack verify sometimes omits custom metadata on the transaction object.
      // We always persist `paystack_reference` on `ads_budget_orders` at init — resolve by reference
      // so charge.success + client verify can still fund the campaign (fixes "awaiting payment" stuck state).
      const hasNonAdsRoutingMetadata = Boolean(
        metadata.product_order_id ||
          metadata.wallet_topup_id ||
          metadata.gift_card_order_id ||
          metadata.membership_order_id ||
          metadata.provider_subscription_order_id ||
          metadata.custom_offer_id ||
          metadata.bookingId ||
          metadata.booking_id ||
          metadata.kind === "card_verification" ||
          metadata.marketing_credit_topup === true ||
          metadata.marketing_credit_topup === "true",
      );
      if (reference && !metadata.ads_budget_order_id && !hasNonAdsRoutingMetadata) {
        const adminLookup = getSupabaseAdmin();
        const { data: adsByRef } = await adminLookup
          .from("ads_budget_orders")
          .select("id, campaign_id, provider_id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (adsByRef) {
          const ar = adsByRef as { id?: unknown; campaign_id?: string | null; provider_id?: string | null };
          const orderIdStr = ar.id != null && ar.id !== "" ? String(ar.id) : "";
          if (orderIdStr) {
            metadata = {
              ...metadata,
              ads_budget_order_id: orderIdStr,
              ...(ar.campaign_id ? { campaign_id: ar.campaign_id } : {}),
              ...(ar.provider_id ? { provider_id: ar.provider_id } : {}),
            };
          }
        }
      }
      if (reference && !metadata.provider_subscription_order_id) {
        const adminSub = getSupabaseAdmin();
        const { data: subOrderByRef } = await adminSub
          .from("provider_subscription_orders")
          .select("id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (subOrderByRef) {
          const sid = (subOrderByRef as { id?: unknown }).id;
          const idStr = sid != null && sid !== "" ? String(sid) : "";
          if (idStr) {
            metadata = { ...metadata, provider_subscription_order_id: idStr };
          }
        }
      }
      // Paystack verify can omit custom metadata, which previously left wallet
      // top-ups stuck (balance never credited until the webhook arrived). We
      // persist `paystack_reference` on `wallet_topups` at init (new card) and
      // update it to the charge reference (saved card), so resolve by reference
      // to recover the wallet_topup_id and credit synchronously on verify.
      if (reference && !metadata.wallet_topup_id) {
        const adminWt = getSupabaseAdmin();
        const enriched = { ...metadata };
        await enrichWalletTopupMetadataFromReference(adminWt as never, reference, enriched);
        metadata = enriched;
      }
      const verifiedChargeData = { ...data.data, metadata };
      // Keep server/client refs for role-aware lookups + service-role writes.
      const admin = getSupabaseAdmin();
      const tenantRegion = await getTenantRegionConfig(tenantId);
      const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
      const paidCurrency =
        typeof data.data.currency === "string" && data.data.currency.length >= 3
          ? data.data.currency.toUpperCase()
          : fallbackCurrency;

      // Handle product order payments
      const productOrderId = metadata.product_order_id ? String(metadata.product_order_id) : "";
      if (productOrderId) {
        const { data: poBefore } = await (admin.from("product_orders") as any)
          .select(
            "tenant_id, provider_id, customer_id, total_amount, wallet_amount, gift_card_amount, payment_status, payment_reference",
          )
          .eq("id", productOrderId)
          .maybeSingle();

        if (!poBefore) {
          return notFoundResponse("Product order not found");
        }

        if (
          !resourceTenantMatchesHostTenant(
            tenantId,
            (poBefore as { tenant_id?: string | null }).tenant_id,
          )
        ) {
          return errorResponse(
            "This order belongs to a different market. Open checkout from the correct site or app for this order.",
            "TENANT_MISMATCH",
            403,
          );
        }

        const poBeforeRow = poBefore as {
          tenant_id?: string | null;
          provider_id?: string | null;
          customer_id?: string | null;
          total_amount?: number | string | null;
          wallet_amount?: number | string | null;
          gift_card_amount?: number | string | null;
          payment_status?: string | null;
          payment_reference?: string | null;
        };

        if (user?.id && poBeforeRow.customer_id !== user.id) {
          return errorResponse(
            "You can only confirm payment for your own order.",
            "FORBIDDEN",
            403,
          );
        }

        const paymentStatus = String(poBeforeRow.payment_status ?? "");
        const existingReference = poBeforeRow.payment_reference ?? null;
        if (paymentStatus !== "pending" && existingReference !== reference) {
          return errorResponse(
            "This order does not require online payment.",
            "ORDER_NOT_PAYABLE",
            400,
          );
        }

        const amountMajor = Number(data.data.amount || 0) / 100;
        const expectedMajor = Math.max(
          0,
          Number(poBeforeRow.total_amount ?? 0) -
            Number(poBeforeRow.wallet_amount ?? 0) -
            Number(poBeforeRow.gift_card_amount ?? 0),
        );
        if (Math.abs(amountMajor - expectedMajor) > 0.01 && existingReference !== reference) {
          return errorResponse(
            "Payment amount does not match this order.",
            "AMOUNT_MISMATCH",
            400,
          );
        }

        const payRecord = await recordProductOrderPayment({
          supabase: admin as any,
          productOrderId,
          reference,
          amountMajor,
          feesMajor: Number(data.data.fees || 0) / 100,
          source: "paystack_verify",
          provider: "paystack",
        });

        if (!payRecord.ok || payRecord.ledgerIncomplete) {
          return errorResponse(
            payRecord.ledgerIncomplete
              ? "Payment received but order ledger is incomplete. Please retry or contact support."
              : "Payment could not be applied to this order. Please retry or contact support.",
            payRecord.ledgerIncomplete ? "LEDGER_INCOMPLETE" : "PAYMENT_NOT_RECORDED",
            409,
          );
        }

        await notifyProductOrderPaidIfTransitioned(admin as any, productOrderId, {
          transitionedToPaid: payRecord.transitionedToPaid,
        });

        const { data: po } = await (admin.from("product_orders") as any)
          .select("order_number, customer_id")
          .eq("id", productOrderId)
          .maybeSingle();

        return successResponse({
          status: "success",
          productOrderId,
          orderNumber: po?.order_number,
          type: "product_order",
          message: "Payment verified successfully",
        });
      }

      // Wallet top-up (metadata has wallet_topup_id, not booking_id — must run before booking branch)
      const walletTopupId = metadata.wallet_topup_id;
      if (walletTopupId) {
        const { data: topupLookup } = await admin
          .from("wallet_topups")
          .select("user_id")
          .eq("id", walletTopupId)
          .maybeSingle();
        if (!topupLookup) {
          return notFoundResponse("Wallet top-up not found");
        }
        if (user?.id && (topupLookup as { user_id?: string }).user_id !== user.id) {
          return errorResponse(
            "You can only confirm wallet top-ups from your own account.",
            "FORBIDDEN",
            403,
          );
        }
        await applyWalletTopupFromSuccessfulPaystackCharge(
          {
            reference: String(reference),
            metadata,
            amount: data.data.amount,
            fees: data.data.fees,
          },
          admin as any,
        );
        const { data: creditedRow } = await admin
          .from("wallet_transactions")
          .select("id")
          .eq("reference_id", String(walletTopupId))
          .eq("reference_type", "wallet_topup")
          .limit(1)
          .maybeSingle();
        if (!creditedRow) {
          return errorResponse(
            "Wallet balance could not be credited for this payment.",
            "WALLET_TOPUP_NOT_CREDITED",
            409,
          );
        }
        return successResponse({
          status: "success",
          type: "wallet_topup",
          message: "Wallet top-up confirmed",
        });
      }

      if (metadata?.gift_card_order_id) {
        const giftCardOrderId = String(metadata.gift_card_order_id);
        const { data: orderLookup } = await admin
          .from("gift_card_orders")
          .select("purchaser_user_id")
          .eq("id", giftCardOrderId)
          .maybeSingle();
        if (!orderLookup) {
          return notFoundResponse("Gift card order not found");
        }
        if (user?.id && (orderLookup as { purchaser_user_id?: string | null }).purchaser_user_id !== user.id) {
          return errorResponse(
            "You can only confirm your own gift card purchases.",
            "FORBIDDEN",
            403,
          );
        }
        await processSuccessfulPayment(verifiedChargeData, admin);
        return successResponse({
          status: "success",
          type: "gift_card_order",
          giftCardOrderId,
          message: "Gift card purchase confirmed",
        });
      }

      if (metadata?.membership_order_id) {
        const membershipOrderId = String(metadata.membership_order_id);
        const { data: membershipOrderLookup } = await admin
          .from("membership_orders")
          .select("user_id")
          .eq("id", membershipOrderId)
          .maybeSingle();
        if (!membershipOrderLookup) {
          return notFoundResponse("Membership order not found");
        }
        if (user?.id && (membershipOrderLookup as { user_id?: string | null }).user_id !== user.id) {
          return errorResponse(
            "You can only confirm your own membership purchases.",
            "FORBIDDEN",
            403,
          );
        }
        await processSuccessfulPayment(verifiedChargeData, admin);
        return successResponse({
          status: "success",
          type: "membership_order",
          membershipOrderId,
          message: "Membership payment confirmed",
        });
      }

      if (metadata?.kind === "card_verification") {
        await processSuccessfulPayment(verifiedChargeData, admin);
        return successResponse({
          status: "success",
          type: "card_verification",
          message: "Card verification confirmed",
        });
      }

      if (
        metadata?.marketing_credit_topup === true ||
        metadata?.marketing_credit_topup === "true"
      ) {
        const providerId = String(metadata?.provider_id ?? "").trim();
        if (!providerId) {
          return errorResponse(
            "Marketing top-up is missing provider context.",
            "INVALID_METADATA",
            400,
          );
        }
        if (user?.id) {
          const authProviderId = await getProviderIdForUser(user.id, admin as never, { request });
          if (!authProviderId || authProviderId !== providerId) {
            return errorResponse(
              "You can only confirm marketing top-ups for your own provider account.",
              "FORBIDDEN",
              403,
            );
          }
        }
        const amountZar = Number(
          metadata?.amount_zar ?? convertFromSmallestUnit(Number(data.data.amount || 0), paidCurrency),
        );
        const feesZar = convertFromSmallestUnit(Number(data.data.fees || 0), paidCurrency);
        const topupResult = await applyMarketingTopupFromPaystackSuccess({
          supabase: admin as any,
          providerId,
          amountZar,
          feesZar,
          paystackReference: String(reference),
          currency: typeof metadata?.currency === "string" ? metadata.currency : null,
          metadata: metadata as Record<string, unknown>,
        });
        if (!topupResult.credited) {
          return errorResponse(
            "Marketing credits could not be applied for this payment.",
            "TOPUP_NOT_CREDITED",
            409,
          );
        }
        return successResponse({
          status: "success",
          type: "marketing_credit_topup",
          balance_after: topupResult.balance_after,
          message: "Marketing credits topped up",
        });
      }

      if (metadata?.ads_budget_order_id) {
        const providerId = user?.id
          ? await getProviderIdForUser(user.id, admin as never, { request })
          : null;
        const adsBudgetOrderId = String(metadata.ads_budget_order_id);
        const { data: order } = await admin
          .from("ads_budget_orders")
          .select("id, provider_id, campaign_id, amount, status, currency")
          .eq("id", adsBudgetOrderId)
          .maybeSingle();
        if (!order) {
          return notFoundResponse("Ads payment order not found");
        }
        const orderRow = order as {
          provider_id?: string | null;
          campaign_id?: string | null;
          amount?: number | string | null;
          status?: string | null;
        };
        if (user?.id && orderRow.provider_id !== providerId) {
          return errorResponse(
            "You can only confirm ad payments for your own provider account.",
            "FORBIDDEN",
            403,
          );
        }
        const { data: providerTenantRow } = await admin
          .from("providers")
          .select("tenant_id")
          .eq("id", providerId)
          .maybeSingle();
        if (
          !resourceTenantMatchesHostTenant(
            tenantId,
            (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id,
          )
        ) {
          return errorResponse(
            "This ads payment belongs to a different market. Open checkout from the correct site or app.",
            "TENANT_MISMATCH",
            403,
          );
        }
        const amountMajor = convertFromSmallestUnit(Number(data.data.amount || 0), paidCurrency);
        const expectedMajor = Number(orderRow.amount ?? 0);
        if (String(orderRow.status ?? "") !== "paid" && Math.abs(amountMajor - expectedMajor) > 0.02) {
          return errorResponse(
            "Payment amount does not match this ads order.",
            "AMOUNT_MISMATCH",
            400,
          );
        }
        await processSuccessfulPayment(verifiedChargeData, admin);
        return successResponse({
          status: "success",
          type: "ads_budget_order",
          adsBudgetOrderId,
          campaignId: orderRow.campaign_id ?? (metadata.campaign_id ? String(metadata.campaign_id) : null),
          message: "Ads payment confirmed",
        });
      }

      if (metadata?.provider_subscription_order_id) {
        const providerId = user?.id
          ? await getProviderIdForUser(user.id, admin as never, { request })
          : null;
        const subscriptionOrderId = String(metadata.provider_subscription_order_id);
        const { data: order } = await admin
          .from("provider_subscription_orders")
          .select("id, provider_id, plan_id, billing_period, amount, status, currency")
          .eq("id", subscriptionOrderId)
          .maybeSingle();
        if (!order) {
          return notFoundResponse("Subscription payment order not found");
        }
        const orderRow = order as {
          provider_id?: string | null;
          plan_id?: string | null;
          billing_period?: string | null;
          amount?: number | string | null;
          status?: string | null;
        };
        if (user?.id && orderRow.provider_id !== providerId) {
          return errorResponse(
            "You can only confirm subscription payments for your own provider account.",
            "FORBIDDEN",
            403,
          );
        }
        const { data: providerTenantRow } = await admin
          .from("providers")
          .select("tenant_id")
          .eq("id", providerId)
          .maybeSingle();
        if (
          !resourceTenantMatchesHostTenant(
            tenantId,
            (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id,
          )
        ) {
          return errorResponse(
            "This subscription payment belongs to a different market. Open checkout from the correct site or app.",
            "TENANT_MISMATCH",
            403,
          );
        }
        const amountMajor = Number(data.data.amount || 0) / 100;
        const expectedMajor = Number(orderRow.amount ?? 0);
        if (String(orderRow.status ?? "") !== "paid" && Math.abs(amountMajor - expectedMajor) > 0.01) {
          return errorResponse(
            "Payment amount does not match this subscription order.",
            "AMOUNT_MISMATCH",
            400,
          );
        }
        await processSuccessfulPayment(verifiedChargeData, admin);
        return successResponse({
          status: "success",
          type: "provider_subscription_order",
          subscriptionOrderId,
          planId: orderRow.plan_id ?? null,
          billingPeriod: orderRow.billing_period ?? null,
          message: "Subscription payment confirmed",
        });
      }

      // Custom offer Paystack hosted checkout (metadata has custom_offer_id, not booking_id yet)
      if (metadata?.custom_offer_id) {
        const offerId = String(metadata.custom_offer_id);
        const { data: coRow } = await admin
          .from("custom_offers")
          .select("id, request:custom_requests(customer_id)")
          .eq("id", offerId)
          .maybeSingle();
        const custId = (coRow as { request?: { customer_id?: string } | null } | null)?.request?.customer_id;
        if (!coRow || (user?.id && custId !== user.id)) {
          return errorResponse(
            "You can only verify payments for your own custom offers.",
            "FORBIDDEN",
            403,
          );
        }
        await processSuccessfulPayment(verifiedChargeData, admin);

        // `finalizeCustomOfferPayment` (run inside processSuccessfulPayment)
        // creates the booking and stamps `custom_offers.booking_id`. Re-read it
        // so the client can deep-link straight to the finalized booking instead
        // of dropping the customer on the bookings list. Null when finalize is
        // still pending / failed — the client then falls back to the tab.
        const { data: paidOffer } = await admin
          .from("custom_offers")
          .select("booking_id")
          .eq("id", offerId)
          .maybeSingle();
        const finalizedBookingId =
          (paidOffer as { booking_id?: string | null } | null)?.booking_id ?? null;

        return successResponse({
          status: "success",
          type: "custom_offer",
          customOfferId: offerId,
          bookingId: finalizedBookingId,
          message: "Payment verified successfully",
        });
      }

      // Handle booking payments
      const bookingId = metadata.bookingId || metadata.booking_id;

      if (!bookingId) {
        console.error("Booking ID not found in payment metadata");
        return successResponse({
          status: "error",
          message: "Booking ID not found in payment metadata",
        });
      }

      const { data: booking, error: bookingLookupError } = await admin
        .from("bookings")
        .select(
          "id, tenant_id, customer_id, provider_id, booking_number, ref_number, total_amount, scheduled_at, payment_status, status, cancelled_at",
        )
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingLookupError || !booking) {
        return notFoundResponse("Booking not found");
      }

      if (user?.id && booking.customer_id !== user.id) {
        return errorResponse(
          "You can only confirm payments for your own bookings.",
          "FORBIDDEN",
          403,
        );
      }

      if (!resourceTenantMatchesHostTenant(tenantId, booking.tenant_id)) {
        return errorResponse(
          "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
          "TENANT_MISMATCH",
          403,
        );
      }

      if (booking.status === "cancelled" || booking.cancelled_at) {
        return errorResponse(
          "This booking was cancelled. If you were charged, contact support for a refund.",
          "BOOKING_CANCELLED",
          409,
        );
      }

      await processSuccessfulPayment(verifiedChargeData, admin);

      const { data: afterPay } = await admin
        .from("bookings")
        .select("payment_status")
        .eq("id", bookingId)
        .maybeSingle();
      const psAfter = ((afterPay?.payment_status as string) || "pending") as string;

      return successResponse({
        status: "success",
        bookingId: bookingId,
        message: "Payment verified successfully",
        payment_status: psAfter,
      });
    }

    return successResponse({
      status: "failed",
      message: "Payment verification failed",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify payment");
  }
}
