/** Human labels for wallet_transactions.reference_type used by bank-refund holds. */
export const WALLET_BANK_REFUND_TX_LABELS: Record<string, string> = {
  bank_refund_hold: "Bank refund hold",
  bank_refund_release: "Bank refund returned to wallet",
};

export function labelWalletReferenceType(type: string | null | undefined): string {
  if (!type) return "—";
  return WALLET_BANK_REFUND_TX_LABELS[type] ?? type.replace(/_/g, " ");
}
