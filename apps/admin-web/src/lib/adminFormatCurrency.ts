/** Consistent money display for admin metrics (ledger amounts are major units). */
export function formatAdminCurrency(amount: number, currency = "ZAR"): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatAdminNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat().format(n);
}
