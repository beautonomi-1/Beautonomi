import { subtractMoney, sumMoney } from "@beautonomi/utils";

export type GroupPaymentMode = "organizer_pays_all" | "split";

export function normalizeGroupPaymentMode(
  mode: string | null | undefined,
): GroupPaymentMode {
  return mode === "split" ? "split" : "organizer_pays_all";
}

export function sumOfferingPrices(
  serviceIds: string[],
  offeringById: Map<string, { price?: number | null }>,
): number {
  let total = 0;
  for (const id of serviceIds) {
    const off = offeringById.get(id);
    total = sumMoney(total, Number(off?.price ?? 0));
  }
  return total;
}

/**
 * Split checkout: guests pay their service subtotals later; organizer pays
 * everything else at checkout (fees, travel, tax, primary services).
 */
export function computeGroupSplitPaymentAmounts(args: {
  totalAmount: number;
  guestServiceTotals: number[];
}): { organizerCheckoutAmount: number; guestAmounts: number[] } {
  const guestAmounts = args.guestServiceTotals.map((n) => Math.max(0, Number(n) || 0));
  const guestSum = guestAmounts.reduce((acc, n) => sumMoney(acc, n), 0);
  const organizerCheckoutAmount = Math.max(0, subtractMoney(args.totalAmount, guestSum));
  return { organizerCheckoutAmount, guestAmounts };
}
