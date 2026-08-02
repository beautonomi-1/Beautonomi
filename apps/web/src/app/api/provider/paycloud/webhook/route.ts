import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyPaycloudWebhookSignature } from "@/lib/payments/paycloud-client";
import { settlePaycloudPayment } from "@/lib/payments/settle-paycloud-payment";
import { isPaycloudVoidRow, completePaycloudVoid } from "@/lib/payments/paycloud-void";
import { isPaycloudRefundRow, completePaycloudRefund } from "@/lib/payments/paycloud-refund";
import { handlePaycloudPostSettle } from "@/lib/payments/paycloud-post-settle";
import { computeAmountMatchStatus } from "@/lib/payments/paycloud-amount-guards";
import { parsePaycloudCloudCapturedAmount, mergePaycloudCapturedMetadata } from "@/lib/payments/paycloud-cloud-amount";
import { resolvePaycloudGatewayPublicKey } from "@/lib/payments/resolve-paycloud-app-credentials";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import { PAYCLOUD_TRANS_STATUS } from "@/lib/payments/paycloud";

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

    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("merchant_order_no", merchantOrderNo)
      .maybeSingle();

    let signatureValid = false;
    if (payment?.terminal_id) {
      const { data: terminal } = await supabase
        .from("paycloud_terminals")
        .select("paycloud_merchant_id, tenant_id")
        .eq("id", payment.terminal_id)
        .maybeSingle();
      if (terminal?.paycloud_merchant_id) {
        const { data: merchant } = await supabase
          .from("paycloud_merchants")
          .select("paycloud_app_id, environment, tenant_id")
          .eq("id", terminal.paycloud_merchant_id)
          .maybeSingle();
        if (merchant) {
          const gatewayKey = await resolvePaycloudGatewayPublicKey(supabase, {
            environment: (merchant.environment as PaycloudEnvironment) ?? "live",
            tenantId:
              (merchant as { tenant_id?: string | null }).tenant_id ??
              (terminal as { tenant_id?: string | null }).tenant_id ??
              (payment as { tenant_id?: string | null }).tenant_id ??
              null,
            paycloudAppId: merchant.paycloud_app_id,
          });
          if (gatewayKey) {
            signatureValid = verifyPaycloudWebhookSignature(rawBody, gatewayKey);
          }
        }
      }
    }

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
    // AND RSA2 signature verifies. Do not treat response_code alone as paid —
    // reconcile/poll remain the backup if notify signature cannot be verified.
    // @see https://developers.paycloud.africa/docs/public/CloudMode/
    const transStatus = String(payload.trans_status ?? "");
    const isSuccess = transStatus === PAYCLOUD_TRANS_STATUS.COMPLETED;

    if (payment && isSuccess && !signatureValid) {
      console.warn("[paycloud] webhook signature invalid — not settling", {
        merchant_order_no: merchantOrderNo,
        payment_id: payment.id,
      });
    }

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

    return new NextResponse("success", { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error: any) {
    console.error("POST /api/provider/paycloud/webhook:", error);
    return new NextResponse("success", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
}
