import type { SupabaseClient } from "@supabase/supabase-js";

export type TerminalOrderPaystackGuardResult =
  | { ok: true; order: TerminalOrderForPayment }
  | { ok: false; reason: string };

export type TerminalOrderForPayment = {
  id: string;
  provider_id: string;
  tenant_id: string | null;
  total_amount: number;
  invoice_status: string;
  commercial_model: string;
  paystack_reference: string | null;
};

/**
 * Validates a Paystack charge against a terminal order before recording payment.
 * Mirrors guards in verify-reference for webhook parity.
 */
export async function validateTerminalOrderPaystackPayment(
  supabase: SupabaseClient,
  input: {
    terminalOrderId: string;
    amountMajor: number;
    reference: string;
    metadataProviderId?: string | null;
  },
): Promise<TerminalOrderPaystackGuardResult> {
  const { terminalOrderId, amountMajor, reference, metadataProviderId } = input;

  const { data: termOrder, error } = await supabase
    .from("terminal_orders")
    .select(
      "id, provider_id, tenant_id, total_amount, invoice_status, commercial_model, paystack_reference, order_status",
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (error || !termOrder) {
    return { ok: false, reason: "terminal_order_not_found" };
  }

  const order = termOrder as TerminalOrderForPayment & { order_status?: string };

  if (["cancelled", "refunded", "failed"].includes(String(order.order_status ?? ""))) {
    return { ok: false, reason: "order_not_payable" };
  }

  if (
    metadataProviderId &&
    String(metadataProviderId) !== String(order.provider_id)
  ) {
    return { ok: false, reason: "provider_mismatch" };
  }

  const existingReference = order.paystack_reference ?? null;
  const expectedMajor = Number(order.total_amount ?? 0);

  if (
    Math.abs(amountMajor - expectedMajor) > 0.01 &&
    existingReference !== reference
  ) {
    return { ok: false, reason: "amount_mismatch" };
  }

  if (
    String(order.invoice_status ?? "") === "paid" &&
    existingReference &&
    existingReference !== reference
  ) {
    return { ok: false, reason: "already_paid_different_reference" };
  }

  return { ok: true, order };
}
