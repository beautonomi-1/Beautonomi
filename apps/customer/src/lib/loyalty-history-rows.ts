/**
 * Single source for loyalty history rows from `/api/me/loyalty-points`.
 * Prefer `recent_transactions`; fall back to deprecated `history` only.
 */
export function loyaltyHistoryRowsForDisplay<T extends { id?: string }>(
  data: { history?: T[]; recent_transactions?: T[] } | null | undefined,
): T[] {
  if (!data) return [];
  if (Array.isArray(data.recent_transactions) && data.recent_transactions.length > 0) {
    return data.recent_transactions;
  }
  return data.history ?? [];
}
