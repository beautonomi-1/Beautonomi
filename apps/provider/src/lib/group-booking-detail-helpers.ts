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
  checked_in?: boolean;
  checked_in_time?: string | null;
  checked_in_at?: string | null;
  checked_out?: boolean;
  checked_out_time?: string | null;
  checked_out_at?: string | null;
};

export type GroupParticipantCountSource = {
  current_participants?: number | null;
  participants?: GroupParticipantRefundContext[] | null;
};

/** Enrollment count — prefer live participants array over stale/missing API field. */
export function resolveGroupParticipantCount(group: GroupParticipantCountSource): number {
  const listed = group.participants?.length;
  if (typeof listed === "number" && listed >= 0) return listed;
  return Math.max(0, Number(group.current_participants ?? 0));
}

export function isGroupParticipantCheckedIn(p: GroupParticipantRefundContext): boolean {
  return p.checked_in === true || !!p.checked_in_time || !!p.checked_in_at;
}

export function isGroupParticipantCheckedOut(p: GroupParticipantRefundContext): boolean {
  return p.checked_out === true || !!p.checked_out_time || !!p.checked_out_at;
}

export function countGroupParticipantsCheckedIn(
  participants: GroupParticipantRefundContext[] | undefined | null,
): number {
  return (participants ?? []).filter(isGroupParticipantCheckedIn).length;
}

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
export type GroupFinancialProductLine = {
  quantity?: number | null;
  unit_price?: number | null;
  unitPrice?: number | null;
  total_price?: number | null;
  totalPrice?: number | null;
};

export type GroupFinancialBreakdownSource = GroupPaymentSummarySource & {
  location_type?: string | null;
  travel_fee?: number | null;
  package_discount_amount?: number | null;
  participants?: Array<{ price?: number | null; tip_amount?: number | null }> | null;
  products?: GroupFinancialProductLine[] | null;
  bookings?: Array<{
    additional_charges?: Array<{ amount?: number | null; status?: string | null }> | null;
  }> | null;
};

export type GroupFinancialBreakdown = {
  participantServicesTotal: number;
  productsTotal: number;
  travelFee: number;
  tipsTotal: number;
  packageDiscount: number;
  additionalChargesTotal: number;
  total: number;
};

function financialProductLineTotal(product: GroupFinancialProductLine): number {
  const qty = Math.max(1, Number(product.quantity ?? 1) || 1);
  return Math.max(
    0,
    Number(
      product.total_price ??
        product.totalPrice ??
        (Number(product.unit_price ?? product.unitPrice ?? 0) || 0) * qty,
    ) || 0,
  );
}

/** Mirrors web group-bookings Financials section for native detail sheet. */
export function computeGroupFinancialBreakdown(
  group: GroupFinancialBreakdownSource,
): GroupFinancialBreakdown {
  const participants = group.participants ?? [];
  const participantServicesTotal = participants.reduce(
    (sum, p) => sum + (Number(p.price) || 0),
    0,
  );
  const productsTotal = (group.products ?? []).reduce(
    (sum, product) => sum + financialProductLineTotal(product),
    0,
  );
  const travelFee =
    group.location_type === "at_home" ? Math.max(0, Number(group.travel_fee ?? 0)) : 0;
  const tipsTotal = participants.reduce(
    (sum, p) => sum + (Number(p.tip_amount ?? 0) || 0),
    0,
  );
  const packageDiscount = Math.max(0, Number(group.package_discount_amount ?? 0));
  const additionalChargesTotal = (group.bookings ?? []).reduce((sum, booking) => {
    const charges = booking.additional_charges ?? [];
    return (
      sum +
      charges
        .filter((charge) => String(charge.status ?? "").toLowerCase() !== "rejected")
        .reduce((inner, charge) => inner + (Number(charge.amount ?? 0) || 0), 0)
    );
  }, 0);
  const total = Number(group.total_price ?? 0);

  return {
    participantServicesTotal,
    productsTotal,
    travelFee,
    tipsTotal,
    packageDiscount,
    additionalChargesTotal,
    total,
  };
}

/**
 * When the open detail sheet is ahead of a stale list row (common right after
 * mark_paid + list refresh), do not let list-sync roll payment state back.
 */
export function shouldRejectStaleListPaymentSync(
  selected: GroupPaymentSummarySource,
  fresh: GroupPaymentSummarySource,
): boolean {
  if (groupIsFullyPaid(selected) && !groupIsFullyPaid(fresh)) return true;
  const selectedPaid = Number(selected.amount_paid ?? 0);
  const freshPaid = Number(fresh.amount_paid ?? 0);
  if (selectedPaid > freshPaid + 0.01) return true;
  const selectedBalance = Number(selected.balance_due ?? NaN);
  const freshBalance = Number(fresh.balance_due ?? NaN);
  if (
    Number.isFinite(selectedBalance) &&
    selectedBalance <= 0 &&
    Number.isFinite(freshBalance) &&
    freshBalance > 0.01
  ) {
    return true;
  }
  const selectedStatus = String(selected.payment_status ?? "").toLowerCase();
  const freshStatus = String(fresh.payment_status ?? "").toLowerCase();
  if (selectedStatus === "paid" && freshStatus === "pending") return true;
  if (
    (selectedStatus === "partially_paid" || selectedStatus === "partial") &&
    freshStatus === "pending" &&
    selectedPaid > freshPaid + 0.01
  ) {
    return true;
  }
  return false;
}

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
