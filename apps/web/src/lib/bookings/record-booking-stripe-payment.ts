import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordBookingStripePaymentResult =
  | { ok: true; paymentProviderId: string; inserted: boolean }
  | { ok: false; reason: "missing_provider_id" | "invalid_amount"; error?: unknown };

/**
 * Record a completed Stripe booking payment (parity with recordBookingPaystackPayment).
 * `payment_provider_id` is the Stripe PaymentIntent id (globally unique, idempotent).
 */
export async function recordBookingStripePayment(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    tenantId?: string | null;
    paymentIntentId?: string | null;
    reference?: string | null;
    amountMajor: number;
    currency?: string | null;
    source: string;
    notes?: string | null;
  },
): Promise<RecordBookingStripePaymentResult> {
  const paymentProviderId =
    typeof input.paymentIntentId === "string" && input.paymentIntentId.trim()
      ? input.paymentIntentId.trim()
      : null;

  if (!paymentProviderId) {
    return { ok: false, reason: "missing_provider_id" };
  }

  const amount = Math.round(Number(input.amountMajor || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", "stripe")
    .eq("payment_provider_id", paymentProviderId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: "missing_provider_id", error: existingError };
  }
  if (existing) {
    return { ok: true, paymentProviderId, inserted: false };
  }

  const paymentRow: Record<string, unknown> = {
    booking_id: input.bookingId,
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    amount,
    ...(input.currency ? { currency: input.currency } : {}),
    payment_method: "card",
    payment_provider: "stripe",
    payment_provider_id: paymentProviderId,
    status: "completed",
    notes: input.notes ?? `Payment received via Stripe. PaymentIntent: ${paymentProviderId}`,
    payment_provider_data: {
      source: input.source,
      reference: input.reference ?? null,
      stripe_payment_intent_id: paymentProviderId,
    },
  };

  const { error: insertError } = await supabase.from("booking_payments").insert(paymentRow);

  if (insertError && insertError.code !== "23505") {
    const message = String(insertError.message || "").toLowerCase();
    if (message.includes("status") || message.includes("enum")) {
      const { status: _status, ...rowWithoutStatus } = paymentRow;
      const { error: fallbackError } = await supabase
        .from("booking_payments")
        .insert(rowWithoutStatus);
      if (fallbackError && fallbackError.code !== "23505") {
        return { ok: false, reason: "missing_provider_id", error: fallbackError };
      }
      if (!fallbackError) {
        await supabase
          .from("booking_payments")
          .update({ status: "completed" })
          .eq("payment_provider", "stripe")
          .eq("payment_provider_id", paymentProviderId);
      }
      return { ok: true, paymentProviderId, inserted: fallbackError?.code !== "23505" };
    }
    return { ok: false, reason: "missing_provider_id", error: insertError };
  }

  return { ok: true, paymentProviderId, inserted: insertError?.code !== "23505" };
}
