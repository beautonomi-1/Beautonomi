import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { subtractMoney } from "@beautonomi/utils";
import { clearCustomerCartForProvider } from "@/lib/orders/product-order-lifecycle";
import { ensurePackageEntitlementsFromProductOrder } from "@/lib/orders/ensure-package-entitlements-from-product-order";
import { bookShippingForOrder } from "@/lib/orders/shipping";
import { logger } from "@/lib/utils/logger";

type RecordProductOrderPaymentInput = {
  supabase: SupabaseClient;
  productOrderId: string;
  reference: string;
  amountMajor: number;
  feesMajor?: number;
  source:
    | "paystack_verify"
    | "paystack_webhook"
    | "paystack_virtual_terminal_allocation"
    | "wallet_checkout"
    | "provider_mark_collected"
    | "walk_in_pos"
    | "paycloud_terminal"
    | "yoco_terminal";
  provider: "paystack" | "wallet" | "gift_card" | "cash" | "yoco" | "card_on_delivery" | "paycloud";
  /** True when Beautonomi/gateway holds money that can become provider payout balance. */
  platformHeld?: boolean;
};

export async function recordProductOrderPayment(
  input: RecordProductOrderPaymentInput,
): Promise<{ ok: boolean; duplicate: boolean; transitionedToPaid: boolean; ledgerIncomplete?: boolean }> {
  return Sentry.startSpan(
    {
      name: "finance.recordProductOrderPayment",
      op: "finance.ledger.write",
      attributes: {
        "finance.product_order_id": input.productOrderId,
        "finance.provider": input.provider,
        "finance.source": input.source,
        "finance.amount": input.amountMajor,
      },
    },
    () => recordProductOrderPaymentInner(input),
  );
}

