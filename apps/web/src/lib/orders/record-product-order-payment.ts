import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { subtractMoney } from "@beautonomi/utils";
import { clearCustomerCartForProvider } from "@/lib/orders/product-order-lifecycle";
import { ensurePackageEntitlementsFromProductOrder } from "@/lib/orders/ensure-package-entitlements-from-product-order";
import { bookShippingForOrder } from "@/lib/orders/shipping";
import { logger } from "@/lib/utils/logger";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const PLATFORM_HELD_LEG_TYPES = ["payment", "provider_earnings", "platform_fee", "tax"] as const;
const FINANCE_INSERT_MAX_ATTEMPTS = 3;

export type RecordProductOrderPaymentInput = {
  supabase: SupabaseClient;
  productOrderId: string;
  reference: string;
  amountMajor: number;
  feesMajor?: number;
  source:
    | "paystack_verify"
    | "paystack_webhook"
    | "stripe_webhook"
    | "flutterwave_webhook"
    | "paystack_virtual_terminal_allocation"
    | "wallet_checkout"
    | "provider_mark_collected"
    | "walk_in_pos"
    | "paycloud_terminal"
    | "yoco_terminal";
  provider:
    | "paystack"
    | "stripe"
    | "flutterwave"
    | "wallet"
    | "gift_card"
    | "cash"
    | "yoco"
    | "card_on_delivery"
    | "paycloud";
  /** True when Beautonomi/gateway holds money that can become provider payout balance. */
  platformHeld?: boolean;
  /** Backdate ledger rows for already-paid repairs (defaults to now on fresh settlement). */
  ledgerCreatedAt?: string;
  /** Skip cart, shipping, entitlements, promotion, gift capture (cron backfill). */
  skipSideEffects?: boolean;
};

async function notifyLedgerIncomplete(params: {
  tenantId?: string | null;
  productOrderId: string;
  reference: string;
  source: RecordProductOrderPaymentInput["source"];
  provider: RecordProductOrderPaymentInput["provider"];
  reason: "payment_tx" | "finance_insert";
}) {
  Sentry.captureMessage("recordProductOrderPayment.ledgerIncomplete", {
    level: "error",
    extra: params,
  });
  const { slackNotifyProductOrderLedgerIncomplete } = await import(
    "@/lib/integrations/slack/ops-triggers"
  );
  slackNotifyProductOrderLedgerIncomplete({
    tenantId: params.tenantId,
    productOrderId: params.productOrderId,
    reference: params.reference,
    source: params.source,
    provider: params.provider,
    reason: params.reason,
  });
}

async function loadExistingPlatformLegTypes(
  supabase: SupabaseClient,
  productOrderId: string,
  providerId: string | null,
  orderNumber: string,
): Promise<Set<string>> {
  const types = new Set<string>();
  const { data: linked } = await (supabase.from("finance_transactions") as any)
    .select("transaction_type")
    .eq("product_order_id", productOrderId)
    .in("transaction_type", [...PLATFORM_HELD_LEG_TYPES]);
  for (const row of linked ?? []) {
    types.add(String((row as { transaction_type?: string }).transaction_type ?? ""));
  }

  if (!providerId || !orderNumber.trim()) return types;

  const { data: legacy } = await (supabase.from("finance_transactions") as any)
    .select("transaction_type")
    .eq("provider_id", providerId)
    .is("product_order_id", null)
    .ilike("description", `%${orderNumber}%`)
    .in("transaction_type", [...PLATFORM_HELD_LEG_TYPES]);
  for (const row of legacy ?? []) {
    types.add(String((row as { transaction_type?: string }).transaction_type ?? ""));
  }
  return types;
}

async function hasProviderEarningsLedger(
  supabase: SupabaseClient,
  productOrderId: string,
  providerId: string | null,
  orderNumber: string,
): Promise<boolean> {
  const { data: linked } = await (supabase.from("finance_transactions") as any)
    .select("id")
    .eq("product_order_id", productOrderId)
    .eq("transaction_type", "provider_earnings")
    .limit(1);
  if ((linked?.length ?? 0) > 0) return true;

  if (!providerId || !orderNumber.trim()) return false;

  const { data: legacy } = await (supabase.from("finance_transactions") as any)
    .select("id")
    .eq("provider_id", providerId)
    .is("product_order_id", null)
    .eq("transaction_type", "provider_earnings")
    .ilike("description", `%${orderNumber}%`)
    .limit(1);
  return (legacy?.length ?? 0) > 0;
}

