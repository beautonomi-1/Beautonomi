/**
 * Platform-billing refund side effects when the original charge has no booking_id.
 * Shared by Paystack refund.processed and Stripe refund.created.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { reverseMembershipPayment } from "@/lib/memberships/reverse-membership-payment";
import { reverseGiftCardOrder } from "@/lib/gift-cards/reverse-gift-card-order";
import { reverseAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";
import { reverseProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import { reverseMarketingCreditTopupPayment } from "@/lib/marketing/marketing-credit-topup-payment";

export type NonBookingRefundTxn = {
  id?: string;
  booking_id?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type ApplyNonBookingRefundParams = {
  supabase: SupabaseClient;
  /** Original charge reference (Paystack ref or Stripe PaymentIntent id). */
  reference: string;
  refundAmountMajor: number;
  /** Idempotency key for this refund (Paystack refund ref or Stripe re_*). */
  refundReference: string;
  txn: NonBookingRefundTxn | null;
  /** e.g. paystack_refund | stripe_refund.created */
  reason: string;
  /** When false, skip customer push notifications (caller handles). */
  notifyCustomer?: boolean;
};

export async function applyNonBookingRefundFromTransaction(
  params: ApplyNonBookingRefundParams,
): Promise<void> {
  const { supabase, reference, refundAmountMajor, txn, reason } = params;
  if (!txn || txn.booking_id) return;

  const metadata = (txn.metadata ?? {}) as Record<string, unknown>;
  const productOrderId = metadata.product_order_id ?? null;
  const giftCardOrderId =
    metadata.kind === "gift_card_order" ? (metadata.gift_card_order_id ?? null) : null;
  const membershipOrderId =
    metadata.kind === "membership_order" ? (metadata.membership_order_id ?? null) : null;
  const adsBudgetOrderId =
    metadata.kind === "ads_budget_order" ? (metadata.ads_budget_order_id ?? null) : null;
  const marketingTopup = metadata.kind === "marketing_credit_topup";
  const subscriptionKind = ["provider_subscription_order", "subscription_authorization", "subscription_renewal"].includes(
    String(metadata.kind ?? ""),
  )
    ? String(metadata.kind)
    : null;

  if (marketingTopup) {
    const marketingProviderId = String(metadata.provider_id ?? "");
    const reversalAmount =
      refundAmountMajor > 0 ? refundAmountMajor : Number(txn.amount ?? 0);
    await reverseMarketingCreditTopupPayment({
      supabase,
      providerId: marketingProviderId,
      reference: String(reference),
      amountMajor: reversalAmount,
      reason,
    });
  } else if (adsBudgetOrderId) {
    await reverseAdsBudgetOrderPayment({
      supabase,
      orderId: String(adsBudgetOrderId),
      finalOrderStatus: "refunded",
      reason,
      reference: String(reference),
    });
  } else if (subscriptionKind) {
    await reverseProviderSubscriptionPayment({
      supabase,
      reason,
      reference: String(reference),
      orderId: (metadata.provider_subscription_order_id as string | null | undefined) ?? null,
      subscriptionCode: (metadata.subscription_code as string | null | undefined) ?? null,
      providerIdHint: (metadata.provider_id as string | null | undefined) ?? null,
    });
  } else if (productOrderId) {
    const { data: orderRow } = await supabase
      .from("product_orders")
      .select("id, provider_id, tenant_id, order_number, payment_status, total_amount, platform_fee")
      .eq("id", String(productOrderId))
      .maybeSingle();

    if (orderRow) {
      const providerId = (orderRow as { provider_id?: string | null }).provider_id ?? null;
      const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: (orderRow as { tenant_id?: string | null }).tenant_id ?? null,
        provider_id: providerId,
      });
      const orderTotal = Number((orderRow as { total_amount?: number }).total_amount || 0);
      const orderPlatformFee = Number((orderRow as { platform_fee?: number }).platform_fee || 0);
      const platformRefundContra =
        orderTotal > 0 && orderPlatformFee > 0
          ? -Math.min(orderPlatformFee, (refundAmountMajor / orderTotal) * orderPlatformFee)
          : 0;

      const { data: existingProductRefund } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("product_order_id", String(productOrderId))
        .eq("transaction_type", "refund")
        .limit(1);

      if (!Array.isArray(existingProductRefund) || existingProductRefund.length === 0) {
        await supabase
          .from("product_orders")
          .update({
            payment_status: "refunded",
            updated_at: new Date().toISOString(),
          })
          .eq("id", String(productOrderId));

        await supabase.from("finance_transactions").insert({
          booking_id: null,
          product_order_id: String(productOrderId),
          provider_id: providerId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          amount: refundAmountMajor,
          fees: 0,
          commission: platformRefundContra,
          net: -refundAmountMajor,
          description: `Product order refund (${(orderRow as { order_number?: string }).order_number ?? productOrderId})`,
          created_at: new Date().toISOString(),
        });
      }
    }
  } else if (giftCardOrderId) {
    const reversal = await reverseGiftCardOrder({
      supabase,
      orderId: String(giftCardOrderId),
      reference: String(reference),
      refundAmountMajor: refundAmountMajor > 0 ? refundAmountMajor : null,
      allowPartial: true,
      reason,
    });
    if (reversal.ok === false) {
      console.error("[non-booking-refund] gift card order reversal not applied", {
        giftCardOrderId,
        reference,
        reason: reversal.reason,
        unspentBalance: reversal.unspentBalance,
      });
    }
  } else if (membershipOrderId) {
    const { data: orderRow } = await supabase
      .from("membership_orders")
      .select("id, provider_id, tenant_id, user_id, total_amount, status")
      .eq("id", String(membershipOrderId))
      .maybeSingle();

    if (orderRow) {
      const providerId = (orderRow as { provider_id?: string | null }).provider_id ?? null;
      const userId = (orderRow as { user_id?: string | null }).user_id ?? null;
      const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: (orderRow as { tenant_id?: string | null }).tenant_id ?? null,
        provider_id: providerId,
      });

      await supabase
        .from("membership_orders")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", String(membershipOrderId));

      if (providerId && userId) {
        await reverseMembershipPayment({
          supabase,
          membershipOrderId: String(membershipOrderId),
          providerId,
          userId,
          refundAmountMajor: refundAmountMajor,
          reference: String(reference),
          tenantIdHint: refundLedgerTenantId,
        });
      }
    }
  } else {
    const origProviderId = metadata.provider_id ?? null;
    if (origProviderId) {
      const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: null,
        provider_id: String(origProviderId),
      });
      await supabase.from("finance_transactions").insert({
        booking_id: null,
        provider_id: String(origProviderId),
        tenant_id: refundLedgerTenantId,
        transaction_type: "refund",
        amount: refundAmountMajor,
        fees: 0,
        commission: 0,
        net: -refundAmountMajor,
        description: `Refund processed (${reference})`,
        created_at: new Date().toISOString(),
      });
    }
  }

  if (params.notifyCustomer === false) return;

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    if (productOrderId) {
      const { data: order } = await supabase
        .from("product_orders")
        .select("id, customer_id, order_number")
        .eq("id", String(productOrderId))
        .maybeSingle();
      const customerId = (order as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Processed",
            message: `Your refund${(order as { order_number?: string } | null)?.order_number ? ` for order ${(order as { order_number?: string }).order_number}` : ""} has been processed.`,
            data: { type: "refund_processed", product_order_id: productOrderId },
            url: "/product-orders",
          },
          ["push"],
          { appType: "customer" },
        );
        await insertNotification({
          user_id: customerId,
          type: "refund_processed",
          title: "Refund Processed",
          message: "Your refund has been processed.",
          data: { product_order_id: productOrderId },
          action_url: "/product-orders",
        });
      }
    }
  } catch (notifError) {
    console.error("[non-booking-refund] customer notification failed:", notifError);
  }
}
