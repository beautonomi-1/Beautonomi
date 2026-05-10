import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordBookingPaystackPaymentResult =
  | { ok: true; paymentProviderId: string; inserted: boolean }
  | { ok: false; reason: "missing_provider_id" | "invalid_amount"; error?: unknown };

export async function recordBookingPaystackPayment(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    tenantId?: string | null;
    reference?: string | null;
    transactionId?: string | number | null;
    amountMajor: number;
    source: string;
    paymentOption?: string | null;
    requiresDeposit?: boolean | null;
    saveCard?: boolean | null;
    paymentMethodId?: string | null;
    notes?: string | null;
  },
): Promise<RecordBookingPaystackPaymentResult> {
  const paymentProviderId =
    typeof input.reference === "string" && input.reference.trim()
      ? input.reference.trim()
      : input.transactionId !== undefined && input.transactionId !== null
        ? String(input.transactionId)
        : null;

  if (!paymentProviderId) {
    return { ok: false, reason: "missing_provider_id" };
  }

  const amount = Math.round(Number(input.amountMajor || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const { data: existingBookingPayment, error: existingError } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", "paystack")
    .eq("payment_provider_id", paymentProviderId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: "missing_provider_id", error: existingError };
  }

  if (existingBookingPayment) {
    return { ok: true, paymentProviderId, inserted: false };
  }

  const { error: insertError } = await supabase.from("booking_payments").insert({
    booking_id: input.bookingId,
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    amount,
    payment_method: "card",
    payment_provider: "paystack",
    payment_provider_id: paymentProviderId,
    status: "completed",
    notes: input.notes ?? `Payment received via Paystack. Ref: ${paymentProviderId}`,
    payment_provider_data: {
      source: input.source,
      reference: input.reference ?? null,
      paystack_transaction_id: input.transactionId ?? null,
      payment_option: input.paymentOption ?? null,
      requires_deposit: Boolean(input.requiresDeposit),
      save_card: Boolean(input.saveCard),
      payment_method_id: input.paymentMethodId ?? null,
    },
  });

  if (insertError && insertError.code !== "23505") {
    return { ok: false, reason: "missing_provider_id", error: insertError };
  }

  return { ok: true, paymentProviderId, inserted: true };
}
