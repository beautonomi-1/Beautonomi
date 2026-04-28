import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  requireRoleInApi,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { applyWalletTopupFromSuccessfulPaystackCharge } from "@/lib/wallet/apply-wallet-topup-from-paystack-success";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";

/**
 * GET /api/paystack/verify
 * 
 * Verify Paystack payment status
 * Requires authentication (any role)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { searchParams } = new URL(request.url);
    const reference =
      searchParams.get("reference") || searchParams.get("trxref");

    if (!reference) {
      return successResponse({ status: "error", message: "Reference required" });
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
      const metadata = data.data.metadata || {};
      // §Customer-launch (audit 2026-04): forward the request so Bearer
      // tokens from the mobile app are honoured during Paystack
      // verification (RLS was rejecting all mobile verify calls).
      const supabase = await getSupabaseServer(request);
      const tenantRegion = await getTenantRegionConfig(tenantId);
      const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
      const paidCurrency =
        typeof data.data.currency === "string" && data.data.currency.length >= 3
          ? data.data.currency.toUpperCase()
          : fallbackCurrency;

      // Handle product order payments
      const productOrderId = metadata.product_order_id;
      if (productOrderId) {
        const { data: poBefore } = await (supabase.from("product_orders") as any)
          .select("tenant_id, provider_id")
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

        const productOrderTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: (poBefore as { tenant_id?: string | null }).tenant_id,
          provider_id: (poBefore as { provider_id?: string | null }).provider_id,
        });
        await recordProductOrderPayment({
          supabase: getSupabaseAdmin() as any,
          productOrderId,
          reference,
          amountMajor: Number(data.data.amount || 0) / 100,
          feesMajor: Number(data.data.fees || 0) / 100,
          source: "paystack_verify",
          provider: "paystack",
        });

        const { data: po } = await (supabase.from("product_orders") as any)
          .select("customer_id, provider_id, order_number, total_amount")
          .eq("id", productOrderId)
          .single();

        if (po) {
          const amountMajor = data.data.amount / 100;
          const { format: fmtPo } = await getTenantMoneyFormatter(productOrderTenantId);
          void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
            insertNotification({
              user_id: po.customer_id,
              type: "product_order_update",
              title: "Order Confirmed",
              message: `Your order ${po.order_number} has been confirmed and paid.`,
              data: { product_order_id: productOrderId, amount: amountMajor },
              action_url: `/product-orders`,
            })
          );

          if (po.provider_id) {
            await notifyProviderTeamUsers(po.provider_id, {
              type: "product_order_update",
              title: "New Product Order",
              message: `New product order ${po.order_number} received — ${fmtPo(amountMajor)}.`,
              data: { product_order_id: productOrderId, amount: amountMajor },
              action_url: `/provider/ecommerce/orders?order=${encodeURIComponent(productOrderId)}`,
            });
          }
        }

        // Track payment via Amplitude
        trackServer("product_order_paid", {
          order_id: productOrderId,
          order_number: po?.order_number,
          amount: data.data.amount / 100,
          payment_method: "paystack",
          currency: paidCurrency,
        }, po?.customer_id).catch(() => {});

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
        const admin = getSupabaseAdmin();
        const { data: topupLookup } = await admin
          .from("wallet_topups")
          .select("user_id")
          .eq("id", walletTopupId)
          .maybeSingle();
        if (!topupLookup) {
          return notFoundResponse("Wallet top-up not found");
        }
        if ((topupLookup as { user_id?: string }).user_id !== user.id) {
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
          },
          admin as any,
        );
        return successResponse({
          status: "success",
          type: "wallet_topup",
          message: "Wallet top-up confirmed",
        });
      }

      if (metadata?.gift_card_order_id) {
        const admin = getSupabaseAdmin();
        const giftCardOrderId = String(metadata.gift_card_order_id);
        const { data: orderLookup } = await admin
          .from("gift_card_orders")
          .select("purchaser_user_id")
          .eq("id", giftCardOrderId)
          .maybeSingle();
        if (!orderLookup) {
          return notFoundResponse("Gift card order not found");
        }
        if ((orderLookup as { purchaser_user_id?: string | null }).purchaser_user_id !== user.id) {
          return errorResponse(
            "You can only confirm your own gift card purchases.",
            "FORBIDDEN",
            403,
          );
        }
        await processSuccessfulPayment(data.data, admin);
        return successResponse({
          status: "success",
          type: "gift_card_order",
          giftCardOrderId,
          message: "Gift card purchase confirmed",
        });
      }

      if (metadata?.kind === "card_verification") {
        await processSuccessfulPayment(data.data, getSupabaseAdmin());
        return successResponse({
          status: "success",
          type: "card_verification",
          message: "Card verification confirmed",
        });
      }

      if (metadata?.ads_budget_order_id) {
        await processSuccessfulPayment(data.data, getSupabaseAdmin());
        return successResponse({
          status: "success",
          type: "ads_budget_order",
          adsBudgetOrderId: String(metadata.ads_budget_order_id),
          campaignId: metadata.campaign_id ? String(metadata.campaign_id) : null,
          message: "Ads payment confirmed",
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

      const { data: booking, error: bookingLookupError } = await supabase
        .from("bookings")
        .select(
          "id, tenant_id, customer_id, provider_id, booking_number, ref_number, total_amount, scheduled_at, payment_status, status, cancelled_at",
        )
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingLookupError || !booking) {
        return notFoundResponse("Booking not found");
      }

      if (booking.customer_id !== user.id) {
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

      const admin = getSupabaseAdmin();
      await processSuccessfulPayment(data.data, admin);

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
