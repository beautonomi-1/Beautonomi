import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkPaycloudFeatureAccess } from "@/lib/subscriptions/feature-access";
import { requirePaycloudPlatformEnabledForProvider, isPaycloudSameTerminalEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { createPaycloudOrder } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider, getPaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
import { buildMerchantOrderNo } from "@/lib/payments/paycloud";
import { resolvePayScenario } from "@/lib/payments/paycloud-scenarios";
import { computeExpectedAmountForEntity } from "@/lib/payments/paycloud-amount-guards";
import { validatePaycloudPaymentInitiate } from "@/lib/payments/paycloud-initiate-guards";
import { humanizePaycloudResponse } from "@/lib/payments/paycloud-scenarios";
import {
  buildSameTerminalIntentPayload,
  resolvePaycloudIntentContract,
} from "@/lib/payments/paycloud-intent-contract";
import { z } from "zod";

const createPaymentSchema = z.object({
  terminal_id: z.string().uuid(),
  entity_type: z.enum(["booking", "group_booking", "sale", "product_order", "additional_charge"]),
  entity_id: z.string().min(1),
  amount: z.number().positive().optional(),
  tip_amount: z.number().min(0).optional(),
  cashback_amount: z.number().min(0).optional(),
  pay_method: z.enum(["card", "qr"]).optional().default("card"),
  currency: z.string().optional(),
  booking_id: z.string().uuid().optional().nullable(),
  sale_id: z.string().uuid().optional().nullable(),
  group_booking_id: z.string().uuid().optional().nullable(),
  channel: z.enum(["cloud", "same_terminal"]).optional().default("cloud"),
  /** Best-effort device serial from the P5/P5L for same-terminal terminal_sn validation. */
  device_serial: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.issues } }, { status: 400 });
    }

    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const paycloudAccess = await checkPaycloudFeatureAccess(providerId, supabase);
    if (!paycloudAccess.enabled) {
      return NextResponse.json({ data: null, error: { message: "Card machines require a plan upgrade.", code: "SUBSCRIPTION_REQUIRED" } }, { status: 403 });
    }

    const { data: provider } = await supabase.from("providers").select("accept_paycloud, tenant_id").eq("id", providerId).single();
    if (!provider?.accept_paycloud) {
      return NextResponse.json({ data: null, error: { message: "Turn on Accept in-person card payments in Card machines settings.", code: "PAYCLOUD_NOT_ACCEPTED" } }, { status: 403 });
    }

    const expected = await computeExpectedAmountForEntity(supabase, providerId, parsed.data.entity_type, parsed.data.entity_id);
    const chargeAmount = parsed.data.amount ?? expected?.amount;
    if (!chargeAmount || chargeAmount <= 0) {
      return NextResponse.json({ data: null, error: { message: "Nothing to charge.", code: "ZERO_AMOUNT" } }, { status: 400 });
    }
    if (expected && parsed.data.amount != null && Math.abs(parsed.data.amount - expected.amount) > 0.02) {
      return NextResponse.json({ data: null, error: { message: "Amount does not match outstanding balance.", code: "AMOUNT_MISMATCH" } }, { status: 400 });
    }

    const currency = parsed.data.currency ?? expected?.currency ?? "ZAR";
    const ctx = await resolvePaycloudContextForProvider(supabase, providerId, parsed.data.terminal_id);
    if (!ctx) {
      return NextResponse.json({ data: null, error: { message: "This card machine isn't fully set up yet.", code: "TERMINAL_NOT_CONFIGURED" } }, { status: 400 });
    }

    const guard = await validatePaycloudPaymentInitiate(supabase, {
      providerId,
      terminalId: parsed.data.terminal_id,
      entityType: parsed.data.entity_type,
      entityId: parsed.data.entity_id,
      environment: ctx.environment,
    });
    if (!guard.ok) {
      // Resume polling an in-flight payment instead of forcing a new charge
      if (
        (guard.code === "ENTITY_IN_FLIGHT" || guard.code === "TERMINAL_IN_FLIGHT") &&
        guard.existingPaymentId
      ) {
        const { data: existing } = await supabase
          .from("provider_paycloud_payments")
          .select("id, merchant_order_no, status, amount, currency")
          .eq("id", guard.existingPaymentId)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (existing) {
          return NextResponse.json({
            data: {
              payment_id: existing.id,
              merchant_order_no: existing.merchant_order_no,
              status: existing.status,
              amount: Number(existing.amount),
              currency: existing.currency,
              reused: true,
            },
            error: null,
          });
        }
      }
      return NextResponse.json(
        { data: null, error: { message: guard.message, code: guard.code } },
        { status: guard.status },
      );
    }

    const { data: terminal } = await supabase
      .from("paycloud_terminals")
      .select("terminal_sn, in_flight_payment_id")
      .eq("id", parsed.data.terminal_id)
      .eq("provider_id", providerId)
      .single();

    if (!terminal) {
      return NextResponse.json({ data: null, error: { message: "Card machine not found", code: "TERMINAL_NOT_FOUND" } }, { status: 404 });
    }

    const merchantOrderNo = buildMerchantOrderNo();
    const scenario = resolvePayScenario(parsed.data.pay_method);
    const notifyUrl = getPaycloudNotifyUrl(request);

    const channel = parsed.data.channel ?? "cloud";
    if (channel === "same_terminal") {
      const sameTerminalOn = await isPaycloudSameTerminalEnabledForProvider(supabase, providerId);
      if (!sameTerminalOn) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Pay on this device is not enabled yet. Send the payment to your card machine instead.",
              code: "SAME_TERMINAL_DISABLED",
            },
          },
          { status: 403 },
        );
      }

      const deviceSerial = parsed.data.device_serial?.trim();
      if (deviceSerial && terminal?.terminal_sn) {
        const normalizeSn = (s: string) => s.trim().toLowerCase();
        if (normalizeSn(deviceSerial) !== normalizeSn(terminal.terminal_sn)) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message:
                  "This device does not match the selected card machine serial. Choose the machine registered to this terminal.",
                code: "DEVICE_TERMINAL_MISMATCH",
              },
            },
            { status: 400 },
          );
        }
      }
    }

    const { data: paymentRow, error: insertError } = await supabase
      .from("provider_paycloud_payments")
      .insert({
        tenant_id: provider.tenant_id,
        provider_id: providerId,
        terminal_id: parsed.data.terminal_id,
        merchant_order_no: merchantOrderNo,
        amount: chargeAmount,
        tip_amount: parsed.data.tip_amount ?? 0,
        cashback_amount: parsed.data.cashback_amount ?? 0,
        expected_amount: expected?.amount ?? chargeAmount,
        currency,
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        booking_id: parsed.data.booking_id ?? (parsed.data.entity_type === "booking" ? parsed.data.entity_id : null),
        sale_id: parsed.data.sale_id ?? (parsed.data.entity_type === "sale" ? parsed.data.entity_id : null),
        group_booking_id: parsed.data.group_booking_id ?? (parsed.data.entity_type === "group_booking" ? parsed.data.entity_id : null),
        product_order_id: parsed.data.entity_type === "product_order" ? parsed.data.entity_id : null,
        additional_charge_id: parsed.data.entity_type === "additional_charge" ? parsed.data.entity_id : null,
        pay_scenario: scenario.pay_scenario,
        pay_method_id: scenario.pay_method_id ?? null,
        trans_type: parsed.data.cashback_amount ? 11 : 1,
        processed_by: permissionCheck.user.id,
        environment: ctx.environment,
        status: "pending",
        notify_url: notifyUrl,
        initiation_channel: channel,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    const admin = getSupabaseAdmin();
    const { data: claimed } = await admin
      .from("paycloud_terminals")
      .update({ in_flight_payment_id: paymentRow.id })
      .eq("id", parsed.data.terminal_id)
      .is("in_flight_payment_id", null)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      await admin
        .from("provider_paycloud_payments")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", paymentRow.id);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "This card machine already has a payment in progress. Wait or cancel it first.",
            code: "TERMINAL_IN_FLIGHT",
          },
        },
        { status: 409 },
      );
    }

    if (channel === "same_terminal") {
      const intentContract = await resolvePaycloudIntentContract(supabase, {
        environment: ctx.environment,
        tenantId: ctx.tenant_id ?? provider.tenant_id ?? null,
        paycloudAppId: ctx.paycloud_app_db_id,
      });
      const intentPayload = buildSameTerminalIntentPayload({
        merchantOrderNo,
        chargeAmount,
        currency,
        payScenario: scenario.pay_scenario,
        payMethodId: scenario.pay_method_id,
        transType: parsed.data.cashback_amount ? 11 : 1,
        tipAmount: parsed.data.tip_amount,
        cashbackAmount: parsed.data.cashback_amount,
        appId: ctx.credentials.app_id,
        intentContract,
      });

      return NextResponse.json({
        data: {
          payment_id: paymentRow.id,
          merchant_order_no: merchantOrderNo,
          status: "pending",
          amount: chargeAmount,
          currency,
          channel: "same_terminal",
          intent_payload: intentPayload,
        },
        error: null,
      });
    }

    const orderResult = await createPaycloudOrder(ctx.environment, ctx.credentials, {
      merchant_no: ctx.merchant_no,
      store_no: ctx.store_no,
      terminal_sn: terminal.terminal_sn,
      merchant_order_no: merchantOrderNo,
      order_amount: chargeAmount,
      tip_amount: parsed.data.tip_amount,
      cashback_amount: parsed.data.cashback_amount,
      price_currency: currency,
      pay_scenario: scenario.pay_scenario,
      pay_method_id: scenario.pay_method_id,
      notify_url: notifyUrl,
      description: `Beautonomi ${parsed.data.entity_type}`,
      attach: JSON.stringify({ payment_id: paymentRow.id, provider_id: providerId }),
      reject_trade_when_terminal_offline: true,
    });

    const status = orderResult.success ? "processing" : "failed";
    await supabase
      .from("provider_paycloud_payments")
      .update({
        status,
        trans_status: orderResult.trans_status,
        response_code: orderResult.response_code,
        paycloud_order_id: (orderResult.raw as any)?.order_id ?? null,
        error_message: orderResult.error_message,
        raw_response: orderResult.raw,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRow.id);

    if (!orderResult.success) {
      // Code 113 = duplicate merchant_order_no / duplicate request — reuse any recent pending for this entity
      if (orderResult.response_code === "113") {
        const { data: existing } = await supabase
          .from("provider_paycloud_payments")
          .select("id, merchant_order_no, status, amount, currency")
          .eq("provider_id", providerId)
          .eq("entity_type", parsed.data.entity_type)
          .eq("entity_id", parsed.data.entity_id)
          .in("status", ["pending", "processing"])
          .neq("id", paymentRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        await supabase
          .from("provider_paycloud_payments")
          .update({
            status: "cancelled",
            response_code: "113",
            error_message: existing
              ? "Duplicate — resumed existing payment"
              : (orderResult.error_message ?? "Duplicate request (113)"),
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentRow.id);

        if (existing) {
          await supabase
            .from("paycloud_terminals")
            .update({ in_flight_payment_id: existing.id })
            .eq("id", parsed.data.terminal_id);
          return NextResponse.json({
            data: {
              payment_id: existing.id,
              merchant_order_no: existing.merchant_order_no,
              status: existing.status,
              amount: Number(existing.amount),
              currency: existing.currency,
              reused: true,
              response_code: "113",
            },
            error: null,
          });
        }
      }

      await supabase.from("paycloud_terminals").update({ in_flight_payment_id: null }).eq("id", parsed.data.terminal_id);
      return NextResponse.json({
        data: null,
        error: {
          message: orderResult.error_message ?? humanizePaycloudResponse(orderResult.response_code) ?? "Could not reach the card machine — check it is online and in Cloud Mode.",
          code: "TERMINAL_UNAVAILABLE",
          response_code: orderResult.response_code,
        },
      }, { status: 502 });
    }

    return NextResponse.json({
      data: {
        payment_id: paymentRow.id,
        merchant_order_no: merchantOrderNo,
        status,
        amount: chargeAmount,
        currency,
      },
      error: null,
    });
  } catch (error: any) {
    console.error("POST /api/provider/paycloud/payments:", error);
    return NextResponse.json({ data: null, error: { message: "Failed to start payment", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
