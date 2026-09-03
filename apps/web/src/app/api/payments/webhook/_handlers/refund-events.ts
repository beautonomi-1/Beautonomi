/**
 * Refund Event Handlers
 *
 * Handles Paystack refund webhook events:
 *   - refund.processed — Refund completed successfully
 *   - refund.failed    — Refund failed
 */
import { NextResponse } from "next/server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { reverseMembershipPayment } from "@/lib/memberships/reverse-membership-payment";
import { reverseGiftCardOrder } from "@/lib/gift-cards/reverse-gift-card-order";
import { reverseAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";
import { reverseProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import { reverseMarketingCreditTopupPayment } from "@/lib/marketing/marketing-credit-topup-payment";
import { resolveBookingPaymentIdForRefund } from "@/lib/bookings/resolve-booking-refund-payment-id";

// ─── Exported Handler ────────────────────────────────────────────────────────

/**
 * Handle all refund.* events — update payment / transaction records.
 */
export async function handleRefundEvent(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  const { event: eventType, data } = event;

  if (eventType === "refund.processed") {
    await handleRefundProcessed(data, supabase);
  } else if (eventType === "refund.failed") {
    await handleRefundFailed(data, supabase);
  } else {
    console.log(`Unhandled refund event type: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}

// ─── Internal Handlers ───────────────────────────────────────────────────────

async function handleRefundProcessed(data: Record<string, unknown>, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundAmount = data?.amount != null ? convertFromSmallestUnit(Number(data.amount)) : 0;
  const refundReference = data?.refund_reference || data?.id;

  if (!reference) {
    console.log("Refund processed event missing transaction reference");
    return;
  }

  // Find the original payment transaction (include metadata to detect product orders)
  const { data: txn } = await supabase.from("payment_transactions")
    .select("id, booking_id, amount, metadata")
    .eq("reference", reference)
    .eq("status", "success")
    .maybeSingle();

  // Idempotency: skip if this refund reference was already recorded
  const refundRef = String(refundReference || reference);
  const { data: existingRefund } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", refundRef)
    .eq("transaction_type", "refund")
    .maybeSingle();

  if (existingRefund) {
    console.log(`Paystack refund ${refundRef} already recorded, skipping (idempotent)`);
    return;
  }

  await supabase.from("payment_transactions").insert({
    booking_id: txn?.booking_id || null,
    reference: refundRef,
    amount: refundAmount,
    fees: 0,
    net_amount: refundAmount,
    status: "refunded",
    provider: "paystack",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      refund_reference: refundReference,
      paystack_data: data,
    },
    created_at: new Date().toISOString(),
  });

  if (txn?.booking_id) {
    // Booking-linked refund: keep full vs partial refund state honest.
    // The create_finance_ledger_from_booking_refund trigger (migration 490) is the
    // SOLE writer of the finance_transactions refund entry; app-side inserts have
    // been removed to prevent duplicate ledger rows.
    // Resolve the originating booking_payments row so booking_refunds.payment_id is set.
    // Without it the DB trigger still fires but the ledger entry won't carry source_payment_id.
    const bookingPaymentId = await resolveBookingPaymentIdForRefund(
      supabase,
      txn.booking_id,
      String(reference),
    );

    // Idempotency: do not insert a duplicate booking_refunds row for the same refund reference.
    const { data: existingBookingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", String(refundReference || reference))
      .maybeSingle();

    if (!existingBookingRefund) {
      await (supabase.from("booking_refunds") as any).insert({
        booking_id: txn.booking_id,
        payment_id: bookingPaymentId,
        amount: refundAmount,
        reason: `Paystack webhook: ${reference}`,
        refund_method: "original",
        refund_provider_id: String(refundReference || reference),
        status: "completed",
        notes: `Auto-created by refund webhook handler`,
      });
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, customer_id, booking_number")
        .eq("id", txn.booking_id)
        .maybeSingle();
      const customerId = (booking as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Processed",
            message: `Your refund${(booking as { booking_number?: string } | null)?.booking_number ? ` for booking ${(booking as { booking_number?: string }).booking_number}` : ""} has been processed.`,
            data: { type: "refund_processed", booking_id: txn.booking_id },
            url: txn.booking_id ? `/bookings/${txn.booking_id}` : "/bookings",
          },
          ["push"],
          { appType: "customer" },
        );
        await insertNotification({
          user_id: customerId,
          type: "refund_processed",
          title: "Refund Processed",
          message: "Your refund has been processed.",
          data: { booking_id: txn.booking_id },
          action_url: txn.booking_id ? `/bookings/${txn.booking_id}` : "/bookings",
        });
      }
    } catch (notifError) {
      console.error("Failed to send refund processed booking notification:", notifError);
    }
  } else {
    // Non-booking refund: check if this is a product order refund via metadata
    const metadata = (txn as any)?.metadata ?? {};
    const productOrderId = metadata?.product_order_id ?? null;
    const giftCardOrderId =
      metadata?.kind === "gift_card_order" ? (metadata?.gift_card_order_id ?? null) : null;
    const membershipOrderId =
      metadata?.kind === "membership_order" ? (metadata?.membership_order_id ?? null) : null;
    const adsBudgetOrderId =
      metadata?.kind === "ads_budget_order" ? (metadata?.ads_budget_order_id ?? null) : null;
    const marketingTopup = metadata?.kind === "marketing_credit_topup";
    const subscriptionKind = [
      "provider_subscription_order",
      "subscription_authorization",
      "subscription_renewal",
    ].includes(metadata?.kind)
      ? metadata.kind
      : null;

    if (marketingTopup) {
      // Marketing credit top-up refund: claw back unspent purchased credits and
      // back out the recognized revenue (posts provider_marketing_credit_refund).
      const marketingProviderId = String(metadata?.provider_id ?? "");
      const reversalAmount = refundAmount > 0 ? refundAmount : Number((txn as any)?.amount ?? 0);
      await reverseMarketingCreditTopupPayment({
        supabase,
        providerId: marketingProviderId,
        reference: String(reference),
        amountMajor: reversalAmount,
        reason: "paystack_refund",
      });
    } else if (adsBudgetOrderId) {
      // Ads pre-pay refund: stop serving and fully back out the recognized
      // revenue via the shared idempotent reverse helper (posts provider_ads_refund).
      await reverseAdsBudgetOrderPayment({
        supabase,
        orderId: String(adsBudgetOrderId),
        finalOrderStatus: "refunded",
        reason: "paystack_refund",
        reference: String(reference),
      });
    } else if (subscriptionKind) {
      // Subscription refund: back out the recognized revenue (provider_subscription_refund),
      // disable Paystack recurring billing, and fall the provider back to free.
      await reverseProviderSubscriptionPayment({
        supabase,
        reason: "paystack_refund",
        reference: String(reference),
        orderId: metadata?.provider_subscription_order_id ?? null,
        subscriptionCode: metadata?.subscription_code ?? null,
        providerIdHint: metadata?.provider_id ?? null,
      });
    } else if (productOrderId) {
      const { data: orderRow } = await supabase
        .from("product_orders")
        .select("id, provider_id, tenant_id, order_number, payment_status, total_amount, platform_fee")
        .eq("id", productOrderId)
        .maybeSingle();

      if (orderRow) {
        const providerId = (orderRow as any).provider_id ?? null;
        const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: (orderRow as any).tenant_id ?? null,
          provider_id: providerId,
        });
        const orderTotal = Number((orderRow as any).total_amount || 0);
        const orderPlatformFee = Number((orderRow as any).platform_fee || 0);
        const platformRefundContra =
          orderTotal > 0 && orderPlatformFee > 0
            ? -Math.min(orderPlatformFee, (refundAmount / orderTotal) * orderPlatformFee)
            : 0;

        const { data: existingProductRefund } = await supabase
          .from("finance_transactions")
          .select("id")
          .eq("product_order_id", productOrderId)
          .eq("transaction_type", "refund")
          .limit(1);

        if (!Array.isArray(existingProductRefund) || existingProductRefund.length === 0) {
          await (supabase.from("product_orders") as any)
            .update({
              payment_status: "refunded",
              updated_at: new Date().toISOString(),
            })
            .eq("id", productOrderId);

          await supabase.from("finance_transactions").insert({
            booking_id: null,
            product_order_id: productOrderId,
            provider_id: providerId,
            tenant_id: refundLedgerTenantId,
            transaction_type: "refund",
            amount: refundAmount,
            fees: 0,
            commission: platformRefundContra,
            net: -refundAmount,
            description: `Product order refund (${(orderRow as any).order_number ?? productOrderId})`,
            created_at: new Date().toISOString(),
          });
        }
      }
    } else if (giftCardOrderId) {
      // Gift card refund: void the unspent cards and back out the 2400 liability
      // (posts gift_card_refund; idempotent on the Paystack reference). The money
      // has already left via Paystack, so a partially-spent order is refunded for
      // the unspent remainder only — never more than the liability still on book.
      const reversal = await reverseGiftCardOrder({
        supabase,
        orderId: String(giftCardOrderId),
        reference: String(reference ?? ""),
        refundAmountMajor: refundAmount > 0 ? refundAmount : null,
        allowPartial: true,
        reason: "paystack_refund",
      });
      if (reversal.ok === false) {
        console.error("[refund-events] gift card order reversal not applied", {
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
        .eq("id", membershipOrderId)
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
          .eq("id", membershipOrderId);

        if (providerId && userId) {
          await reverseMembershipPayment({
            supabase,
            membershipOrderId,
            providerId,
            userId,
            refundAmountMajor: refundAmount,
            reference: String(reference ?? ""),
            tenantIdHint: refundLedgerTenantId,
          });
        }
      }
    } else if (txn) {
      // Generic non-booking, non-product-order refund: still record ledger for completeness
      // Try to resolve provider from the original payment_transactions metadata
      const origMeta = (txn as any)?.metadata ?? {};
      const origProviderId = origMeta?.provider_id ?? null;
      if (origProviderId) {
        const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: null,
          provider_id: origProviderId,
        });
        await supabase.from("finance_transactions").insert({
          booking_id: null,
          provider_id: origProviderId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          amount: refundAmount,
          fees: 0,
          commission: 0,
          net: -refundAmount,
          description: `Refund processed (${reference})`,
          created_at: new Date().toISOString(),
        });
      }
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      const metadata = (txn as any)?.metadata ?? {};
      const productOrderId = metadata?.product_order_id ?? null;
      if (productOrderId) {
        const { data: order } = await (supabase.from("product_orders") as any)
          .select("id, customer_id, order_number")
          .eq("id", productOrderId)
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
      console.error("Failed to send refund processed order notification:", notifError);
    }
  }

  console.log(`Refund processed for transaction ${reference} — ${refundAmount}`);

  if (refundAmount > 0) {
    void import("@/lib/integrations/slack/ops-triggers")
      .then(({ slackNotifyHighValueRefund }) =>
        slackNotifyHighValueRefund({
          refundId: refundRef,
          bookingId: (txn as { booking_id?: string | null } | null)?.booking_id ?? null,
          amountMajor: refundAmount,
          stage: "processed",
          reason: "paystack_refund.processed",
        }),
      )
      .catch(() => undefined);
  }
}

async function handleRefundFailed(data: Record<string, unknown>, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundReference = data?.refund_reference || data?.id;
  const reason = data?.message || data?.gateway_response || "Refund failed";

  if (!reference) {
    console.log("Refund failed event missing transaction reference");
    return;
  }

  // Record failed refund for audit
  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: String(refundReference || reference),
    amount: 0,
    fees: 0,
    net_amount: 0,
    status: "failed",
    provider: "paystack",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      refund_reference: refundReference,
      failure_reason: reason,
      paystack_data: data,
    },
    created_at: new Date().toISOString(),
  });

  try {
    const { data: originalTxn } = await supabase
      .from("payment_transactions")
      .select("booking_id, metadata")
      .eq("reference", String(reference))
      .maybeSingle();
    const { sendToUser } = await import("@/lib/notifications/onesignal");

    const bookingId = (originalTxn as { booking_id?: string | null } | null)?.booking_id ?? null;
    const metadata = ((originalTxn as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {};
    if (bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("customer_id")
        .eq("id", bookingId)
        .maybeSingle();
      const customerId = (booking as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Failed",
            message: "Your refund could not be processed. Please contact support.",
            data: { type: "refund_failed", booking_id: bookingId },
            url: `/bookings/${bookingId}`,
          },
          ["push"],
          { appType: "customer" },
        );
      }
    } else if (metadata?.product_order_id) {
      const { data: order } = await (supabase.from("product_orders") as any)
        .select("customer_id, id")
        .eq("id", metadata.product_order_id)
        .maybeSingle();
      const customerId = (order as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Failed",
            message: "Your refund could not be processed. Please contact support.",
            data: { type: "refund_failed", product_order_id: metadata.product_order_id },
            url: "/product-orders",
          },
          ["push"],
          { appType: "customer" },
        );
      }
    }
  } catch (notifError) {
    console.error("Failed to send refund failed notification:", notifError);
  }

  console.log(`Refund failed for transaction ${reference}: ${reason}`);
}
