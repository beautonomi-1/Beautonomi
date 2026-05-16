/**
 * Mirrors apps/web `ledgerRowDisplaySign` so the Expo app shows the same
 * debit/credit semantics as GET /api/provider/finance transaction rows.
 */

export function ledgerRowDisplaySign(row: {
  transaction_type: string;
  net?: number | null;
  amount?: number | null;
}): 1 | -1 {
  const tt = row.transaction_type;
  const net = Number(row.net ?? row.amount ?? 0);
  const gross = Number(row.amount ?? 0);

  if (tt === "provider_earnings") return net < 0 ? -1 : 1;
  if (tt === "refund" || tt === "payout") return -1;
  if (tt === "tip") return 1;
  if (tt === "service_fee" || tt === "platform_fee") return -1;
  if (tt === "travel_fee") return 1;
  if (tt === "tax") return -1;
  if (tt === "membership_sale" || tt === "gift_card_sale") return net >= 0 ? 1 : -1;
  if (
    tt === "walk_in_additional_charge" ||
    tt === "additional_charge" ||
    tt === "additional_charge_payment"
  ) {
    return net >= 0 ? 1 : -1;
  }
  if (tt === "provider_subscription_payment" || tt === "provider_ads_payment") return -1;
  if (tt === "cancellation_fee") return net < 0 ? -1 : 1;
  if (net < 0) return -1;
  if (net > 0) return 1;
  return gross >= 0 ? 1 : -1;
}

/** Title line for the Transactions hub recent list (capitalized in UI). */
export function hubTransactionTypeTitle(transactionType: string): string {
  if (transactionType === "walk_in_additional_charge") return "Walk-in add-on";
  if (transactionType === "service_fee" || transactionType === "platform_fee") {
    return "Platform fee · retained by platform";
  }
  return transactionType.replace(/_/g, " ");
}
