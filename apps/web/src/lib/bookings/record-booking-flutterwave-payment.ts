import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordBookingFlutterwavePaymentResult =
  | { ok: true; paymentProviderId: string; inserted: boolean; bookingPaymentId: string }
  | { ok: false; reason: "missing_provider_id" | "invalid_amount"; error?: unknown };

/**
 * Record a completed Flutterwave booking payment (parity with recordBookingStripePayment).
 * `payment_provider_id` is the Flutterwave transaction id (globally unique, idempotent).
 */
export async function recordBookingFlutterwavePayment(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    tenantId?: string | null;
    transactionId?: string | null;
    reference?: string | null;
    amountMajor: number;
    currency?: string | null;
    source: string;
    paymentOption?: string | null;
    requiresDeposit?: boolean;
    notes?: string | null;
  },
): Promise<RecordBookingFlutterwavePaymentResult> {
  const paymentProviderId =
    typeof input.transactionId === "string" && input.transactionId.trim()
      ? input.transactionId.trim()
      : typeof input.reference === "string" && input.reference.trim()
        ? input.reference.trim()
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
    .eq("payment_provider", "flutterwave")
    .eq("payment_provider_id", paymentProviderId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: "missing_provider_id", error: existingError };
  }
  if (existing) {
    return {
      ok: true,
      paymentProviderId,
      inserted: false,
      bookingPaymentId: String((existing as { id: string }).id),
    };
  }

  const paymentRow: Record<string, unknown> = {
    booking_id: input.bookingId,
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    amount,
    ...(input.currency ? { currency: input.currency } : {}),
    payment_method: "card",
    payment_provider: "flutterwave",
    payment_provider_id: paymentProviderId,
    status: "completed",
    notes: input.notes ?? `Payment received via Flutterwave. Tx: ${paymentProviderId}`,
    payment_provider_data: {
      source: input.source,
      reference: input.reference ?? null,
      flutterwave_transaction_id: paymentProviderId,
      payment_option: input.paymentOption ?? "full",
      requires_deposit: Boolean(input.requiresDeposit),
    },
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("booking_payments")
    .insert(paymentRow)
    .select("id")
    .maybeSingle();

  if (insertError?.code === "23505") {
    const { data: concurrentRow } = await supabase
      .from("booking_payments")
      .select("id")
      .eq("payment_provider", "flutterwave")
      .eq("payment_provider_id", paymentProviderId)
      .maybeSingle();
    if (concurrentRow?.id) {
      return {
        ok: true,
        paymentProviderId,
        inserted: false,
        bookingPaymentId: String(concurrentRow.id),
      };
    }
  }

  if (insertError || !insertedRow?.id) {
    return { ok: false, reason: "missing_provider_id", error: insertError };
  }

  return {
    ok: true,
    paymentProviderId,
    inserted: true,
    bookingPaymentId: String(insertedRow.id),
  };
}
