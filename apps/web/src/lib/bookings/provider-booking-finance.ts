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
