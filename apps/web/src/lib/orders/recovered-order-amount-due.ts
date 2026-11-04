/** Card amount still owed when checkout recovers an order that was already saved. */
export function recoveredOrderAmountDue(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  walletAmount: number;
  giftCardAmount: number;
}): number {
  if (String(input.paymentStatus ?? "").toLowerCase() === "paid") return 0;
  const total = Math.max(0, Number(input.totalAmount) || 0);
  const covered =
    Math.max(0, Number(input.walletAmount) || 0) + Math.max(0, Number(input.giftCardAmount) || 0);
  return Math.max(0, Math.round((total - covered) * 100) / 100);
}
