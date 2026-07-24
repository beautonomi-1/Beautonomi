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
  provider: "paystack" | "wallet" | "cash" | "yoco" | "card_on_delivery" | "paycloud";
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
      "id, tenant_id, provider_id, customer_id, order_number, total_amount, platform_fee, payment_status, payment_reference, status",
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
  const isPlatformHeld = input.platformHeld ?? (provider === "paystack" || provider === "wallet");
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

    const customerId = (order as any).customer_id as string | undefined;
    const providerId = (order as any).provider_id as string | undefined;
    if (customerId && providerId) {
      await clearCustomerCartForProvider(supabase, customerId, providerId);
    }
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

  return { ok: true, duplicate: false, transitionedToPaid };
}

