import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { YOCO_WEBHOOK_EVENTS } from "@/lib/payments/yoco";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyPosProductStockDecrements } from "@/lib/provider-sales/pos-product-stock";
import {
  resolveYocoSettleEntity,
  reverseYocoSettlement,
  settleYocoPayment,
} from "@/lib/payments/settle-yoco-payment";

function yocoAmountCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const amount = (value as { amount?: unknown }).amount;
    if (typeof amount === "number" && Number.isFinite(amount)) return amount;
  }
  return 0;
}

function yocoCurrency(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.currency === "string" && data.currency.trim()) return data.currency.trim();
  const amount = data.amount;
  if (amount && typeof amount === "object") {
    const currency = (amount as { currency?: unknown }).currency;
    if (typeof currency === "string" && currency.trim()) return currency.trim();
  }
  return fallback;
}

function normalizeYocoStatus(status: unknown): "successful" | "failed" | "pending" {
  const value = String(status ?? "").toLowerCase();
  if (["successful", "success", "succeeded", "completed", "paid"].includes(value)) return "successful";
  if (["failed", "declined", "cancelled", "canceled", "voided"].includes(value)) return "failed";
  return "pending";
}

/**
 * §Yoco-OAuth 2026-05: Yoco API webhook events (payment.succeeded, etc.)
 * deliver the payment object directly without a `status` field — the status
 * is encoded in the event type. Normalize to the same shape the legacy
 * Checkout-API handler expects so we don't have to fork the code.
 */
function normalizePaymentEvent(
  body: Record<string, unknown>,
  type: string,
): Record<string, unknown> {
  const lowered = String(type).toLowerCase();
  if (lowered === "payment.succeeded") {
    return { ...body, status: body.status ?? "successful" };
  }
  if (lowered === "payment.created") {
    return { ...body, status: body.status ?? "pending" };
  }
  if (lowered === "payment.failed") {
    return { ...body, status: body.status ?? "failed" };
  }
  return body;
}

function extractPaymentEventBody(event: Record<string, unknown>): Record<string, unknown> {
  return (event.payload ?? event.data ?? {}) as Record<string, unknown>;
}

function extractProviderIdFromEvent(event: Record<string, unknown>): string | null {
  const eventBody = extractPaymentEventBody(event);
  const metadata = (eventBody.metadata ?? {}) as Record<string, unknown>;
  return typeof metadata.provider_id === "string" && metadata.provider_id
    ? metadata.provider_id
    : null;
}

