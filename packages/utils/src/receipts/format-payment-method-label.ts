/**
 * Canonical user-facing label for payment_method / payment_provider.
 * Kept in @beautonomi/utils so mobile share text matches PDF receipts.
 */
export function formatPaymentMethodLabel(
  paymentMethod?: string | null,
  paymentProvider?: string | null,
): string {
  const m = String(paymentMethod ?? "").toLowerCase();
  const p = String(paymentProvider ?? "").toLowerCase();
  if (m === "wallet" || p === "wallet") return "Wallet";
  if (m === "gift_card" || p === "gift_card") return "Gift card";
  if (m === "cash" || p === "cash") return "Cash";
  if (m === "bank_transfer" || m === "eft") return "EFT";
  if (
    m === "paystack_terminal" ||
    p === "paystack_terminal" ||
    p === "paystack_virtual_terminal"
  ) {
    return "Paystack Terminal";
  }
  if (m === "paycloud" || p === "paycloud") return "PayCloud";
  if (m === "yoco" || p === "yoco") return "Yoco";
  if (m === "card") {
    if (p === "yoco") return "Card (Yoco)";
    if (p === "paystack") return "Card";
    if (p === "stripe") return "Card";
    if (p === "flutterwave") return "Card";
    if (p === "other") return "Card (manual)";
    return "Card";
  }
  if (m === "saved_card" || m === "new_card") return "Card";
  if (m === "other") return p ? `Other (${p})` : "Other";
  if (m === "payment_link") return "Payment link";
  if (m === "mark_paid") return "Marked paid";
  return paymentMethod ? String(paymentMethod) : "Payment";
}
