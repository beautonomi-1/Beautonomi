import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkPaycloudFeatureAccess } from "@/lib/subscriptions/feature-access";
import {
  requirePaycloudPlatformEnabledForProvider,
  isPaycloudSameTerminalEnabledForProvider,
  isPaycloudQrEnabledForProvider,
  isPaycloudCashbackEnabledForProvider,
} from "@/lib/payments/paycloud-feature-gate";
import { createPaycloudOrder } from "@/lib/payments/paycloud-client";
import { resolvePaycloudContextForProvider, getPaycloudNotifyUrl, validatePaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
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
  /** Best-effort device serial from the terminal for same-terminal validation. */
  device_serial: z.string().min(1).optional(),
  /** Device diagnostics from native module (any Wiseasy model). */
  device_model: z.string().min(1).optional(),
  device_manufacturer: z.string().min(1).optional(),
  serial_source: z.enum(["build_serial", "wiseasy_property", "android_id"]).optional(),
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

    const { data: paycloudSettings } = await supabase
      .from("provider_paycloud_settings")
      .select("qr_payments_enabled, cashback_enabled")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (parsed.data.pay_method === "qr") {
      const qrFlagOn = await isPaycloudQrEnabledForProvider(supabase, providerId);
      if (!qrFlagOn || paycloudSettings?.qr_payments_enabled !== true) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "QR payments are not enabled for this account.",
              code: "QR_NOT_ENABLED",
            },
          },
          { status: 403 },
        );
      }
    }

    const cashbackAmount = parsed.data.cashback_amount ?? 0;
    if (cashbackAmount > 0) {
      const cashbackFlagOn = await isPaycloudCashbackEnabledForProvider(supabase, providerId);
      if (!cashbackFlagOn || paycloudSettings?.cashback_enabled !== true) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Cashback is not enabled for this account.",
              code: "CASHBACK_NOT_ENABLED",
            },
          },
          { status: 403 },
        );
      }
    }

    const expected = await computeExpectedAmountForEntity(supabase, providerId, parsed.data.entity_type, parsed.data.entity_id);
    const chargeAmount = parsed.data.amount ?? expected?.amount;
    if (!chargeAmount || chargeAmount <= 0) {
      return NextResponse.json({ data: null, error: { message: "Nothing to charge.", code: "ZERO_AMOUNT" } }, { status: 400 });
    }
    if (expected && parsed.data.amount != null) {
      const acceptableAmounts = [expected.amount];
      if (expected.depositAmount != null && expected.depositAmount > 0.01) {
        acceptableAmounts.push(expected.depositAmount);
      }
      const matchesExpected = acceptableAmounts.some(
        (candidate) => Math.abs(parsed.data.amount! - candidate) <= 0.02,
      );
      if (!matchesExpected) {
        return NextResponse.json(
          {
            data: null,
            error: { message: "Amount does not match outstanding balance.", code: "AMOUNT_MISMATCH" },
          },
          { status: 400 },
        );
      }
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
      .select("terminal_sn, in_flight_payment_id, model, metadata")
      .eq("id", parsed.data.terminal_id)
      .eq("provider_id", providerId)
      .single();

    if (!terminal) {
      return NextResponse.json({ data: null, error: { message: "Card machine not found", code: "TERMINAL_NOT_FOUND" } }, { status: 404 });
    }

    const merchantOrderNo = buildMerchantOrderNo();
    const scenario = resolvePayScenario(parsed.data.pay_method);
    const notifyUrl = getPaycloudNotifyUrl(request);
    const notifyCheck = validatePaycloudNotifyUrl(notifyUrl);
    if (notifyCheck.ok === false) {
      return NextResponse.json(
        { data: null, error: { message: notifyCheck.message, code: notifyCheck.code } },
        { status: 400 },
      );
    }

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
      if (!deviceSerial) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message:
                "Could not identify this device. Link it to your card machine in Card machines, or send the payment to the terminal instead.",
              code: "DEVICE_SERIAL_REQUIRED",
            },
          },
          { status: 400 },
        );
      }

      const terminalMeta = (terminal?.metadata ?? {}) as Record<string, unknown>;
      const pairedDeviceId =
        typeof terminalMeta.paired_device_id === "string" ? terminalMeta.paired_device_id.trim() : null;

      const normalizeSn = (s: string) => s.trim().toLowerCase();
      const deviceNorm = normalizeSn(deviceSerial);
      const terminalSn = terminal?.terminal_sn ? normalizeSn(terminal.terminal_sn) : null;
      const pairedNorm = pairedDeviceId ? normalizeSn(pairedDeviceId) : null;
      const matchesTerminal =
        (terminalSn != null && deviceNorm === terminalSn) ||
        (pairedNorm != null && deviceNorm === pairedNorm);

      if (!matchesTerminal) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message:
                "This device does not match the selected card machine. Link this device in Card machines or choose the correct machine.",
              code: "DEVICE_TERMINAL_MISMATCH",
            },
          },
          { status: 400 },
        );
      }

      // Persist device diagnostics onto the terminal record (best-effort).
      if (parsed.data.device_model || parsed.data.device_manufacturer || parsed.data.serial_source) {
        const admin = getSupabaseAdmin();
        const nextMeta = { ...terminalMeta };
        if (parsed.data.serial_source) nextMeta.last_serial_source = parsed.data.serial_source;
        if (deviceSerial) nextMeta.last_device_serial = deviceSerial;
        if (parsed.data.device_manufacturer) {
          nextMeta.last_device_manufacturer = parsed.data.device_manufacturer.trim();
        }
        await admin
          .from("paycloud_terminals")
          .update({
            model: parsed.data.device_model?.trim() || terminal?.model || null,
            metadata: nextMeta,
            updated_at: new Date().toISOString(),
          })
          .eq("id", parsed.data.terminal_id);
      }
    }

    /**
     * Device identity is recorded per payment, not just on the terminal, because
     * the terminal row only ever holds the most recent device. Support needs to
     * know which physical device took *this* charge.
     */
    const deviceDiagnostics: Record<string, unknown> = {};
    if (parsed.data.device_serial) deviceDiagnostics.serial = parsed.data.device_serial.trim();
    if (parsed.data.device_model) deviceDiagnostics.model = parsed.data.device_model.trim();
    if (parsed.data.device_manufacturer) {
      deviceDiagnostics.manufacturer = parsed.data.device_manufacturer.trim();
    }
    if (parsed.data.serial_source) deviceDiagnostics.serial_source = parsed.data.serial_source;

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
        expected_amount: chargeAmount,
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
        ...(Object.keys(deviceDiagnostics).length > 0
          ? { metadata: { device: deviceDiagnostics } }
          : {}),
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
        payScenario: scenario.pay_scenario,
        payMethodId: scenario.pay_method_id,
        tipAmount: parsed.data.tip_amount,
        cashbackAmount: parsed.data.cashback_amount,
        appId: ctx.credentials.app_id,
        notifyUrl,
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
