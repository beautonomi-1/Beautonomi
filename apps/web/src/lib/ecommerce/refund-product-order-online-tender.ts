/**
 * Return the card (gateway) portion of a paid product order to the original tender.
 *
 * Tender split on a product order:
 *   total_amount = gift_card_amount + wallet_amount + online (card) portion
 *
 * Gift card → re-credited to the card by `voidProductOrderGiftCard`; wallet → wallet
 * credit; the card portion is refunded here through the payment provider's refund
 * capability (Paystack or Stripe). If the gateway refund fails the caller falls back to
 * a wallet credit so the customer is never left unpaid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

export type OnlineTenderOrder = {
  id: string;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  currency?: string | null;
  tenant_id?: string | null;
  order_number?: string | null;
};

const GATEWAY_METHODS = new Set(["paystack", "stripe", "flutterwave", "card", "online"]);

/** Pure: card/gateway portion of the order total (never negative). */
export function computeProductOrderOnlinePortion(order: OnlineTenderOrder): number {
  const total = Math.max(0, Number(order.total_amount ?? 0));
  const wallet = Math.max(0, Number(order.wallet_amount ?? 0));
  const gift = Math.max(0, Number(order.gift_card_amount ?? 0));
  return Math.max(0, subtractMoney(subtractMoney(total, wallet), gift));
}

export type RefundOnlineTenderResult = {
  attempted: boolean;
  refundedAmount: number;
  refundId: string | null;
  error?: string;
};

export async function refundProductOrderOnlineTender(
  admin: SupabaseClient,
  order: OnlineTenderOrder,
  opts: { reason: string; idempotencyKey: string; amountMajor?: number },
): Promise<RefundOnlineTenderResult> {
  const onlineCap = computeProductOrderOnlinePortion(order);
  const requested =
    typeof opts.amountMajor === "number" && Number.isFinite(opts.amountMajor)
      ? Math.max(0, opts.amountMajor)
      : onlineCap;
  const portion = Math.min(onlineCap, requested);
  const method = String(order.payment_method ?? "").toLowerCase();
  const reference = order.payment_reference ?? null;
  if (order.payment_status !== "paid" || portion <= 0 || !GATEWAY_METHODS.has(method)) {
    return { attempted: false, refundedAmount: 0, refundId: null };
  }

  const currency = order.currency ?? "ZAR";
  const tenantId = order.tenant_id ?? null;
  type ChargeRow = {
    id?: string;
    amount?: number | string | null;
    reference?: string | null;
    provider?: string | null;
    refund_amount?: number | string | null;
    status?: string | null;
  };
  let rows: ChargeRow[] = [];
  try {
    const { data, error } = await (admin.from("payment_transactions") as any)
      .select("id, amount, reference, provider, refund_amount, status")
      .in("status", ["success", "refunded", "partially_refunded"])
      .filter("metadata->>product_order_id", "eq", order.id);
    if (error) {
      return { attempted: true, refundedAmount: 0, refundId: null, error: error.message };
    }
    rows = (data ?? []) as ChargeRow[];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { attempted: true, refundedAmount: 0, refundId: null, error: message };
  }

  const gatewayRows = rows.filter((row) => {
    const provider = String(row.provider ?? "").toLowerCase();
    return provider === "paystack" || provider === "stripe" || provider === "flutterwave";
  });

  const refundedOnRow = (row: ChargeRow) => {
    const amount = Math.max(0, Number(row.amount ?? 0));
    const refunded = Math.max(0, Number(row.refund_amount ?? 0));
    if (String(row.status ?? "") === "refunded") return refunded > 0 ? refunded : amount;
    return refunded;
  };
  const alreadyRefunded = roundCurrency(
    Math.min(portion, gatewayRows.reduce((sum, row) => addMoney(sum, refundedOnRow(row)), 0)),
  );
  let remaining = subtractMoney(portion, alreadyRefunded);
  if (gatewayRows.length > 0 && remaining <= 0.009) {
    return { attempted: false, refundedAmount: portion, refundId: null };
  }

  const { refundGatewayCharge } = await import("@/lib/payments/refund-gateway-charge");
  const refundOne = async (chargeReference: string, amountMajor: number, provider: string) =>
    refundGatewayCharge({
      reference: chargeReference,
      amountMajor,
      currency,
      tenantId,
      reason: opts.reason,
      idempotencyKey: `${opts.idempotencyKey}:${chargeReference}`,
      fallbackProvider:
        provider === "stripe" ? "stripe" : provider === "flutterwave" ? "flutterwave" : "paystack",
    });

  if (gatewayRows.length === 0) {
    if (!reference) return { attempted: false, refundedAmount: 0, refundId: null };
    try {
      const { refundId } = await refundOne(reference, remaining, method);
      return { attempted: true, refundedAmount: remaining, refundId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[refundProductOrderOnlineTender] gateway refund failed:", message, {
        productOrderId: order.id,
        method,
      });
      return { attempted: true, refundedAmount: 0, refundId: null, error: message };
    }
  }

  let refundedNow = 0;
  let refundId: string | null = null;
  let errorMessage: string | null = null;
  for (const row of gatewayRows) {
    if (remaining <= 0.009) break;
    if (String(row.status ?? "") !== "success" || !row.id) continue;
    const chargeReference = String(row.reference ?? "").trim();
    const available = Math.max(0, subtractMoney(Number(row.amount ?? 0), Number(row.refund_amount ?? 0)));
    if (!chargeReference || available <= 0.009) continue;
    const slice = roundCurrency(Math.min(available, remaining));
    const provider = String(row.provider ?? "").toLowerCase();
    try {
      const result = await refundOne(chargeReference, slice, provider);
      refundId = result.refundId;
      refundedNow = addMoney(refundedNow, slice);
      remaining = subtractMoney(remaining, slice);
      const refundAmount = addMoney(Number(row.refund_amount ?? 0), slice);
      const fullyRefunded = refundAmount + 0.009 >= Number(row.amount ?? 0);
      await (admin.from("payment_transactions") as any)
        .update({
          refund_amount: refundAmount,
          refunded_at: new Date().toISOString(),
          status: fullyRefunded ? "refunded" : "partially_refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error("[refundProductOrderOnlineTender] gateway refund failed:", errorMessage, {
        productOrderId: order.id,
        reference: chargeReference,
      });
    }
  }

  return {
    attempted: true,
    refundedAmount: addMoney(alreadyRefunded, refundedNow),
    refundId,
    ...(remaining > 0.009 ? { error: errorMessage ?? "Card refund did not cover the amount" } : {}),
  };
}
