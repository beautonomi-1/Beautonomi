import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyPaycloudWebhookSignature } from "@/lib/payments/paycloud-client";
import { settlePaycloudPayment } from "@/lib/payments/settle-paycloud-payment";
import { isPaycloudVoidRow, completePaycloudVoid } from "@/lib/payments/paycloud-void";
import { isPaycloudRefundRow, completePaycloudRefund } from "@/lib/payments/paycloud-refund";
import { handlePaycloudPostSettle } from "@/lib/payments/paycloud-post-settle";
import { computeAmountMatchStatus } from "@/lib/payments/paycloud-amount-guards";
import { parsePaycloudCloudCapturedAmount, mergePaycloudCapturedMetadata } from "@/lib/payments/paycloud-cloud-amount";
import { resolvePaycloudWebhookGatewayPublicKeys } from "@/lib/payments/resolve-paycloud-app-credentials";
import { PAYCLOUD_TRANS_STATUS } from "@/lib/payments/paycloud";
import {
  acquireWebhookEventLease,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from "@/lib/payment/webhook-event-lease";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let rawBody: Record<string, string> = {};

  try {
    const body = await request.json();
    // PayCloud notify is flat JSON (same envelope family as Cloud API); support nested biz_content if present
    rawBody = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)]),
    ) as Record<string, string>;

    const nested =
      typeof body.biz_content === "string"
        ? JSON.parse(body.biz_content)
        : body.biz_content && typeof body.biz_content === "object"
          ? body.biz_content
          : null;
    // Cloud notify may arrive flat OR wrapped in a `data` object (same family as orderquery).
    const dataObj =
      body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Record<string, any>)
        : {};
    const payload = { ...dataObj, ...(nested ?? body) } as Record<string, any>;
    const merchantOrderNo =
      payload.merchant_order_no ?? body.merchant_order_no ?? dataObj.merchant_order_no;
    const transStatus = String(payload.trans_status ?? "");

    // F2-37: verify the RSA2 signature BEFORE any payment lookup. The gateway
    // public key is resolved from the envelope's app_id (config only), so an
    // unauthenticated caller cannot probe merchant_order_no values.
    const appId =
      (typeof body.app_id === "string" && body.app_id) ||
      (typeof payload.app_id === "string" && payload.app_id) ||
      null;
    const candidateKeys = await resolvePaycloudWebhookGatewayPublicKeys(supabase, { appId });
    const signatureValid = candidateKeys.some((key) => verifyPaycloudWebhookSignature(rawBody, key));

    if (!signatureValid) {
      console.warn("[paycloud] webhook signature invalid — rejected", {
        merchant_order_no: merchantOrderNo,
        has_app_id: Boolean(appId),
        candidate_keys: candidateKeys.length,
      });
      await supabase.from("paycloud_webhook_events").insert({
        merchant_order_no: merchantOrderNo,
        event_type: String(payload.trans_status ?? "notify"),
        signature_valid: false,
        payload: body,
      });
      return new NextResponse("invalid signature", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // F-06: idempotency on a deterministic event id via the shared lease RPC.
    // PayCloud notifies carry trans_no (gateway transaction id); fall back to
    // merchant_order_no. Status is part of the key so a later status change for
    // the same order is still processed.
    const transNo =
      (typeof payload.trans_no === "string" && payload.trans_no) ||
      (typeof payload.order_id === "string" && payload.order_id) ||
      null;
    const eventKeyBase = transNo ?? (merchantOrderNo ? String(merchantOrderNo) : null);
    if (!eventKeyBase) {
      return new NextResponse("missing order reference", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }
    const eventId = `${eventKeyBase}:${transStatus || "notify"}`;
    const lease = await acquireWebhookEventLease(supabase, {
      eventId,
      source: WEBHOOK_SOURCE,
      eventType: `paycloud:${transStatus || "notify"}`,
      payload: { merchant_order_no: merchantOrderNo, trans_no: transNo, trans_status: transStatus },
    });
    if (lease.outcome === "duplicate") {
      return new NextResponse("success", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    if (lease.outcome === "in_flight") {
      return new NextResponse("processing", { status: 503, headers: { "Content-Type": "text/plain" } });
    }

    try {
    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("merchant_order_no", merchantOrderNo)
      .maybeSingle();

    await supabase.from("paycloud_webhook_events").insert({
      tenant_id: payment?.tenant_id,
      provider_id: payment?.provider_id,
      payment_id: payment?.id,
      merchant_order_no: merchantOrderNo,
      event_type: String(payload.trans_status ?? "notify"),
      signature_valid: signatureValid,
      payload: body,
    });

    // Money rule: settle only when PayCloud reports completed (trans_status=2)
    // AND RSA2 signature verifies (enforced above). Do not treat response_code
    // alone as paid — reconcile/poll remain the backup.
    // @see https://developers.paycloud.africa/docs/public/CloudMode/
    const isSuccess = transStatus === PAYCLOUD_TRANS_STATUS.COMPLETED;

    if (payment && isSuccess && signatureValid) {
      const captured =
        payload.paid_amount != null || payload.order_amount != null
          ? parsePaycloudCloudCapturedAmount(
              payment.currency,
              (payload.paid_amount ?? payload.order_amount) as string | number,
            )
          : Number(payment.amount);
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
          paycloud_order_id: payload.order_id ?? payment.paycloud_order_id,
          metadata: mergePaycloudCapturedMetadata(
            payment.metadata as Record<string, unknown> | null | undefined,
            captured,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      // A completed VOID is a reversal, not a new capture. Reverse the original
      // instead of settling — settling would insert a second positive payment.
      if (isPaycloudVoidRow(payment)) {
        await completePaycloudVoid(supabase, payment);
        await supabase
          .from("paycloud_webhook_events")
          .update({ processed: true })
          .eq("merchant_order_no", merchantOrderNo);
      } else if (isPaycloudRefundRow(payment)) {
        await completePaycloudRefund(supabase, payment);
        await supabase
          .from("paycloud_terminals")
          .update({ in_flight_payment_id: null })
          .eq("id", payment.terminal_id);
        await supabase
          .from("paycloud_webhook_events")
          .update({ processed: true })
          .eq("merchant_order_no", merchantOrderNo);
      } else if (matchStatus === "exact" || matchStatus === "over") {
      const settleResult = await settlePaycloudPayment(supabase, {
        paymentId: payment.id,
        providerId: payment.provider_id,
        entityType: payment.entity_type,
        entityId: payment.entity_id,
        amount: captured,
        paycloudOrderId: payload.order_id ?? payment.merchant_order_no,
        merchantOrderNo: payment.merchant_order_no,
        processedBy: payment.processed_by,
        currency: payment.currency,
        tipAmount: Number(payment.tip_amount ?? 0),
        cashbackAmount: Number(payment.cashback_amount ?? 0),
        expectedBaseAmount: Number(payment.expected_amount ?? payment.amount ?? 0),
      });

        await handlePaycloudPostSettle(supabase, payment, settleResult, captured);

        await supabase.from("paycloud_webhook_events").update({ processed: true }).eq("merchant_order_no", merchantOrderNo);
      }
      // Always release the terminal after a completed capture (exact / over / under /
      // mismatch). Under/mismatch skips auto-settle for admin force-settle but must
      // not leave in_flight stuck — reconcile cannot recover once status=successful.
      if (payment.terminal_id) {
        await supabase
          .from("paycloud_terminals")
          .update({
            in_flight_payment_id: null,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", payment.terminal_id);
      }
    } else if (
      payment &&
      signatureValid &&
      (transStatus === PAYCLOUD_TRANS_STATUS.CANCELLED ||
        transStatus === PAYCLOUD_TRANS_STATUS.CLOSED)
    ) {
      await supabase
        .from("provider_paycloud_payments")
        .update({ status: "cancelled", trans_status: transStatus, updated_at: new Date().toISOString() })
        .eq("id", payment.id);
      if (payment.terminal_id) {
        await supabase.from("paycloud_terminals").update({ in_flight_payment_id: null }).eq("id", payment.terminal_id);
      }
    }

    await markWebhookEventProcessed(supabase, { eventId, source: WEBHOOK_SOURCE });
    return new NextResponse("success", { status: 200, headers: { "Content-Type": "text/plain" } });
    } catch (handlerError) {
      await markWebhookEventFailed(supabase, {
        eventId,
        source: WEBHOOK_SOURCE,
        errorMessage: handlerError instanceof Error ? handlerError.message : String(handlerError),
      });
      throw handlerError;
    }
  } catch (error: any) {
    console.error("POST /api/provider/paycloud/webhook:", error);
    return new NextResponse("fail", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}

const WEBHOOK_SOURCE = "paycloud";
