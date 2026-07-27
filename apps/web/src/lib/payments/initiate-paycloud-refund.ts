import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createPaycloudRefund } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider } from "@/lib/payments/paycloud-credentials";
import { buildMerchantOrderNo } from "@/lib/payments/paycloud";
import { humanizePaycloudResponse } from "@/lib/payments/paycloud-scenarios";

export type InitiatePaycloudRefundResult =
  | { ok: true; refundPayment: Record<string, unknown>; reused?: boolean }
  | { ok: false; code: string; message: string; status: number };

/**
 * Initiate a PayCloud REFUND (trans_type=3) for a successful capture.
 * Idempotent via metadata.refund_payment_id on the original payment.
 */
export async function initiatePaycloudRefund(params: {
  supabase: SupabaseClient;
  providerId: string;
  paymentId: string;
  amount: number;
  processedBy: string;
  notifyUrl: string;
  terminalId?: string | null;
}): Promise<InitiatePaycloudRefundResult> {
  const { supabase, providerId, paymentId, amount: requestedAmount, processedBy, notifyUrl } = params;

  const { data: payment } = await supabase
    .from("provider_paycloud_payments")
    .select("*")
    .eq("id", paymentId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!payment) {
    return { ok: false, code: "NOT_FOUND", message: "Payment not found", status: 404 };
  }
  if (payment.status !== "successful") {
    return {
      ok: false,
      code: "NOT_REFUNDABLE",
      message: "Only successful payments can be refunded on the card machine.",
      status: 400,
    };
  }
  if (!payment.merchant_order_no || !payment.terminal_id) {
    return {
      ok: false,
      code: "MISSING_REFS",
      message: "This payment is missing the references needed to refund on the card machine.",
      status: 400,
    };
  }

  const metadata =
    payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};

  if (typeof metadata.refund_payment_id === "string") {
    const { data: existing } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", metadata.refund_payment_id)
      .maybeSingle();
    if (existing && (existing.status === "pending" || existing.status === "processing" || existing.status === "successful")) {
      return { ok: true, refundPayment: existing as Record<string, unknown>, reused: true };
    }
  }

  const { data: priorRefundRows } = await supabase
    .from("provider_paycloud_payments")
    .select("amount, status, metadata, trans_type")
    .eq("provider_id", providerId)
    .eq("trans_type", 3)
    .in("status", ["pending", "processing", "successful"]);

  const alreadyRefunded = (priorRefundRows ?? [])
    .filter((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return meta.refund_of_payment_id === payment.id;
    })
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const maxRefundable =
    Number(payment.amount) +
    Math.max(0, Number(payment.tip_amount ?? 0)) +
    Math.max(0, Number(payment.cashback_amount ?? 0)) -
    alreadyRefunded;

  if (requestedAmount > maxRefundable + 0.02) {
    return {
      ok: false,
      code: "AMOUNT_TOO_HIGH",
      message: `Refund amount cannot exceed ${Math.max(0, maxRefundable).toFixed(2)}.`,
      status: 400,
    };
  }

  const terminalId = params.terminalId ?? payment.terminal_id;
  const ctx = await resolvePaycloudContextForProvider(supabase, providerId, terminalId);
  if (!ctx) {
    return {
      ok: false,
      code: "TERMINAL_NOT_CONFIGURED",
      message: "This card machine isn't fully set up yet.",
      status: 400,
    };
  }

  const { data: terminal } = await supabase
    .from("paycloud_terminals")
    .select("terminal_sn")
    .eq("id", terminalId)
    .maybeSingle();

  const { data: provider } = await supabase.from("providers").select("tenant_id").eq("id", providerId).single();
  const refundMerchantOrderNo = buildMerchantOrderNo("BR");

  const { data: refundPaymentRow, error: insertError } = await supabase
    .from("provider_paycloud_payments")
    .insert({
      tenant_id: provider?.tenant_id,
      provider_id: providerId,
      terminal_id: terminalId,
      merchant_order_no: refundMerchantOrderNo,
      amount: requestedAmount,
      expected_amount: requestedAmount,
      currency: payment.currency,
      entity_type: payment.entity_type,
      entity_id: payment.entity_id,
      booking_id: payment.booking_id,
      sale_id: payment.sale_id,
      group_booking_id: payment.group_booking_id,
      product_order_id: payment.product_order_id,
      additional_charge_id: payment.additional_charge_id,
      pay_scenario: payment.pay_scenario,
      trans_type: 3,
      processed_by: processedBy,
      environment: ctx.environment,
      status: "pending",
      metadata: {
        refund_of_payment_id: payment.id,
        orig_merchant_order_no: payment.merchant_order_no,
        orig_paycloud_order_id: payment.paycloud_order_id,
      },
    } as Record<string, unknown>)
    .select()
    .single();

  if (insertError || !refundPaymentRow) {
    return {
      ok: false,
      code: "INSERT_FAILED",
      message: insertError?.message ?? "Failed to create refund payment",
      status: 500,
    };
  }

  const admin = getSupabaseAdmin();
  const { data: claimed } = await admin
    .from("paycloud_terminals")
    .update({ in_flight_payment_id: refundPaymentRow.id })
    .eq("id", terminalId)
    .is("in_flight_payment_id", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    await admin
      .from("provider_paycloud_payments")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", refundPaymentRow.id);
    return {
      ok: false,
      code: "TERMINAL_IN_FLIGHT",
      message: "This card machine already has a payment in progress. Wait or cancel it first.",
      status: 409,
    };
  }

  const refundResult = await createPaycloudRefund(ctx.environment, ctx.credentials, {
    merchant_no: ctx.merchant_no,
    store_no: ctx.store_no,
    terminal_sn: terminal?.terminal_sn ?? "",
    merchant_order_no: refundMerchantOrderNo,
    orig_merchant_order_no: payment.merchant_order_no,
    order_amount: requestedAmount,
    price_currency: payment.currency,
    notify_url: notifyUrl,
    description: `Refund Beautonomi payment ${payment.merchant_order_no}`,
    orig_trans_no: payment.paycloud_order_id ?? undefined,
  });

  const status = refundResult.success ? "processing" : "failed";
  await supabase
    .from("provider_paycloud_payments")
    .update({
      status,
      trans_status: refundResult.trans_status,
      response_code: refundResult.response_code,
      error_message: refundResult.error_message,
      raw_response: refundResult.raw,
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundPaymentRow.id);

  if (!refundResult.success) {
    await supabase
      .from("paycloud_terminals")
      .update({ in_flight_payment_id: null })
      .eq("id", terminalId);
    return {
      ok: false,
      code: refundResult.response_code ?? "REFUND_FAILED",
      message: humanizePaycloudResponse(refundResult.response_code),
      status: 400,
    };
  }

  await supabase
    .from("provider_paycloud_payments")
    .update({
      metadata: { ...metadata, refund_payment_id: refundPaymentRow.id },
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  const { data: updated } = await supabase
    .from("provider_paycloud_payments")
    .select("*")
    .eq("id", refundPaymentRow.id)
    .single();

  return { ok: true, refundPayment: (updated ?? refundPaymentRow) as Record<string, unknown> };
}