function resolveLedgerCreatedAt(
  input: RecordProductOrderPaymentInput,
  order: {
    paid_at?: string | null;
    confirmed_at?: string | null;
    created_at?: string | null;
  },
  transitionedToPaid: boolean,
): string {
  if (input.ledgerCreatedAt?.trim()) return input.ledgerCreatedAt.trim();
  if (transitionedToPaid) return new Date().toISOString();
  const paidAt = typeof order.paid_at === "string" ? order.paid_at.trim() : "";
  if (paidAt) return paidAt;
  const confirmedAt = typeof order.confirmed_at === "string" ? order.confirmed_at.trim() : "";
  if (confirmedAt) return confirmedAt;
  const createdAt = typeof order.created_at === "string" ? order.created_at.trim() : "";
  if (createdAt) return createdAt;
  return new Date().toISOString();
}

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
  const {
    supabase,
    productOrderId,
    reference,
    amountMajor,
    feesMajor = 0,
    source,
    provider,
    skipSideEffects = false,
  } = input;

  const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
    .select(
      "id, tenant_id, provider_id, customer_id, order_number, total_amount, platform_fee, tax_amount, payment_status, payment_reference, status, currency, promotion_id, promotion_discount_amount, gift_card_amount, paid_at, confirmed_at, created_at, wallet_amount",
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw orderErr || new Error("Product order not found");
  }

  const orderNumber = String((order as any).order_number ?? productOrderId);
  const providerId = (order as any).provider_id ?? null;
  let wasAlreadyPaid = String((order as any).payment_status ?? "") === "paid";

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (order as any).tenant_id ?? null,
    provider_id: providerId,
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
  const isPlatformHeld =
    input.platformHeld ??
    (provider === "paystack" ||
      provider === "stripe" ||
      provider === "flutterwave" ||
      provider === "wallet" ||
      provider === "gift_card");
  const giftCardAmount = Math.max(0, Number((order as any).gift_card_amount ?? 0));
  const walletHeld = Math.max(0, Number((order as any).wallet_amount ?? 0));
  // In-person collection still leaves wallet/gift money with the platform.
  // Those legs are payoutable; the cash/terminal remainder is not.
  let supplementalHeld = !isPlatformHeld
    ? Math.round(Math.min(orderTotal, walletHeld + giftCardAmount) * 100) / 100
    : 0;
  let postsHeldLedger = isPlatformHeld || supplementalHeld > 0.009;
  const promotionDiscount = Math.max(0, Number((order as any).promotion_discount_amount ?? 0));
  const orderReferenceForLedger = orderNumber;

  const hasLedger = await hasProviderEarningsLedger(supabase, productOrderId, providerId, orderNumber);

  if ((order as any).payment_status === "paid" && alreadyRecorded && (!postsHeldLedger || hasLedger)) {
    return { ok: true, duplicate: true, transitionedToPaid: false };
  }

  // Capture the gift before the order is marked paid. A false return (not reserved,
  // or the card expired and the balance was restored) means that money is not collected.
  // Release any hold that is still reserved so a later retry cannot take the gift
  // after this payment has already covered the order without it.
  let effectiveGift = giftCardAmount;
  let giftReleaseFailed = false;
  if (!wasAlreadyPaid && !skipSideEffects && effectiveGift > 0.009) {
    const { captureProductOrderGiftCard, voidProductOrderGiftCard } = await import(
      "@/lib/ecommerce/product-order-gift-card"
    );
    const captured = await captureProductOrderGiftCard(supabase, productOrderId);
    if (!captured) {
      const voided = await voidProductOrderGiftCard(supabase, productOrderId);
      if (voided === "failed") {
        giftReleaseFailed = true;
      } else {
        effectiveGift = 0;
        await (supabase.from("product_orders") as any)
          .update({ gift_card_amount: 0, gift_card_id: null })
          .eq("id", productOrderId);
      }
    }
  }

  if (!isPlatformHeld) {
    supplementalHeld = Math.round(Math.min(orderTotal, walletHeld + effectiveGift) * 100) / 100;
    postsHeldLedger = supplementalHeld > 0.009;
  }

  if (!wasAlreadyPaid) {
    const { data: recordedPayments, error: recordedError } = await (supabase.from("payment_transactions") as any)
      .select("amount")
      .eq("status", "success")
      .filter("metadata->>product_order_id", "eq", productOrderId);
    if (recordedError) {
      return { ok: false, duplicate: false, transitionedToPaid: false };
    }
    const alreadyCollected = (recordedPayments ?? []).reduce(
      (sum: number, row: { amount?: number | string | null }) => sum + Number(row.amount ?? 0),
      0,
    );
    const checkoutTender = provider === "wallet" || provider === "gift_card";
    const droppedGift = Math.max(0, giftCardAmount - effectiveGift);
    const incoming = checkoutTender || alreadyRecorded ? 0 : Math.max(0, Number(amountMajor) || 0);
    // Wallet checkout stores the whole order total on amountMajor, including the gift.
    // After a failed capture that total is not money collected.
    const checkoutCover = Math.max(
      walletHeld + effectiveGift,
      Math.max(0, Number(amountMajor) || 0) - droppedGift,
    );
    const collected = checkoutTender
      ? checkoutCover
      : walletHeld + effectiveGift + alreadyCollected + incoming;
    if (giftReleaseFailed || collected + 0.009 < orderTotal) {
      if (!checkoutTender && incoming > 0.009) {
        const { error: partialTxError } = await (supabase.from("payment_transactions") as any).insert({
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
            gift_card_uncaptured: droppedGift > 0.009,
          },
          created_at: new Date().toISOString(),
        });
        if (partialTxError && partialTxError.code !== "23505") {
          return { ok: false, duplicate: false, transitionedToPaid: false };
        }
      }
      return {
        ok: !checkoutTender,
        duplicate: false,
        transitionedToPaid: false,
      };
    }
  }

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
      const { data: freshOrder } = await (supabase.from("product_orders") as any)
        .select("payment_status")
        .eq("id", productOrderId)
        .maybeSingle();
      const currentStatus = String((freshOrder as { payment_status?: string } | null)?.payment_status ?? "");
      const ledgerAfterRace = await hasProviderEarningsLedger(
        supabase,
        productOrderId,
        providerId,
        orderNumber,
      );
      if (currentStatus === "paid") {
        wasAlreadyPaid = true;
        if (alreadyRecorded && (!postsHeldLedger || ledgerAfterRace)) {
          return { ok: true, duplicate: true, transitionedToPaid: false };
        }
      } else if (alreadyRecorded && (!postsHeldLedger || ledgerAfterRace)) {
        return { ok: true, duplicate: true, transitionedToPaid: false };
      } else if (currentStatus !== "paid" && !alreadyRecorded) {
        return { ok: false, duplicate: false, transitionedToPaid: false };
      }
    } else {
      transitionedToPaid = true;
      wasAlreadyPaid = true;

      if (!skipSideEffects) {
        void import("@/lib/analytics/amplitude/track-product-order-paid-server")
          .then(({ trackProductOrderPaidServer }) =>
            trackProductOrderPaidServer({
              reference,
              orderId: productOrderId,
              amount: orderTotal > 0 ? orderTotal : amountMajor,
              currency: (order as any).currency ?? null,
              customerId: (order as any).customer_id ?? null,
              providerId: providerId ?? null,
              paymentMethod: paymentMethodForOrder,
              paymentProvider: provider,
            }),
          )
          .catch(() => undefined);

        const customerId = (order as any).customer_id as string | undefined;
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
    }
  }

  if (effectiveGift > 0.009 && !skipSideEffects && (transitionedToPaid || !alreadyRecorded)) {
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
      await notifyLedgerIncomplete({
        tenantId: financeTenantId,
        productOrderId,
        reference,
        source,
        provider,
        reason: "payment_tx",
      });
      return {
        ok: true,
        duplicate: alreadyRecorded,
        transitionedToPaid,
        ledgerIncomplete: true,
      };
    }
  }

  if (!skipSideEffects) {
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
  }

  if (!postsHeldLedger) {
    return { ok: true, duplicate: alreadyRecorded, transitionedToPaid };
  }

  const feeForLedger = isPlatformHeld ? platformFee : Math.min(platformFee, supplementalHeld);
  let earningsForLedger = isPlatformHeld
    ? providerEarnings
    : Math.max(0, Math.round((supplementalHeld - feeForLedger) * 100) / 100);
  const paymentGrossForLedger = isPlatformHeld ? grossForProvider : earningsForLedger;

  const orderTaxAmount = Math.max(0, Number((order as any).tax_amount ?? 0));
  const vatHeldForProviderPayout =
    isPlatformHeld &&
    (await isFeatureEnabledServer(FEATURE_FLAG_KEYS.FINANCE_PROVIDER_VAT_PAYOUT, financeTenantId));
  let taxForLedger = 0;
  /**
   * VAT reporting vs VAT payout:
   * - Always write a `tax` leg for platform-held orders when `tax_amount` is present so VAT reports
   *   remain factually correct (they are sourced from `finance_transactions` tax legs).
   * - Only *carve* VAT out of provider earnings when VAT payouts are enabled; otherwise VAT remains
   *   inside provider earnings (no payout behavior change).
   */
  if (orderTaxAmount > 0 && isPlatformHeld) {
    taxForLedger = vatHeldForProviderPayout ? Math.min(orderTaxAmount, earningsForLedger) : orderTaxAmount;
    if (vatHeldForProviderPayout) {
      earningsForLedger = Math.max(
        0,
        Math.round((earningsForLedger - taxForLedger) * 100) / 100,
      );
    }
  }

  const ledgerCreatedAt = resolveLedgerCreatedAt(input, order as any, transitionedToPaid);
  const existingLegTypes = await loadExistingPlatformLegTypes(
    supabase,
    productOrderId,
    providerId,
    orderNumber,
  );

  const financeRows: Array<Record<string, unknown>> = [];

  if (!existingLegTypes.has("payment")) {
    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: paymentGrossForLedger,
      fees: feesMajor,
      commission: feeForLedger,
      net: feeForLedger,
      description: `Product order payment ${orderNumber}`,
      created_at: ledgerCreatedAt,
    });
  }

  if (!existingLegTypes.has("provider_earnings")) {
    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: earningsForLedger,
      fees: 0,
      commission: 0,
      net: earningsForLedger,
      description: `Provider earnings from product order ${orderNumber}`,
      created_at: ledgerCreatedAt,
    });
  }

  if (!existingLegTypes.has("platform_fee") && (isPlatformHeld || feeForLedger > 0)) {
    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "platform_fee",
      amount: feeForLedger,
      fees: 0,
      commission: 0,
      net: feeForLedger,
      description: `Platform fee from product order ${orderNumber}`,
      created_at: ledgerCreatedAt,
    });
  }

  if (!existingLegTypes.has("tax") && taxForLedger > 0) {
    const taxMetadata: Record<string, unknown> = { vat_source: "product_order" };
    if (vatHeldForProviderPayout) taxMetadata.vat_held_for_provider = true;
    financeRows.push({
      booking_id: null,
      product_order_id: productOrderId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "tax",
      amount: taxForLedger,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tax from product order ${orderNumber}`,
      metadata: taxMetadata,
      created_at: ledgerCreatedAt,
    });
  }

  if (financeRows.length === 0) {
    return { ok: true, duplicate: true, transitionedToPaid };
  }

  let financeInsertError: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < FINANCE_INSERT_MAX_ATTEMPTS; attempt++) {
    const { error } = await (supabase.from("finance_transactions") as any).insert(financeRows);
    if (!error) {
      financeInsertError = null;
      break;
    }
    financeInsertError = error;
    if (attempt < FINANCE_INSERT_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }

  if (financeInsertError) {
    logger.error(
      "recordProductOrderPayment.financeInsert.failed",
      financeInsertError,
      { productOrderId, reference },
    );
    await notifyLedgerIncomplete({
      tenantId: financeTenantId,
      productOrderId,
      reference,
      source,
      provider,
      reason: "finance_insert",
    });
    return {
      ok: true,
      duplicate: false,
      transitionedToPaid,
      ledgerIncomplete: true,
    };
  }

  if (promotionDiscount > 0 || giftCardAmount > 0) {
    const { postProductOrderTenderLegsIfMissing } = await import(
      "@/lib/ecommerce/product-order-tender-legs"
    );
    await postProductOrderTenderLegsIfMissing(supabase, {
      productOrderId,
      providerId,
      tenantId: financeTenantId,
      orderNumber: String(orderReferenceForLedger),
      currency: (order as any).currency ?? null,
      promotionDiscount,
      giftCardAmount,
      createdAt: ledgerCreatedAt,
    });
  }

  return { ok: true, duplicate: false, transitionedToPaid };
}
