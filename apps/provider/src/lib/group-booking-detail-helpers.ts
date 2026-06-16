export type GroupPaymentSummarySource = {
  payment_status?: string | null;
  balance_due?: number | null;
  amount_paid?: number | null;
  total_refunded?: number | null;
  is_invoiced?: boolean | null;
  total_price?: number | null;
};

export type GroupParticipantRefundContext = {
  id?: string;
  is_primary_contact?: boolean;
  booking_id?: string | null;
};

export function formatGroupPaymentStatusLabel(status: string | undefined | null): string {
  const s = String(status ?? "").toLowerCase();
  if (!s || s === "not_invoiced") return "Not invoiced";
  if (s === "paid") return "Paid in full";
  if (s === "partially_paid" || s === "partial") return "Partially paid";
  if (s === "partially_refunded") return "Partially refunded";
  if (s === "refunded") return "Refunded";
  if (s === "pending") return "Pending payment";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function groupIsFullyPaid(group: GroupPaymentSummarySource): boolean {
  const status = String(group.payment_status ?? "").toLowerCase();
  if (status === "paid" || status === "refunded") return true;
  const balanceDue = Number(group.balance_due ?? NaN);
  if (Number.isFinite(balanceDue) && balanceDue <= 0 && group.is_invoiced) return true;
  return false;
}

export function participantMaxRefundable(args: {
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_gift_coverage?: number | null;
}): number {
  const totalPaid = Number(args.total_paid ?? 0);
  const totalRefunded = Number(args.total_refunded ?? 0);
  const walletGift = Number(args.wallet_gift_coverage ?? 0);
  return Math.max(0, Math.max(totalPaid, walletGift) - totalRefunded);
}

/** Online single-charge: primary holds the group charge; guests have no separate booking. */
export function isSingleChargeOnlineGroup(
  participants: GroupParticipantRefundContext[] | undefined,
  refundableParticipantId: string,
): boolean {
  const list = participants ?? [];
  const target = list.find((p) => p.id === refundableParticipantId);
  if (!target?.booking_id) return false;

  const targetIndex = list.findIndex((p) => p.id === refundableParticipantId);
  const isPrimary = Boolean(target.is_primary_contact) || targetIndex === 0;
  if (!isPrimary) return false;

  const othersWithBooking = list.filter((p) => p.id !== refundableParticipantId && p.booking_id);
  const othersWithoutBooking = list.filter((p) => p.id !== refundableParticipantId && !p.booking_id);
  return othersWithoutBooking.length > 0 && othersWithBooking.length === 0;
}
