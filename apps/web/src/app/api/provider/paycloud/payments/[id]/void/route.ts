import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { createPaycloudVoid } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider, getPaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
import { buildMerchantOrderNo } from "@/lib/payments/paycloud";
import { humanizePaycloudResponse } from "@/lib/payments/paycloud-scenarios";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const { data: payment } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ data: null, error: { message: "Payment not found", code: "NOT_FOUND" } }, { status: 404 });
    }

    if (payment.status !== "successful") {
      return NextResponse.json(
        { data: null, error: { message: "Only successful payments can be voided on the card machine.", code: "NOT_VOIDABLE" } },
        { status: 400 },
      );
    }

    if (!payment.merchant_order_no || !payment.terminal_id) {
      return NextResponse.json(
        { data: null, error: { message: "This payment is missing the references needed to void on the card machine.", code: "MISSING_REFS" } },
        { status: 400 },
      );
    }

    const metadata =
      payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
        ? (payment.metadata as Record<string, unknown>)
        : {};
    if (metadata.void_payment_id) {
      const { data: voidRow } = await supabase
        .from("provider_paycloud_payments")
        .select("*")
        .eq("id", String(metadata.void_payment_id))
        .maybeSingle();
      if (voidRow) {
        return NextResponse.json({ data: voidRow, error: null });
      }
    }

    const ctx = await resolvePaycloudContextForProvider(supabase, providerId, payment.terminal_id);
    if (!ctx) {
      return NextResponse.json({ data: null, error: { message: "This card machine isn't fully set up yet.", code: "TERMINAL_NOT_CONFIGURED" } }, { status: 400 });
    }

    const { data: terminal } = await supabase
      .from("paycloud_terminals")
      .select("terminal_sn, in_flight_payment_id")
      .eq("id", payment.terminal_id)
      .maybeSingle();

    if (terminal?.in_flight_payment_id) {
      return NextResponse.json(
        { data: null, error: { message: "This card machine already has a payment in progress. Wait or cancel it first.", code: "TERMINAL_IN_FLIGHT" } },
        { status: 409 },
      );
    }

    const { data: provider } = await supabase.from("providers").select("tenant_id").eq("id", providerId).single();
    const voidMerchantOrderNo = buildMerchantOrderNo("BV");
    const notifyUrl = getPaycloudNotifyUrl(request);
    const voidAmount =
      Number(payment.amount) +
      Math.max(0, Number(payment.tip_amount ?? 0)) +
      Math.max(0, Number(payment.cashback_amount ?? 0));

    const { data: voidPaymentRow, error: insertError } = await supabase
      .from("provider_paycloud_payments")
      .insert({
        tenant_id: provider?.tenant_id,
        provider_id: providerId,
        terminal_id: payment.terminal_id,
        merchant_order_no: voidMerchantOrderNo,
        amount: voidAmount,
        expected_amount: voidAmount,
        currency: payment.currency,
        entity_type: payment.entity_type,
        entity_id: payment.entity_id,
        booking_id: payment.booking_id,
        sale_id: payment.sale_id,
        group_booking_id: payment.group_booking_id,
        product_order_id: payment.product_order_id,
        additional_charge_id: payment.additional_charge_id,
        pay_scenario: payment.pay_scenario,
        trans_type: 2,
        processed_by: permissionCheck.user.id,
        environment: ctx.environment,
        status: "pending",
        metadata: {
          void_of_payment_id: payment.id,
          orig_merchant_order_no: payment.merchant_order_no,
          orig_paycloud_order_id: payment.paycloud_order_id,
        },
      } as Record<string, unknown>)
      .select()
      .single();

    if (insertError) throw insertError;

    await supabase
      .from("paycloud_terminals")
      .update({ in_flight_payment_id: voidPaymentRow.id })
      .eq("id", payment.terminal_id);

    const voidResult = await createPaycloudVoid(ctx.environment, ctx.credentials, {
      merchant_no: ctx.merchant_no,
      store_no: ctx.store_no,
      terminal_sn: terminal?.terminal_sn ?? "",
      merchant_order_no: voidMerchantOrderNo,
      orig_merchant_order_no: payment.merchant_order_no,
      order_amount: voidAmount,
      price_currency: payment.currency,
      notify_url: notifyUrl,
      description: `Void Beautonomi payment ${payment.merchant_order_no}`,
      orig_trans_no: payment.paycloud_order_id ?? undefined,
    });

    const status = voidResult.success ? "processing" : "failed";
    await supabase
      .from("provider_paycloud_payments")
      .update({
        status,
        trans_status: voidResult.trans_status,
        response_code: voidResult.response_code,
        error_message: voidResult.error_message,
        raw_response: voidResult.raw,
        updated_at: new Date().toISOString(),
      })
      .eq("id", voidPaymentRow.id);

    await supabase
      .from("provider_paycloud_payments")
      .update({
        metadata: { ...metadata, void_payment_id: voidPaymentRow.id },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    if (!voidResult.success) {
      await supabase
        .from("paycloud_terminals")
        .update({ in_flight_payment_id: null })
        .eq("id", payment.terminal_id);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: humanizePaycloudResponse(voidResult.response_code),
            code: voidResult.response_code ?? "VOID_FAILED",
          },
        },
        { status: 400 },
      );
    }

    const { data: updated } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", voidPaymentRow.id)
      .single();

    return NextResponse.json({ data: updated, error: null });
  } catch (error: unknown) {
    console.error("POST /api/provider/paycloud/payments/[id]/void:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to void payment", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
