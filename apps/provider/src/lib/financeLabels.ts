/** Human-friendly labels for ledger transaction types and UI buckets. */
export function formatLedgerTransactionType(type: string): string {
  const map: Record<string, string> = {
    provider_earnings: "Earnings",
    refund: "Refund",
    tip: "Tip",
    travel_fee: "Travel fee",
    membership_sale: "Membership",
    gift_card_sale: "Gift card",
    walk_in_additional_charge: "Walk-in add-on",
    payout: "Payout",
    service_fee: "Platform fee",
    platform_fee: "Platform fee",
    tax: "Tax",
    additional_charge: "Additional charge",
    additional_charge_payment: "Add. charge payment",
    cancellation_fee: "Cancellation fee",
    deposit: "Deposit",
    booking_payment: "Booking payment",
    wallet_topup: "Wallet top-up",
    wallet_debit: "Wallet debit",
    commission: "Commission",
    product_sale: "Product sale",
    product_refund: "Product refund",
  };
  return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatLedgerUiBucket(type: string): string {
  const map: Record<string, string> = {
    earning: "Earning",
    fee: "Platform fee",
    payout: "Payout",
    refund: "Refund",
    tip: "Tip",
    adjustment: "Other / adjustment",
  };
  return map[type] || formatLedgerTransactionType(type);
}
