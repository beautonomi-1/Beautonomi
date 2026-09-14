import type { ProviderDashboardStats } from "./provider-dashboard-stats";

export type PayoutBalanceCardView = {
  title: string;
  value: number;
  subtitle: string;
  href: string;
  color: "blue" | "orange";
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const PB = "web.provider.dashboard.payoutBalance";

/**
 * Dashboard copy for platform-held payout balance — aligned with
 * `getAvailablePayoutBalance` / GET /api/provider/finance `earnings.available_balance`.
 */
export function buildPayoutBalanceCardView(
  stats: ProviderDashboardStats,
  formatMoney: (amount: number) => string,
  t: TranslateFn,
  options?: { locationFiltered?: boolean },
): PayoutBalanceCardView {
  const pendingQueue = Math.max(0, stats.pending_payout_queue ?? 0);
  const holdDays = Math.max(0, stats.payout_hold_days ?? 0);
  const locationNote = options?.locationFiltered ? t(`${PB}.allLocationsPrefix`) : "";

  if (stats.has_negative_payout_balance) {
    return {
      title: t(`${PB}.balanceOwed`),
      value: Math.max(0, stats.balance_owed_to_platform ?? 0),
      subtitle: t(`${PB}.owedToPlatformReview`, { prefix: locationNote }),
      href: "/provider/finance",
      color: "orange",
    };
  }

  let subtitle = t(`${PB}.platformHeldReady`, { prefix: locationNote });
  if (pendingQueue > 0.009) {
    subtitle = t(`${PB}.payoutQueue`, { prefix: locationNote, amount: formatMoney(pendingQueue) });
  } else if (holdDays > 0) {
    subtitle = t(`${PB}.holdOnEarnings`, { prefix: locationNote, days: holdDays });
  }

  return {
    title: t(`${PB}.availableToWithdraw`),
    value: Math.max(0, stats.available_balance ?? 0),
    subtitle,
    href: "/provider/finance",
    color: "blue",
  };
}