function signatureCandidates(signature: string): string[] {
  const raw = signature.trim();
  if (!raw) return [];
  const candidates = new Set<string>([raw]);
  if (raw.startsWith("sha256=")) candidates.add(raw.slice("sha256=".length));
  for (const part of raw.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (value && ["v1", "signature", "sig", "s"].includes(key)) {
      candidates.add(value);
    }
  }
  return [...candidates].filter(Boolean);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyYocoSignature(body: string, signature: string, secret: string): boolean {
  const hexDigest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const base64Digest = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return signatureCandidates(signature).some((candidate) =>
    timingSafeStringEqual(candidate, hexDigest) ||
    timingSafeStringEqual(candidate.toLowerCase(), hexDigest) ||
    timingSafeStringEqual(candidate, base64Digest)
  );
}
/**
 * POST /api/provider/yoco/webhook
 *
 * Yoco webhook handler for payment and refund notifications.
 * According to Yoco API: https://developer.yoco.com/api-reference/checkout-api/webhook-events
 *
 * Requires provider_yoco_webhooks and provider_yoco_webhook_events (migration 302).
 *
 * Webhook events:
 * - payment.notification
 * - refund.notification.success.full
 * - refund.notification.success.partial
 * - refund.notification.failure.full
 * - refund.notification.failure.partial
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature =
      request.headers.get("x-yoco-signature") ??
      request.headers.get("webhook-signature");
    const webhookId = request.headers.get("x-yoco-webhook-id");

    if (!signature) {
      console.error("Missing Yoco webhook signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Yoco webhooks are server-to-server callbacks, so there is no provider session.
    // Use service role after signature verification setup lookup so accounting writes are not blocked by RLS.
    const supabase = getSupabaseAdmin();

    type WebhookConfigRow = { webhook_secret?: string; provider_id?: string };

    let webhookSecret: string | undefined;
    let webhookProviderId: string | null = null;
    let event: Record<string, unknown> | null = null;

    if (webhookId) {
      const { data: webhookConfig } = await supabase
        .from("provider_yoco_webhooks")
        .select("webhook_secret, provider_id")
        .eq("webhook_id", webhookId)
        .maybeSingle();
      if (webhookConfig) {
        const configRow = webhookConfig as WebhookConfigRow;
        if (!configRow.webhook_secret) {
          console.error("Yoco webhook secret is empty in database — rejecting");
          return NextResponse.json(
            { error: "Webhook secret not configured" },
            { status: 503 },
          );
        }
        webhookSecret = configRow.webhook_secret;
        webhookProviderId = configRow.provider_id ?? null;
      }
    } else {
      // Current Checkout API webhooks document a `webhook-signature` header but
      // no webhook id. Parse only enough metadata to choose the provider secret;
      // business logic still runs only after HMAC verification.
      try {
        event = JSON.parse(body) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
      webhookProviderId = extractProviderIdFromEvent(event);
      if (webhookProviderId) {
        const { data: integrationConfig } = await supabase
          .from("provider_yoco_integrations")
          .select("webhook_secret")
          .eq("provider_id", webhookProviderId)
          .maybeSingle();
        const integrationRow = integrationConfig as { webhook_secret?: string | null } | null;
        if (integrationRow?.webhook_secret) {
          webhookSecret = integrationRow.webhook_secret;
        }
      }
    }

    if (!webhookSecret) {
      webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("No webhook secret configured for Yoco");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 503 },
        );
      }
    }

    if (!verifyYocoSignature(body, signature, webhookSecret)) {
      console.error("Invalid Yoco webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Signature verified — safe to parse body.
    event = event ?? (JSON.parse(body) as Record<string, unknown>);
    webhookProviderId = webhookProviderId ?? extractProviderIdFromEvent(event);

    const { data: insertedEvent } = await supabase
      .from("provider_yoco_webhook_events")
      .insert({
        webhook_id: webhookId ?? String(event.id ?? "checkout-api"),
        ...(webhookProviderId ? { provider_id: webhookProviderId } : {}),
        event_type: event.type,
        payload: event,
        signature,
        status: "received",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const eventRowId = (insertedEvent as { id?: string } | null)?.id;

    // Handle different event types
    try {
      const { type } = event;
      // §Yoco-OAuth 2026-05: Yoco's API-style webhooks
      // (https://yoco.docs.buildwithfern.com/api-reference/yoco-api/webhook-events)
      // nest the payment under `payload`, while the Checkout API uses `data`.
      // Accept both shapes so the same handler works for any subscription.
      const eventBody = extractPaymentEventBody(event);

      switch (String(type)) {
        case YOCO_WEBHOOK_EVENTS.PAYMENT_NOTIFICATION:
        case YOCO_WEBHOOK_EVENTS.PAYMENT_CREATED:
        case YOCO_WEBHOOK_EVENTS.PAYMENT_SUCCEEDED:
        case YOCO_WEBHOOK_EVENTS.PAYMENT_FAILED:
          await handlePaymentNotification(
            normalizePaymentEvent(eventBody, String(type)),
            supabase,
          );
          break;

        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_SUCCESS_FULL:
        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_SUCCESS_PARTIAL:
        case YOCO_WEBHOOK_EVENTS.PAYMENT_REFUNDED:
          await handleRefundSuccess(eventBody, supabase);
          break;

        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_FAILURE_FULL:
        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_FAILURE_PARTIAL:
          await handleRefundFailure(eventBody, supabase);
          break;

        default:
          console.log(`Unhandled Yoco webhook event type: ${type}`);
      }

      if (eventRowId) {
        await supabase
          .from("provider_yoco_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventRowId);
      }
    } catch (error) {
      console.error("Error processing Yoco webhook:", error);

      if (eventRowId) {
        await supabase
          .from("provider_yoco_webhook_events")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventRowId);
      }

      // Return 500 so Yoco retries delivery for financial events
      return NextResponse.json(
        { received: false, error: error instanceof Error ? error.message : "Processing error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentNotification(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const amount = yocoAmountCents(data.amount);
  const currency = yocoCurrency(data, LAST_RESORT_CURRENCY);
  const status = normalizeYocoStatus(data.status);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  if (!id || !metadata?.provider_id) {
    console.error("Missing payment ID or provider ID in webhook data");
    return;
  }

  const { data: yocoPaymentRow } = await supabase
    .from("provider_yoco_payments")
    .select(
      "id, sale_id, status, device_id, amount, provider_id, appointment_id, tip_amount, entity_type, entity_id, group_booking_id, metadata",
    )
    .eq("yoco_payment_id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("provider_yoco_payments")
    .update({
      status: status === "successful" ? "successful" : status === "failed" ? "failed" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("yoco_payment_id", id);

  if (error) {
    console.error("Error updating payment status:", error);
  }

  const existingPayment = yocoPaymentRow as {
    id?: string | null;
    sale_id?: string | null;
    status?: string | null;
    device_id?: string | null;
    amount?: number | null;
    provider_id?: string | null;
    appointment_id?: string | null;
    tip_amount?: number | null;
    entity_type?: string | null;
    entity_id?: string | null;
    group_booking_id?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  if (
    status === "successful" &&
    existingPayment?.status !== "successful" &&
    existingPayment?.device_id &&
    typeof existingPayment.amount === "number"
  ) {
    const providerId = existingPayment.provider_id ?? String(metadata.provider_id);
    const { data: device } = await supabase
      .from("provider_yoco_devices")
      .select("total_transactions, total_amount")
      .eq("id", existingPayment.device_id)
      .eq("provider_id", providerId)
      .maybeSingle();
    const deviceRow = device as { total_transactions?: number | null; total_amount?: number | null } | null;
    await supabase
      .from("provider_yoco_devices")
      .update({
        last_used: new Date().toISOString(),
        total_transactions: (deviceRow?.total_transactions ?? 0) + 1,
        total_amount: (deviceRow?.total_amount ?? 0) + existingPayment.amount,
      })
      .eq("id", existingPayment.device_id)
      .eq("provider_id", providerId);
  }

  const saleId = ((metadata?.sale_id as string | undefined) ?? existingPayment?.sale_id ?? null);
  if (status === "successful" && saleId) {
    const { data: saleBefore } = await supabase
      .from("sales")
      .select("id, payment_status")
      .eq("id", saleId)
      .maybeSingle();
    const shouldDecrementStock = (saleBefore as { payment_status?: string } | null)?.payment_status !== "completed";

    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment_status: "completed",
        payment_provider: "yoco",
        payment_provider_id: id,
        payment_method: "yoco",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .neq("payment_status", "completed");
    if (saleError) {
      console.error("Yoco webhook: failed to mark POS sale completed:", saleError);
      throw new Error(`Failed to complete POS sale for Yoco payment ${id}: ${saleError.message}`);
    }
    if (shouldDecrementStock) {
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("item_type, item_id, product_variant_id, quantity")
        .eq("sale_id", saleId);
      const stockItems = (saleItems || []).map((row: Record<string, unknown>) => ({
        type: row.item_type as string,
        item_id: (row.item_id as string | null) ?? null,
        product_variant_id: (row.product_variant_id as string | null) ?? null,
        quantity: Number(row.quantity ?? 1),
      }));
      try {
        await applyPosProductStockDecrements(supabase, stockItems);
      } catch (stockError) {
        // Payment is already captured; leave the sale complete and surface stock drift for ops.
        console.error("Yoco webhook: POS sale completed but stock decrement failed:", stockError);
      }
    }
  } else if (status === "failed" && saleId) {
    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment_status: "failed",
        payment_provider: "yoco",
        payment_provider_id: id,
        payment_method: "yoco",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .eq("payment_status", "pending");
    if (saleError) {
      console.error("Yoco webhook: failed to mark POS sale failed:", saleError);
    }
  }

  // Settle booking / group / product_order / additional_charge via shared card-machine helper
  // (tip + add-ons + clamps). Sale path above keeps POS stock decrement ownership.
  if (status === "successful") {
    const settleEntity = resolveYocoSettleEntity({
      entity_type: existingPayment?.entity_type,
      entity_id: existingPayment?.entity_id,
      appointment_id: existingPayment?.appointment_id ?? (metadata?.appointment_id as string | undefined),
      sale_id: existingPayment?.sale_id ?? (metadata?.sale_id as string | undefined),
      group_booking_id: existingPayment?.group_booking_id,
      metadata: {
        ...(existingPayment?.metadata ?? {}),
        ...metadata,
      },
    });

    if (settleEntity && settleEntity.entityType !== "sale") {
      const amountInCurrency = amount / 100;
      // tip_amount column defaults to 0 — treat 0 as unset so metadata tip still applies.
      const tipFromColumn = Number(existingPayment?.tip_amount ?? 0);
      const tipFromMeta = Number(metadata.tip_amount ?? 0);
      const tipAmount = Math.max(0, tipFromColumn > 0 ? tipFromColumn : tipFromMeta);
      const settleResult = await settleYocoPayment(supabase, {
        paymentId: String(existingPayment?.id ?? id),
        providerId: String(existingPayment?.provider_id ?? metadata.provider_id),
        entityType: settleEntity.entityType,
        entityId: settleEntity.entityId,
        amount: amountInCurrency,
        yocoPaymentId: id,
        processedBy:
          typeof metadata.processed_by === "string" ? metadata.processed_by : null,
        currency,
        tipAmount,
      });
      if (!settleResult.settled && settleResult.reason) {
        console.warn(`Yoco settle skipped/failed for ${id}: ${settleResult.reason}`);
      }
    }
  }

  // Send notification
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    if (metadata.processed_by) {
      const failedMessage =
        status === "failed"
          ? "Card declined – ask customer to try another card."
          : `Payment failed for amount ${(amount / 100).toFixed(2)} ${currency}`;
      await sendToUser(
        String(metadata.processed_by ?? ""),
        {
          title: status === "successful" ? "Payment Successful" : "Payment Failed",
          message:
            status === "successful"
              ? `Payment completed for amount ${(amount / 100).toFixed(2)} ${currency}`
              : failedMessage,
          data: {
            type: "yoco_payment",
            payment_id: id,
            status,
          },
        },
        ["push"],
        { appType: "provider" }
      );
    }
  } catch (notifError) {
    console.error("Error sending notification:", notifError);
  }
}

async function handleRefundSuccess(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const amountCents = yocoAmountCents(data.amount);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const originalAmount = yocoAmountCents(data.original_amount);
  const yocoPaymentId = metadata?.payment_id as string | undefined;

  // Resolve provider_id and settle entity for full reverse parity (tip/charge/group suffixes).
  let providerId: string | null = null;
  let bookingId: string | null = null;
  let yocoPaymentRow: {
    provider_id?: string | null;
    appointment_id?: string | null;
    sale_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    group_booking_id?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null = null;
  if (yocoPaymentId) {
    const { data: payment } = await supabase
      .from("provider_yoco_payments")
      .select(
        "provider_id, appointment_id, sale_id, entity_type, entity_id, group_booking_id, metadata",
      )
      .eq("yoco_payment_id", yocoPaymentId)
      .single();
    yocoPaymentRow = (payment as typeof yocoPaymentRow) ?? null;
    providerId = yocoPaymentRow?.provider_id ?? null;
    bookingId = yocoPaymentRow?.appointment_id ?? null;
  }

  let lastResortCurrency: string = LAST_RESORT_CURRENCY;
  if (providerId) {
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tid = (prow as { tenant_id?: string | null } | null)?.tenant_id;
    if (tid) {
      lastResortCurrency = (await getTenantRegionConfig(tid))?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    }
  }

  const currency = yocoCurrency(data, lastResortCurrency);

  // Idempotency: skip if refund already recorded
  if (id) {
    const { data: existingYocoRefund } = await supabase
      .from("provider_yoco_refunds")
      .select("id")
      .eq("yoco_refund_id", id)
      .maybeSingle();
    if (existingYocoRefund) {
      console.log(`Yoco refund ${id} already recorded, skipping (idempotent)`);
      return;
    }
  }

  await supabase
    .from("provider_yoco_refunds")
    .insert({
      provider_id: providerId,
      yoco_refund_id: id,
      payment_id: yocoPaymentId,
      amount: amountCents,
      currency: currency || lastResortCurrency,
      status: "successful",
      created_at: new Date().toISOString(),
    });

  if (yocoPaymentId) {
    await supabase
      .from("provider_yoco_payments")
      .update({
        refund_status: amountCents === originalAmount ? "fully_refunded" : "partially_refunded",
        refund_amount: amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("yoco_payment_id", yocoPaymentId);
  }

  if (!(amountCents > 0) || !yocoPaymentId || !providerId || !id) {
    return;
  }

  const isFullRefund =
    originalAmount > 0 ? amountCents === originalAmount : amountCents > 0;
  const settleEntity = resolveYocoSettleEntity({
    entity_type: yocoPaymentRow?.entity_type,
    entity_id: yocoPaymentRow?.entity_id,
    appointment_id: yocoPaymentRow?.appointment_id ?? bookingId,
    sale_id: yocoPaymentRow?.sale_id,
    group_booking_id: yocoPaymentRow?.group_booking_id,
    metadata: {
      ...(yocoPaymentRow?.metadata ?? {}),
      ...metadata,
    },
  });

  // Full refunds reverse every settle suffix (base/tip/charge/group) like PayCloud void.
  if (isFullRefund && settleEntity) {
    const reverseResult = await reverseYocoSettlement(supabase, {
      entityType: settleEntity.entityType,
      entityId: settleEntity.entityId,
      providerId,
      origProviderPaymentId: yocoPaymentId,
      voidReference: id,
      processedBy:
        typeof metadata.processed_by === "string" ? metadata.processed_by : null,
    });
    if (!reverseResult.reversed && reverseResult.reason) {
      console.warn(`Yoco full reverse skipped/failed for ${yocoPaymentId}: ${reverseResult.reason}`);
    }
    return;
  }

  // Partial refunds: keep a single booking_refund against the base capture row.
  if (bookingId) {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: existingRefund } = await supabaseAdmin
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", id)
      .maybeSingle();
    if (existingRefund) {
      return;
    }

    const amountInCurrency = amountCents / 100;

    const { data: bookingPayment } = await supabaseAdmin
      .from("booking_payments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("payment_provider_id", yocoPaymentId)
      .maybeSingle();

    const { error: refundError } = await supabaseAdmin.from("booking_refunds").insert({
      booking_id: bookingId,
      payment_id: (bookingPayment as { id?: string } | null)?.id ?? null,
      amount: amountInCurrency,
      reason: "Yoco card refund",
      refund_method: "original",
      refund_provider_id: id,
      status: "completed",
      notes: `Yoco refund ${id} (payment ${yocoPaymentId})`,
    });

    if (refundError) {
      console.error("Yoco webhook: failed to create booking_refund:", refundError);
    }
  }
}

async function handleRefundFailure(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const err = data.error as { message?: string } | undefined;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const yocoPaymentId = metadata?.payment_id as string | undefined;

  let providerId: string | null = null;
  if (yocoPaymentId) {
    const { data: payment } = await supabase
      .from("provider_yoco_payments")
      .select("provider_id")
      .eq("yoco_payment_id", yocoPaymentId)
      .single();
    providerId = (payment as { provider_id?: string } | null)?.provider_id ?? null;
  }

  await supabase
    .from("provider_yoco_refunds")
    .insert({
      provider_id: providerId,
      yoco_refund_id: id,
      payment_id: yocoPaymentId,
      status: "failed",
      error_message: err?.message ?? "Refund failed",
      created_at: new Date().toISOString(),
    });
}
