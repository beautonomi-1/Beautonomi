import type { ProviderDashboardStats } from "./provider-dashboard-stats";

export type PayoutBalanceCardView = {
  title: string;
  value: number;
  subtitle: string;
  href: string;
  color: "blue" | "orange";
};

/**
 * Dashboard copy for platform-held payout balance — aligned with
 * `getAvailablePayoutBalance` / GET /api/provider/finance `earnings.available_balance`.
 */
export function buildPayoutBalanceCardView(
  stats: ProviderDashboardStats,
  formatMoney: (amount: number) => string,
  options?: { locationFiltered?: boolean },
): PayoutBalanceCardView {
  const pendingQueue = Math.max(0, stats.pending_payout_queue ?? 0);
  const holdDays = Math.max(0, stats.payout_hold_days ?? 0);
  const locationNote = options?.locationFiltered ? "All locations · " : "";

  if (stats.has_negative_payout_balance) {
    return {
      title: "Balance owed",
      value: Math.max(0, stats.balance_owed_to_platform ?? 0),
      subtitle: `${locationNote}Owed to platform — review in Finance`,
      href: "/provider/finance",
      color: "orange",
    };
  }

  let subtitle = `${locationNote}Platform-held · ready to request payout`;
  if (pendingQueue > 0.009) {
    subtitle = `${locationNote}${formatMoney(pendingQueue)} in payout queue`;
  } else if (holdDays > 0) {
    subtitle = `${locationNote}${holdDays}-day hold on new earnings`;
  }

  return {
    title: "Available to withdraw",
    value: Math.max(0, stats.available_balance ?? 0),
    subtitle,
    href: "/provider/payouts",
    color: "blue",
  };
}
