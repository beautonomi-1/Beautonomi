import type { SupabaseClient } from "@supabase/supabase-js";
import { queryPaycloudOrder, closePaycloudOrder } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider } from "@/lib/payments/paycloud-credentials";
import { settlePaycloudPayment } from "@/lib/payments/settle-paycloud-payment";
import { isPaycloudVoidRow, completePaycloudVoid } from "@/lib/payments/paycloud-void";
import { handlePaycloudPostSettle } from "@/lib/payments/paycloud-post-settle";
import { computeAmountMatchStatus } from "@/lib/payments/paycloud-amount-guards";
import { PAYCLOUD_TRANS_STATUS } from "@/lib/payments/paycloud";

export type PaycloudReconcilePaymentRow = {
  id: string;
  provider_id: string;
  terminal_id: string | null;
  merchant_order_no: string;
  paycloud_order_id?: string | null;
  amount: number;
  tip_amount?: number | null;
  cashback_amount?: number | null;
  expected_amount: number;
  currency: string;
  status: string;
  entity_type: string;
  entity_id: string;
  processed_by?: string | null;
  trans_status?: string | null;
  trans_type?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type PaycloudReconcileResult = {
  payment_id: string;
  action: "settled" | "cancelled" | "closed" | "processing" | "unchanged" | "error";
  reason?: string;
};

export function reconcileWindowFromDays(days: number): Date {
  const from = new Date();
  from.setDate(from.getDate() - Math.max(1, days));
  return from;
}

/**
 * Poll PayCloud orderquery for a pending/processing payment and settle, cancel, or close stale orders.
 */
export async function reconcilePaycloudPayment(
  supabase: SupabaseClient,
  payment: PaycloudReconcilePaymentRow,
): Promise<PaycloudReconcileResult> {
  if (payment.status !== "pending" && payment.status !== "processing") {
    return { payment_id: payment.id, action: "unchanged", reason: "not_pending" };
  }
  if (!payment.terminal_id) {
    return { payment_id: payment.id, action: "unchanged", reason: "no_terminal" };
  }

  const ctx = await resolvePaycloudContextForProvider(
    supabase,
    payment.provider_id,
    payment.terminal_id,
  );
  if (!ctx) {
    return { payment_id: payment.id, action: "error", reason: "terminal_not_configured" };
  }

  const query = await queryPaycloudOrder(
    ctx.environment,
    ctx.credentials,
    ctx.merchant_no,
    payment.merchant_order_no,
  );
  const transStatus = query.trans_status ?? String((query.raw as Record<string, unknown>)?.trans_status ?? "");
  const responseCode = query.response_code ?? String((query.raw as Record<string, unknown>)?.response_code ?? "");

  if (transStatus === PAYCLOUD_TRANS_STATUS.CANCELLED || transStatus === PAYCLOUD_TRANS_STATUS.CLOSED) {
    await supabase
      .from("provider_paycloud_payments")
      .update({
        status: "cancelled",
        trans_status: transStatus,
        response_code: responseCode || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    await supabase
      .from("paycloud_terminals")
      .update({ in_flight_payment_id: null })
      .eq("id", payment.terminal_id);
    return { payment_id: payment.id, action: "cancelled" };
  }

  if (transStatus === PAYCLOUD_TRANS_STATUS.COMPLETED) {
    const rawResult = query.raw as Record<string, unknown>;
    const captured = Number(
      rawResult?.paid_amount ?? rawResult?.order_amount ?? payment.amount,
    );
    const matchStatus = computeAmountMatchStatus(Number(payment.expected_amount), captured, {
      tipAmount: Number(payment.tip_amount ?? 0),
      cashbackAmount: Number(payment.cashback_amount ?? 0),
    });
    await supabase
      .from("provider_paycloud_payments")
      .update({
        status: "successful",
        trans_status: transStatus,
        amount_match_status: matchStatus,
        response_code: responseCode || null,
        paycloud_order_id:
          ((query.raw as Record<string, unknown>)?.order_id as string | undefined) ??
          payment.paycloud_order_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    // A completed VOID is a reversal, not a new capture — reverse the original rather
    // than settling (which would insert a second positive payment / double-count).
    if (isPaycloudVoidRow(payment)) {
      await completePaycloudVoid(supabase, payment);
      await supabase
        .from("paycloud_terminals")
        .update({ in_flight_payment_id: null })
        .eq("id", payment.terminal_id);
      return { payment_id: payment.id, action: "settled", reason: "void_reversed" };
    }

    let didSettle = false;
    if (matchStatus === "exact" || matchStatus === "over") {
      const settleResult = await settlePaycloudPayment(supabase, {
        paymentId: payment.id,
        providerId: payment.provider_id,
        entityType: payment.entity_type as Parameters<typeof settlePaycloudPayment>[1]["entityType"],
        entityId: payment.entity_id,
        amount: captured,
        paycloudOrderId:
          String((query.raw as Record<string, unknown>)?.order_id ?? payment.merchant_order_no),
        merchantOrderNo: payment.merchant_order_no,
        processedBy: payment.processed_by,
        currency: payment.currency,
        tipAmount: Number(payment.tip_amount ?? 0),
      });
      await handlePaycloudPostSettle(supabase, payment, settleResult, captured);
      didSettle = settleResult.settled;
    }

    await supabase
      .from("paycloud_terminals")
      .update({ in_flight_payment_id: null })
      .eq("id", payment.terminal_id);

    if (didSettle) {
      return { payment_id: payment.id, action: "settled" };
    }
    if (matchStatus === "under" || matchStatus === "mismatch") {
      return { payment_id: payment.id, action: "unchanged", reason: `amount_${matchStatus}` };
    }
    return { payment_id: payment.id, action: "unchanged", reason: "settle_skipped" };
  }

  if (transStatus === PAYCLOUD_TRANS_STATUS.PROCESSING || transStatus === PAYCLOUD_TRANS_STATUS.CREATED) {
    const createdAt = payment.created_at ? Date.parse(payment.created_at) : NaN;
    const staleMs = 6 * 60 * 1000;
    const isStaleCreated =
      transStatus === PAYCLOUD_TRANS_STATUS.CREATED &&
      Number.isFinite(createdAt) &&
      Date.now() - createdAt > staleMs;

    if (isStaleCreated) {
      const { data: terminal } = await supabase
        .from("paycloud_terminals")
        .select("terminal_sn")
        .eq("id", payment.terminal_id)
        .maybeSingle();

      const closeResult = await closePaycloudOrder(ctx.environment, ctx.credentials, {
        merchant_no: ctx.merchant_no,
        store_no: ctx.store_no,
        terminal_sn: terminal?.terminal_sn ?? "",
        merchant_order_no: payment.merchant_order_no,
        description: "Stale order closed by Beautonomi reconcile",
      });

      const nextStatus = closeResult.success ? "closed" : payment.status;
      await supabase
        .from("provider_paycloud_payments")
        .update({
          status: nextStatus,
          trans_status: closeResult.trans_status ?? transStatus,
          response_code: closeResult.response_code ?? null,
          error_message: closeResult.error_message ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (closeResult.success) {
        await supabase
          .from("paycloud_terminals")
          .update({ in_flight_payment_id: null })
          .eq("id", payment.terminal_id);
      }
      return { payment_id: payment.id, action: "closed", reason: "stale_created" };
    }

    await supabase
      .from("provider_paycloud_payments")
      .update({
        status: "processing",
        trans_status: transStatus,
        response_code: responseCode || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    return { payment_id: payment.id, action: "processing" };
  }

  return { payment_id: payment.id, action: "unchanged", reason: `trans_status_${transStatus}` };
}

export async function reconcilePaycloudPaymentsBatch(params: {
  supabase: SupabaseClient;
  payments: PaycloudReconcilePaymentRow[];
}): Promise<{
  checked: number;
  settled: number;
  cancelled: number;
  closed: number;
  processing: number;
  unchanged: number;
  errors: number;
  results: PaycloudReconcileResult[];
}> {
  const results: PaycloudReconcileResult[] = [];
  let settled = 0;
  let cancelled = 0;
  let closed = 0;
  let processing = 0;
  let unchanged = 0;
  let errors = 0;

  for (const payment of params.payments) {
    try {
      const result = await reconcilePaycloudPayment(params.supabase, payment);
      results.push(result);
      switch (result.action) {
        case "settled":
          settled += 1;
          break;
        case "cancelled":
          cancelled += 1;
          break;
        case "closed":
          closed += 1;
          break;
        case "processing":
          processing += 1;
          break;
        case "error":
          errors += 1;
          break;
        default:
          unchanged += 1;
      }
    } catch (err) {
      console.error("PayCloud reconcile payment failed:", payment.id, err);
      results.push({ payment_id: payment.id, action: "error", reason: "exception" });
      errors += 1;
    }
  }

  return {
    checked: params.payments.length,
    settled,
    cancelled,
    closed,
    processing,
    unchanged,
    errors,
    results,
  };
}
