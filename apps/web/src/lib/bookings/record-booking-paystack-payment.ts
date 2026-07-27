import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordBookingPaystackPaymentResult =
  | { ok: true; paymentProviderId: string; inserted: boolean; bookingPaymentId: string }
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
    return {
      ok: true,
      paymentProviderId,
      inserted: false,
      bookingPaymentId: String((existingBookingPayment as { id: string }).id),
    };
  }

  const paymentRow = {
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
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("booking_payments")
    .insert(paymentRow)
    .select("id")
    .maybeSingle();

  if (insertError && insertError.code !== "23505") {
    const message = String(insertError.message || "").toLowerCase();
    if (message.includes("status") || message.includes("enum")) {
      const { status: _status, ...rowWithoutStatus } = paymentRow;
      const { error: fallbackError } = await supabase.from("booking_payments").insert(rowWithoutStatus);

      if (fallbackError && fallbackError.code !== "23505") {
        return { ok: false, reason: "missing_provider_id", error: fallbackError };
      }

      if (!fallbackError) {
        await supabase
          .from("booking_payments")
          .update({ status: "completed" })
          .eq("payment_provider", "paystack")
          .eq("payment_provider_id", paymentProviderId);
      }

      const { data: fallbackRow } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("payment_provider", "paystack")
        .eq("payment_provider_id", paymentProviderId)
        .maybeSingle();

      if (!fallbackRow?.id) {
        return { ok: false, reason: "missing_provider_id", error: fallbackError ?? insertError };
      }

      return {
        ok: true,
        paymentProviderId,
        inserted: fallbackError?.code !== "23505",
        bookingPaymentId: String(fallbackRow.id),
      };
    }

    return { ok: false, reason: "missing_provider_id", error: insertError };
  }

  if (insertError?.code === "23505") {
    const { data: concurrentRow } = await supabase
      .from("booking_payments")
      .select("id")
      .eq("payment_provider", "paystack")
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

  if (!insertedRow?.id) {
    return { ok: false, reason: "missing_provider_id", error: insertError };
  }

  return {
    ok: true,
    paymentProviderId,
    inserted: true,
    bookingPaymentId: String(insertedRow.id),
  };
}
