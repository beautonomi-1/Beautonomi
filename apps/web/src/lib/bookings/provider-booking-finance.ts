export function normalizeProviderCreateDiscounts({
  discountAmount,
  promotionDiscountAmount,
  membershipDiscountAmount,
  discountCode,
}: {
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
  discountCode?: string | null;
}): {
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
} {
  let normalizedDiscount = Math.max(0, Number(discountAmount) || 0);
  const normalizedPromotion = Math.max(0, Number(promotionDiscountAmount) || 0);
  const normalizedMembership = Math.max(0, Number(membershipDiscountAmount) || 0);

  if (
    normalizedPromotion > 0.001 &&
    typeof discountCode === "string" &&
    discountCode.trim().length > 0 &&
    normalizedDiscount <= normalizedPromotion + 0.001
  ) {
    normalizedDiscount = 0;
  }

  if (normalizedMembership > 0.001) {
    normalizedDiscount = Math.max(0, normalizedDiscount - normalizedMembership);
  }

  return {
    discountAmount: normalizedDiscount,
    promotionDiscountAmount: normalizedPromotion,
    membershipDiscountAmount: normalizedMembership,
  };
}

export function sumExplicitProviderAddonsSubtotal(addons: unknown): number {
  if (!Array.isArray(addons)) return 0;
  return addons.reduce((sum: number, addon: Record<string, unknown>) => {
    const qty = Math.max(1, Math.floor(Number(addon.quantity ?? 1)) || 1);
    return sum + (Number(addon.price) || 0) * qty;
  }, 0);
}

export function computeProviderCreateTaxableAmount({
  subtotal,
  discountAmount,
  promotionDiscountAmount,
  membershipDiscountAmount,
}: {
  subtotal: number;
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
}): number {
  return Math.max(
    0,
    (Number(subtotal) || 0) -
      Math.max(0, Number(discountAmount) || 0) -
      Math.max(0, Number(promotionDiscountAmount) || 0) -
      Math.max(0, Number(membershipDiscountAmount) || 0),
  );
}

export interface ResolvedProviderBookingDeposit {
  /** May differ from the requested option when the deposit could not be resolved. */
  paymentOption: "full" | "deposit";
  depositRequired: boolean;
  depositPercentage: number | null;
  depositAmount: number | null;
  /** Provider-facing notes about anything that was corrected. */
  warnings: string[];
}

/**
 * Resolve the deposit a provider-created booking should record.
 *
 * The client computes its deposit against its own total, which the server
 * recomputes from catalog prices — so the percentage is authoritative and the
 * amount is always re-derived from the server total. A bare amount (custom
 * deposit) is honoured but capped at what is owed.
 *
 * This never fails the booking. A deposit that cannot be resolved at all —
 * usually a provider whose settings require a deposit but leave the percentage
 * at zero — falls back to a full payment with a warning, because refusing to
 * take the money at the counter is worse than taking all of it.
 */
export function resolveProviderBookingDeposit({
  paymentOption,
  depositRequired,
  depositPercentage,
  depositAmount,
  totalAmount,
}: {
  paymentOption: unknown;
  depositRequired: unknown;
  depositPercentage: unknown;
  depositAmount: unknown;
  totalAmount: number;
}): ResolvedProviderBookingDeposit {
  const isDepositOption = paymentOption === "deposit";
  const total = Math.max(0, Number(totalAmount) || 0);
  const warnings: string[] = [];

  const rawPercentage = Number(depositPercentage);
  const rawAmount = Number(depositAmount);
  const hasValidPercentage =
    Number.isFinite(rawPercentage) && rawPercentage > 0 && rawPercentage <= 100;
  const hasValidAmount = Number.isFinite(rawAmount) && rawAmount > 0;

  if (!isDepositOption) {
    return {
      paymentOption: "full",
      depositRequired: Boolean(depositRequired),
      depositPercentage: hasValidPercentage ? Math.round(rawPercentage * 100) / 100 : null,
      depositAmount: hasValidAmount ? Math.min(total, Math.round(rawAmount * 100) / 100) : null,
      warnings,
    };
  }

  if (!hasValidPercentage && !hasValidAmount) {
    warnings.push(
      "No valid deposit was set for this booking, so it was recorded as a full payment. Check the deposit percentage in your payment settings.",
    );
    return {
      paymentOption: "full",
      depositRequired: false,
      depositPercentage: null,
      depositAmount: null,
      warnings,
    };
  }

  const resolvedPercentage = hasValidPercentage ? Math.round(rawPercentage * 100) / 100 : null;
  const requestedAmount =
    resolvedPercentage != null
      ? Math.round(total * resolvedPercentage) / 100
      : Math.round(rawAmount * 100) / 100;
  const resolvedAmount = Math.min(total, requestedAmount);

  if (resolvedPercentage == null && requestedAmount > total + 0.01) {
    warnings.push(
      "The deposit was larger than the booking total, so the full total was recorded instead.",
    );
  }

  return {
    paymentOption: "deposit",
    depositRequired: true,
    depositPercentage: resolvedPercentage,
    depositAmount: resolvedAmount,
    warnings,
  };
}

export function computeWalletGiftCoverageOutstanding({
  totalAmount,
  totalPaid,
  totalRefunded,
  walletAmount,
  giftCardAmount,
  unpaidAdditionalCharges = 0,
}: {
  totalAmount: number;
  totalPaid: number;
  totalRefunded: number;
  walletAmount: number;
  giftCardAmount: number;
  unpaidAdditionalCharges?: number;
}): number {
  const paidAfterRefunds = Math.max(0, (Number(totalPaid) || 0) - (Number(totalRefunded) || 0));
  const walletGiftCoverage = Math.max(0, (Number(walletAmount) || 0) + (Number(giftCardAmount) || 0));
  const coverage = Math.max(paidAfterRefunds, walletGiftCoverage);
  return Math.max(0, (Number(totalAmount) || 0) - coverage + (Number(unpaidAdditionalCharges) || 0));
}
