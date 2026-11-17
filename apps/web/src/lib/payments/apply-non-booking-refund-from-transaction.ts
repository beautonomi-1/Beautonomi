/**
 * Platform-billing refund side effects when the original charge has no booking_id.
 * Shared by Paystack refund.processed and Stripe refund.created.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, multiplyMoney, subtractMoney } from "@beautonomi/utils";
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

/**
 * How much of a product order a gateway refund still leaves.
 * An in-app refund writes refunded_amount and the charge's refund_amount before
 * this webhook, so that same card refund must not be added again. A later
 * dashboard refund is included via the recorded gateway total.
 */
export function productOrderGatewayRefundUpdate(input: {
  orderTotal: number;
  alreadyRefunded: number;
  refundAmount: number;
  /** Cumulative card refund already stored on the original charge by the in-app tender path. */
  chargeRefunded?: number;
  /** Sum of gateway refund transactions for this charge, including this event once. */
  gatewayRefundsRecorded?: number;
}): { payment_status: "refunded" | "partially_refunded"; refunded_amount: number } {
  const orderTotal = Math.max(0, Number(input.orderTotal) || 0);
  const alreadyRefunded = Math.max(0, Number(input.alreadyRefunded) || 0);
  const incoming = Math.max(0, Number(input.refundAmount) || 0);
  const chargeRefunded = Math.max(0, Number(input.chargeRefunded) || 0);
  const gatewayRecorded = Math.max(0, Number(input.gatewayRefundsRecorded ?? incoming) || 0);
  const previouslyRecorded = Math.max(0, subtractMoney(gatewayRecorded, incoming));
  const nonGateway = Math.max(0, subtractMoney(alreadyRefunded, Math.max(chargeRefunded, previouslyRecorded)));
  const gatewayKnown = Math.max(chargeRefunded, gatewayRecorded);
  const refundedAmount = Math.min(orderTotal, addMoney(nonGateway, gatewayKnown));
  const stillKept = Math.max(0, subtractMoney(orderTotal, refundedAmount));
  const fullyRefunded = stillKept <= 0.009 && (orderTotal > 0.009 || incoming > 0.009 || alreadyRefunded > 0.009);
  return {
    payment_status: fullyRefunded ? "refunded" : "partially_refunded",
    refunded_amount: refundedAmount,
  };
}

