export type BookingPaymentTender = {
  payment_method?: string | null;
  payment_provider?: string | null;
  amount?: number | string | null;
};

export function tenderLabelForPayment(p: BookingPaymentTender): string {
  const provider = String(p.payment_provider ?? "").toLowerCase();
  const method = String(p.payment_method ?? "").toLowerCase();

  if (provider === "paystack") return "Card (Paystack)";
  if (provider === "paycloud") return "Card machine (PayCloud)";
  if (provider === "yoco") return "Card machine (Yoco)";
  if (provider === "cash" || method === "cash") return "Cash";
  if (provider === "wallet" || method === "wallet") return "Wallet";
  if (provider === "gift_card" || method === "gift_card") return "Gift card";

  if (provider) return provider.replace(/_/g, " ");
  if (method) return method.replace(/_/g, " ");
  return "Unknown";
}

export function aggregateTenderLabel(payments: BookingPaymentTender[]): string {
  const labels = [...new Set(payments.map(tenderLabelForPayment))].filter(
    (l) => l !== "Unknown",
  );
  if (labels.length === 0) return "Unknown";
  if (labels.length === 1) return labels[0]!;
  return "Mixed";
}

export function chargeTypeLabel(row: {
  transaction_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const tt = String(row.transaction_type ?? "charge");
  const kind =
    row.metadata && typeof row.metadata === "object"
      ? String((row.metadata as { kind?: unknown }).kind ?? "")
      : "";
  if (tt === "additional_charge" || kind === "walk_in_additional_charge") {
    return "Extra payment";
  }
  if (tt === "charge") return "Original booking";
  return tt.replace(/_/g, " ");
}
