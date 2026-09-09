import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordProviderInvoicePaymentResult = {
  /** False when the reference had already been recorded — the caller should treat this as success. */
  applied: boolean;
  invoiceId: string;
  amountApplied: number;
};

type InvoiceRow = {
  id: string;
  provider_id: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  status: string | null;
};

/**
 * Single entry point for crediting a platform invoice.
 *
 * Every path that marks an invoice paid must go through here so that
 * `provider_invoice_payments` stays the source of truth and the
 * `update_invoice_amount_paid` trigger keeps `amount_paid` and `status` in step.
 * Writing `status: "paid"` directly onto `provider_invoices` desynchronises the
 * two and leaves an invoice that reads as settled with no payment behind it.
 *
 * Idempotent on `payment_reference` (unique index, migration 881), so the
 * Paystack webhook and the client-side verify call can both fire safely.
 */
export async function recordProviderInvoicePayment(params: {
  supabase: SupabaseClient;
  invoiceId: string;
  amount: number;
  paymentReference?: string | null;
  paymentMethodId?: string | null;
  paymentDate?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RecordProviderInvoicePaymentResult> {
  const {
    supabase,
    invoiceId,
    amount,
    paymentReference,
    paymentMethodId,
    paymentDate,
    createdBy,
    metadata,
  } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const reference = paymentReference?.trim() || null;

  if (reference) {
    const { data: existing } = await supabase
      .from("provider_invoice_payments")
      .select("id, invoice_id, amount")
      .eq("payment_reference", reference)
      .maybeSingle();
    if (existing) {
      const row = existing as { invoice_id: string; amount: number };
      return { applied: false, invoiceId: row.invoice_id, amountApplied: Number(row.amount) };
    }
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("provider_invoices")
    .select("id, provider_id, total_amount, amount_paid, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    throw new Error("Invoice not found");
  }

  const row = invoice as InvoiceRow;
  const amountDue = Number(row.total_amount ?? 0) - Number(row.amount_paid ?? 0);
  if (amount > amountDue + 0.005) {
    throw new Error(`Payment amount cannot exceed ${amountDue.toFixed(2)}`);
  }

  const { error: insertError } = await supabase
    .from("provider_invoice_payments")
    .insert({
      invoice_id: invoiceId,
      payment_method_id: paymentMethodId || null,
      amount,
      payment_date: paymentDate || new Date().toISOString().split("T")[0],
      payment_reference: reference,
      status: "completed",
      created_by: createdBy || null,
      metadata: metadata ?? {},
    });

  if (insertError) {
    // Lost a race with the webhook or a retry — the reference is already credited.
    if ((insertError as { code?: string }).code === "23505") {
      return { applied: false, invoiceId, amountApplied: amount };
    }
    throw insertError;
  }

  // Receipt for a fully settled invoice. Read back rather than computing from
  // `amount` so a concurrent part-payment cannot make this fire twice or not at all.
  if (row.provider_id) {
    try {
      const { data: settled } = await supabase
        .from("provider_invoices")
        .select("status, invoice_number, total_amount")
        .eq("id", invoiceId)
        .maybeSingle();

      if ((settled as { status?: string } | null)?.status === "paid") {
        const { notifyProviderInvoicePaid } = await import(
          "@/lib/notifications/notification-service"
        );
        await notifyProviderInvoicePaid(row.provider_id, {
          invoice_number: String((settled as { invoice_number?: string }).invoice_number ?? ""),
          total_amount: Number((settled as { total_amount?: number }).total_amount ?? 0),
          payment_date: paymentDate || new Date().toISOString().split("T")[0],
        });
      }
    } catch (notifyError) {
      // The money is recorded; a missing receipt must not unwind that.
      console.error("[record-provider-invoice-payment] receipt notification failed", {
        invoiceId,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }
  }

  return { applied: true, invoiceId, amountApplied: amount };
}