/** Provider, fee, and tax shares of a gateway product-order refund. Matches the in-app refund split. */
export function productOrderGatewayRefundLedgerShares(input: {
  applied: number;
  orderTotal: number;
  capturedProviderEarnings: number;
  capturedPlatformFee: number;
  capturedTax: number;
}): { providerEarnings: number; platformFee: number; tax: number } {
  const applied = Math.max(0, Number(input.applied) || 0);
  const orderTotal = Math.max(0, Number(input.orderTotal) || 0);
  if (applied <= 0) return { providerEarnings: 0, platformFee: 0, tax: 0 };
  const capturedEarnings = Number(input.capturedProviderEarnings) || 0;
  const capturedFee = Number(input.capturedPlatformFee) || 0;
  const capturedTax = Number(input.capturedTax) || 0;
  const hasCapture =
    Math.abs(capturedEarnings) > 0.009 || Math.abs(capturedFee) > 0.009 || Math.abs(capturedTax) > 0.009;
  if (!hasCapture) return { providerEarnings: applied, platformFee: 0, tax: 0 };
  const ratio = orderTotal > 0 ? Math.min(1, Math.max(0, applied / orderTotal)) : 1;
  return {
    providerEarnings: multiplyMoney(capturedEarnings, ratio),
    platformFee: multiplyMoney(capturedFee, ratio),
    tax: multiplyMoney(capturedTax, ratio),
  };
}

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
  const { supabase, reference, refundAmountMajor, refundReference, txn, reason } = params;
  if (!txn || txn.booking_id) return;

  const metadata = (txn.metadata ?? {}) as Record<string, unknown>;
  const productOrderId = metadata.product_order_id ?? null;
  const giftCardOrderId =
    metadata.kind === "gift_card_order" ? (metadata.gift_card_order_id ?? null) : null;
  const membershipKind = String(metadata.kind ?? "");
  const membershipOrderId =
    membershipKind === "membership_order" || membershipKind === "membership_renewal"
      ? (metadata.membership_order_id ?? null)
      : null;
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
      .select("id, provider_id, tenant_id, order_number, payment_status, total_amount, refunded_amount, platform_fee")
      .eq("id", String(productOrderId))
      .maybeSingle();

    if (orderRow) {
      const providerId = (orderRow as { provider_id?: string | null }).provider_id ?? null;
      const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: (orderRow as { tenant_id?: string | null }).tenant_id ?? null,
        provider_id: providerId,
      });
      const orderTotal = Number((orderRow as { total_amount?: number }).total_amount || 0);
      const alreadyRefunded = Number((orderRow as { refunded_amount?: number | null }).refunded_amount ?? 0);
      const incomingRefund = refundAmountMajor > 0 ? refundAmountMajor : Number(txn.amount ?? 0);
      const refundRef = String(refundReference || reference);

      const { data: existingProductRefunds } = await supabase
        .from("finance_transactions")
        .select("id, description")
        .eq("product_order_id", String(productOrderId))
        .eq("transaction_type", "refund")
        .limit(50);
      const alreadyPostedThisRefund = (Array.isArray(existingProductRefunds) ? existingProductRefunds : []).some(
        (row) => String((row as { description?: string | null }).description ?? "").includes(refundRef),
      );
      if (alreadyPostedThisRefund) {
        return;
      }

      let chargeRefunded = 0;
      let gatewayRefundsRecorded = incomingRefund;
      const { data: chargeRow } = await supabase
        .from("payment_transactions")
        .select("refund_amount, transaction_type")
        .eq("reference", String(reference))
        .maybeSingle();
      if (chargeRow && String((chargeRow as { transaction_type?: string | null }).transaction_type ?? "") !== "refund") {
        chargeRefunded = Math.max(0, Number((chargeRow as { refund_amount?: number | null }).refund_amount ?? 0));
      }
      const { data: gatewayRows } = await supabase
        .from("payment_transactions")
        .select("amount")
        .eq("transaction_type", "refund")
        .filter("metadata->>original_reference", "eq", String(reference));
      if (Array.isArray(gatewayRows) && gatewayRows.length > 0) {
        gatewayRefundsRecorded = gatewayRows.reduce(
          (sum, row) => addMoney(sum, Math.max(0, Number((row as { amount?: number | null }).amount ?? 0))),
          0,
        );
      }

      const gatewayRefund = productOrderGatewayRefundUpdate({
        orderTotal,
        alreadyRefunded,
        refundAmount: incomingRefund,
        chargeRefunded,
        gatewayRefundsRecorded,
      });
      const applied = Math.max(0, subtractMoney(gatewayRefund.refunded_amount, Math.max(0, alreadyRefunded)));
      if (applied <= 0.009) {
        return;
      }
      const { data: captureRows } = await supabase
        .from("finance_transactions")
        .select("transaction_type, amount, net, metadata")
        .eq("product_order_id", String(productOrderId))
        .in("transaction_type", ["provider_earnings", "platform_fee", "tax"]);
      const captures = Array.isArray(captureRows) ? captureRows : [];
      const capturedSum = (type: string) =>
        captures
          .filter((row) => String((row as { transaction_type?: string }).transaction_type ?? "") === type)
          .reduce(
            (sum, row) =>
              addMoney(sum, Number((row as { net?: number | null; amount?: number | null }).net ?? (row as { amount?: number | null }).amount ?? 0)),
            0,
          );
      const capturedTax = captures
        .filter((row) => String((row as { transaction_type?: string }).transaction_type ?? "") === "tax")
        .reduce((sum, row) => addMoney(sum, Number((row as { amount?: number | null }).amount ?? 0)), 0);
      const taxVatHeld = captures.some((row) => {
        if (String((row as { transaction_type?: string }).transaction_type ?? "") !== "tax") return false;
        const metadata = (row as { metadata?: { vat_held_for_provider?: boolean } | null }).metadata;
        return metadata?.vat_held_for_provider === true;
      });
      const shares = productOrderGatewayRefundLedgerShares({
        applied,
        orderTotal,
        capturedProviderEarnings: capturedSum("provider_earnings"),
        capturedPlatformFee: capturedSum("platform_fee"),
        capturedTax,
      });
      const refundDescription = `Product order gateway refund ${refundRef} (${(orderRow as { order_number?: string }).order_number ?? productOrderId})`;
      const refundRows: Record<string, unknown>[] = [];
      if (shares.providerEarnings > 0) {
        refundRows.push({
          booking_id: null,
          product_order_id: String(productOrderId),
          provider_id: providerId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          refund_component: "provider_earnings",
          amount: shares.providerEarnings,
          fees: 0,
          commission: 0,
          net: -shares.providerEarnings,
          description: refundDescription,
          created_at: new Date().toISOString(),
        });
      }
      if (shares.platformFee > 0) {
        refundRows.push({
          booking_id: null,
          product_order_id: String(productOrderId),
          provider_id: providerId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          refund_component: "platform_fee",
          amount: shares.platformFee,
          fees: 0,
          commission: 0,
          net: -shares.platformFee,
          description: refundDescription,
          created_at: new Date().toISOString(),
        });
      }
      if (shares.tax > 0) {
        const taxRow: Record<string, unknown> = {
          booking_id: null,
          product_order_id: String(productOrderId),
          provider_id: providerId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          refund_component: "tax",
          amount: shares.tax,
          fees: 0,
          commission: 0,
          net: 0,
          description: refundDescription,
          created_at: new Date().toISOString(),
        };
        if (taxVatHeld) taxRow.metadata = { vat_held_for_provider_amount: shares.tax };
        refundRows.push(taxRow);
      }

      await supabase
        .from("product_orders")
        .update({
          payment_status: gatewayRefund.payment_status,
          refunded_amount: gatewayRefund.refunded_amount,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(productOrderId));

      if (refundRows.length > 0) {
        await supabase.from("finance_transactions").insert(refundRows);
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
      .select("id, provider_id, tenant_id, user_id, amount, status")
      .eq("id", String(membershipOrderId))
      .maybeSingle();

    if (orderRow) {
      const providerId = (orderRow as { provider_id?: string | null }).provider_id ?? null;
      const userId = (orderRow as { user_id?: string | null }).user_id ?? null;
      const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: (orderRow as { tenant_id?: string | null }).tenant_id ?? null,
        provider_id: providerId,
      });

      let fullyRefunded = !(providerId && userId);
      if (providerId && userId) {
        const reversal = await reverseMembershipPayment({
          supabase,
          membershipOrderId: String(membershipOrderId),
          providerId,
          userId,
          refundAmountMajor: refundAmountMajor,
          reference: String(params.refundReference || reference),
          tenantIdHint: refundLedgerTenantId,
          reason,
        });
        fullyRefunded = reversal.fullyReversed;
      }

      // membership_orders has no partially_refunded status; a partial refund
      // leaves the order paid and is visible through the refund ledger rows.
      if (fullyRefunded) {
        const refundedAt = new Date().toISOString();
        await supabase
          .from("membership_orders")
          .update({ status: "refunded", refunded_at: refundedAt, updated_at: refundedAt })
          .eq("id", String(membershipOrderId));
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
