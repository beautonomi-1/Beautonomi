/**
 * Paid ads campaign list filters — pure logic for unit tests.
 */

export type CampaignPaymentState = "none" | "unpaid" | "pending" | "failed" | "paid";

export type CampaignLifecycle =
  | "awaiting_payment"
  | "confirming"
  | "payment_failed"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "expired"
  | "delivered"
  | "cancelled";

export type CampaignFilterChip = "all" | "needs_payment" | "payment_failed" | "active" | "past";

export type FilterableCampaign = {
  id: string;
  status?: string;
  payment_state?: CampaignPaymentState;
  lifecycle?: CampaignLifecycle;
  budget?: number;
  spent?: number;
};

export function isPastCampaign(lifecycle: CampaignLifecycle | undefined): boolean {
  return (
    lifecycle === "budget_exhausted" ||
    lifecycle === "expired" ||
    lifecycle === "delivered" ||
    lifecycle === "cancelled"
  );
}

function isNeedsPayment(c: FilterableCampaign): boolean {
  const ps = c.payment_state;
  return ps === "unpaid" || ps === "pending";
}

function isPaymentFailed(c: FilterableCampaign): boolean {
  return c.payment_state === "failed" || c.lifecycle === "payment_failed";
}

function isActiveCampaign(c: FilterableCampaign): boolean {
  return c.lifecycle === "active";
}

export type FilterCampaignsOptions = {
  /** When false, past campaigns are hidden unless chip is "past" or "all" with showPast. */
  showPast?: boolean;
};

export function filterCampaignsByChip<T extends FilterableCampaign>(
  campaigns: T[],
  chip: CampaignFilterChip,
  opts: FilterCampaignsOptions = {},
): T[] {
  const showPast = opts.showPast ?? false;

  return campaigns.filter((c) => {
    const past = isPastCampaign(c.lifecycle);

    switch (chip) {
      case "needs_payment":
        return isNeedsPayment(c) && !past;
      case "payment_failed":
        return isPaymentFailed(c) && !past;
      case "active":
        return isActiveCampaign(c);
      case "past":
        return past;
      case "all":
      default:
        return showPast || !past;
    }
  });
}

export function countCampaignsByChip(
  campaigns: FilterableCampaign[],
): Record<CampaignFilterChip, number> {
  return {
    all: campaigns.filter((c) => !isPastCampaign(c.lifecycle)).length,
    needs_payment: campaigns.filter((c) => isNeedsPayment(c) && !isPastCampaign(c.lifecycle)).length,
    payment_failed: campaigns.filter((c) => isPaymentFailed(c) && !isPastCampaign(c.lifecycle)).length,
    active: campaigns.filter((c) => isActiveCampaign(c)).length,
    past: campaigns.filter((c) => isPastCampaign(c.lifecycle)).length,
  };
}

/** Drafts that can be bulk-cancelled (unpaid, failed, or unpaid pending). */
export function listClearableDraftCampaigns<T extends FilterableCampaign>(campaigns: T[]): T[] {
  return campaigns.filter(
    (c) =>
      !isPastCampaign(c.lifecycle) &&
      (c.payment_state === "unpaid" ||
        c.payment_state === "failed" ||
        (c.payment_state === "pending" && c.lifecycle === "awaiting_payment")),
  );
}