async function recordProductOrderPaymentInner(
  input: RecordProductOrderPaymentInput,
): Promise<{ ok: boolean; duplicate: boolean; transitionedToPaid: boolean; ledgerIncomplete?: boolean }> {
  const { supabase, productOrderId, reference, amountMajor, feesMajor = 0, source, provider } = input;

  const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
    .select(
      "id, tenant_id, provider_id, customer_id, order_number, total_amount, platform_fee, payment_status, payment_reference, status, currency, promotion_id, promotion_discount_amount, gift_card_amount",
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw orderErr || new Error("Product order not found");
  }

  const wasAlreadyPaid = String((order as any).payment_status ?? "") === "paid";

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (order as any).tenant_id ?? null,
    provider_id: (order as any).provider_id ?? null,
  });

  const existingTx = await (supabase.from("payment_transactions") as any)
    .select("id")
    .eq("provider", provider)
    .eq("reference", reference)
    .maybeSingle();
  const alreadyRecorded = Boolean(existingTx.data);

  const platformFee = Number((order as any).platform_fee || 0);
  const orderTotal = Number((order as any).total_amount || amountMajor);
  const grossForProvider = Math.max(0, subtractMoney(orderTotal, platformFee));
  const providerEarnings = grossForProvider;
  // Gift-card tender is platform liability (2400) being consumed — platform-held like wallet.
  const isPlatformHeld =
    input.platformHeld ?? (provider === "paystack" || provider === "wallet" || provider === "gift_card");
  const giftCardAmount = Math.max(0, Number((order as any).gift_card_amount ?? 0));
  const promotionDiscount = Math.max(0, Number((order as any).promotion_discount_amount ?? 0));
  const orderReferenceForLedger = (order as any).order_number ?? productOrderId;
  const { data: existingLedgerRows } = await (supabase.from("finance_transactions") as any)
    .select("id")
    .eq("provider_id", (order as any).provider_id ?? null)
    .eq("transaction_type", "provider_earnings")
    .eq("product_order_id", productOrderId);

  // If the order was already marked paid and both the gateway audit row and
  // platform-held provider ledger are present, this is an idempotent retry.
  if ((order as any).payment_status === "paid" && alreadyRecorded && (!isPlatformHeld || (existingLedgerRows?.length ?? 0) > 0)) {
    return { ok: true, duplicate: true, transitionedToPaid: false };
  }

  // product_orders stores tender on payment_method (cash/yoco/paycloud/paystack/…);
  // there is no payment_provider column — payment_provider_id is the gateway reference.
  const paymentMethodForOrder =
    provider === "card_on_delivery" ? "card_on_delivery" : provider;

  let transitionedToPaid = false;
  if (!wasAlreadyPaid) {
    const { data: updatedRows, error: orderUpdateError } = await (supabase.from("product_orders") as any)
      .update({
        tenant_id: financeTenantId,
        payment_status: "paid",
        payment_reference: reference,
        payment_method: paymentMethodForOrder,
        status: String((order as any).status ?? "") === "pending" ? "confirmed" : (order as any).status,
        confirmed_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
      })
      .eq("id", productOrderId)
      .eq("payment_status", "pending")
      .select("id");
    if (orderUpdateError) throw orderUpdateError;
    if ((updatedRows?.length ?? 0) === 0) {
      const currentStatus = String((order as any).payment_status ?? "");
      if (currentStatus === "paid" || alreadyRecorded) {
        return { ok: true, duplicate: true, transitionedToPaid: false };
      }
      return { ok: false, duplicate: false, transitionedToPaid: false };
    }
    transitionedToPaid = true;

    void import("@/lib/analytics/amplitude/track-product-order-paid-server")
      .then(({ trackProductOrderPaidServer }) =>
        trackProductOrderPaidServer({
          reference,
          orderId: productOrderId,
          amount: amountMajor,
          currency: (order as any).currency ?? null,
          customerId: (order as any).customer_id ?? null,
          providerId: (order as any).provider_id ?? null,
          paymentMethod: paymentMethodForOrder,
          paymentProvider: provider,
        }),
      )
      .catch(() => undefined);

    const customerId = (order as any).customer_id as string | undefined;
    const providerId = (order as any).provider_id as string | undefined;
    if (customerId && providerId) {
      await clearCustomerCartForProvider(supabase, customerId, providerId);
    }

    const promotionId = (order as any).promotion_id as string | null | undefined;
    if (promotionId && customerId && promotionDiscount > 0) {
      const { recordProductOrderPromotionUsage } = await import(
        "@/lib/ecommerce/product-order-promotion"
      );
      await recordProductOrderPromotionUsage(supabase, {
        promotionId,
        userId: customerId,
        productOrderId,
        discountAmount: promotionDiscount,
      });
    }
  }

  // Gift card reserved at checkout becomes a real redemption once the order is paid
  // (idempotent RPC; safe on verify + webhook double-fire).
  if (giftCardAmount > 0 && (transitionedToPaid || !alreadyRecorded)) {
    const { captureProductOrderGiftCard } = await import("@/lib/ecommerce/product-order-gift-card");
    await captureProductOrderGiftCard(supabase, productOrderId);
  }

  if (!alreadyRecorded) {
    const { error: paymentTxError } = await (supabase.from("payment_transactions") as any).insert({
      booking_id: null,
      reference,
      amount: amountMajor,
      fees: feesMajor,
      net_amount: subtractMoney(amountMajor, feesMajor),
      status: "success",
      provider,
      transaction_type: "charge",
      metadata: {
        kind: "product_order",
        product_order_id: productOrderId,
        source,
      },
      created_at: new Date().toISOString(),
    });
    if (paymentTxError) {
      if (paymentTxError.code === "23505") {
        return { ok: true, duplicate: true, transitionedToPaid };
      }
      logger.error(
        "recordProductOrderPayment.paymentTx.failed",
        paymentTxError,
        { productOrderId, reference },
      );
      return {
        ok: true,
        duplicate: alreadyRecorded,
        transitionedToPaid,
        ledgerIncomplete: true,
      };
    }
  }

  try {
    await ensurePackageEntitlementsFromProductOrder(supabase, productOrderId);
  } catch (e) {
    logger.error(
      "recordProductOrderPayment.ensurePackageEntitlements.failed",
      e,
      { productOrderId },
    );
  }

  try {
    const shippingResult = await bookShippingForOrder(supabase, productOrderId);
    if (!shippingResult.ok) {
      logger.error("recordProductOrderPayment.bookShipping.failed", shippingResult.error, { productOrderId });
    }
  } catch (e) {
    logger.error("recordProductOrderPayment.bookShipping.unhandled", e, { productOrderId });
  }

  // Provider-collected product/COD/POS money is tracked on product_orders and
  // payment_transactions only. It is intentionally excluded from
  // finance_transactions because that ledger drives platform-held payouts and
  // shadow GL; adding provider-collected cash here would overstate payable cash.
  if (!isPlatformHeld) {
    return { ok: true, duplicate: alreadyRecorded, transitionedToPaid };
  }

  const financeRows = [
    {
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: isPlatformHeld ? grossForProvider : orderTotal,
      fees: feesMajor,
      commission: isPlatformHeld ? platformFee : 0,
      net: isPlatformHeld ? platformFee : 0,
      description: `${isPlatformHeld ? "Product order payment" : "Provider-collected product order payment"} ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    },
  ];

  if (isPlatformHeld) {
    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings from product order ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    });

    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: "platform_fee",
      amount: platformFee,
      fees: 0,
      commission: 0,
      net: platformFee,
      description: `Platform fee from product order ${(order as any).order_number ?? productOrderId}`,
      created_at: new Date().toISOString(),
    });
  }

  const { error: financeInsertError } = await (supabase.from("finance_transactions") as any).insert(financeRows);
  if (financeInsertError) {
    logger.error(
      "recordProductOrderPayment.financeInsert.failed",
      financeInsertError,
      { productOrderId, reference },
    );
    return {
      ok: true,
      duplicate: false,
      transitionedToPaid,
      ledgerIncomplete: true,
    };
  }

  // Promotion / gift-card audit legs (parity with booking ledger; idempotent per type).
  if (promotionDiscount > 0 || giftCardAmount > 0) {
    const { postProductOrderTenderLegsIfMissing } = await import(
      "@/lib/ecommerce/product-order-tender-legs"
    );
    await postProductOrderTenderLegsIfMissing(supabase, {
      productOrderId,
      providerId: (order as any).provider_id ?? null,
      tenantId: financeTenantId,
      orderNumber: String(orderReferenceForLedger),
      currency: (order as any).currency ?? null,
      promotionDiscount,
      giftCardAmount,
    });
  }

  return { ok: true, duplicate: false, transitionedToPaid };
}

