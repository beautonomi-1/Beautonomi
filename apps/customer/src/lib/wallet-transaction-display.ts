export type WalletTxRow = {
  id: string;
  type?: string;
  amount?: number;
  description?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  created_at?: string | null;
};

export type WalletTranslate = (key: string, opts?: Record<string, string | number>) => string;

const REFERENCE_TYPE_KEYS: Record<string, string> = {
  booking: "refTypeBooking",
  booking_refund: "refTypeBookingRefund",
  product_order: "refTypeProductOrder",
  product_order_refund: "refTypeProductOrderRefund",
  wallet_topup: "refTypeWalletTopup",
  gift_card_redemption: "refTypeGiftCardRedemption",
  gift_card_redeem: "refTypeGiftCardRedeem",
  loyalty_redeem: "refTypeLoyaltyRedeem",
  referral: "refTypeReferral",
  membership_order: "refTypeMembership",
  custom_offer: "refTypeCustomOffer",
  custom_offer_refund: "refTypeCustomOfferRefund",
  refund: "refTypeRefund",
  bank_refund_hold: "refTypeBankRefundHold",
  bank_refund_release: "refTypeBankRefundRelease",
  booking_payment_failed: "refTypeBookingPaymentFailed",
};

export function walletReferenceTypeLabel(
  referenceType: string | null | undefined,
  tw: WalletTranslate,
): string | null {
  if (!referenceType) return null;
  const key = REFERENCE_TYPE_KEYS[referenceType];
  if (key) return tw(key);
  return referenceType.replace(/_/g, " ");
}

export function walletTransactionTypeLabel(type: string | null | undefined, tw: WalletTranslate): string {
  if (type === "credit") return tw("transactionCredit");
  if (type === "debit") return tw("transactionDebit");
  return tw("transactionFallback");
}

export type WalletTxNavigation =
  | { kind: "booking"; id: string }
  | { kind: "product_order"; id: string }
  | null;

export function walletTransactionNavigation(row: WalletTxRow): WalletTxNavigation {
  const refType = row.reference_type ?? "";
  const refId = row.reference_id?.trim();
  if (!refId) return null;
  if (refType === "booking" || refType === "booking_refund") {
    return { kind: "booking", id: refId };
  }
  if (refType === "product_order" || refType === "product_order_refund") {
    return { kind: "product_order", id: refId };
  }
  return null;
}

export function walletRowPrimaryLabel(row: WalletTxRow, tw: WalletTranslate): string {
  const desc = row.description?.trim();
  if (desc) return desc;
  return walletTransactionTypeLabel(row.type, tw);
}
