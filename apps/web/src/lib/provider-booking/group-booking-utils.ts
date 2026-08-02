import type { GroupBooking, GroupBookingParticipant } from "@/lib/provider-portal/types";

export function normalizeGroupBookingId(id: string): string {
  return id.startsWith("group:") ? id.slice("group:".length) : id;
}

export interface GroupFinancials {
  participantRevenue: number;
  paidParticipants: number;
  participantTips: number;
  participantCollected: number;
  groupProductTotal: number;
  groupProducts: Array<Record<string, unknown>>;
}

export function computeGroupFinancials(
  participants: GroupBookingParticipant[],
  booking: GroupBooking,
): GroupFinancials {
  const participantRevenue = participants.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
  const paidParticipants = participants.filter(
    (p) => (p as { payment_status?: string }).payment_status === "paid",
  ).length;
  const participantTips = participants.reduce(
    (sum, p) => sum + (Number((p as { tip_amount?: number }).tip_amount) || 0),
    0,
  );
  const participantCollected = participants.reduce(
    (sum, p) =>
      sum +
      Math.max(
        0,
        (Number((p as { total_paid?: number }).total_paid) || 0) -
          (Number((p as { total_refunded?: number }).total_refunded) || 0),
      ),
    0,
  );
  const raw = booking as unknown as Record<string, unknown>;
  const groupProducts = Array.isArray(raw.products) ? (raw.products as Array<Record<string, unknown>>) : [];
  const groupProductTotal = groupProducts.reduce((sum, product) => {
    const quantity = Number(product?.quantity ?? 1) || 1;
    const unitPrice = Number(product?.unit_price ?? product?.unitPrice ?? 0) || 0;
    return (
      sum +
      (Number(product?.total_price ?? product?.totalPrice) || unitPrice * quantity)
    );
  }, 0);

  return {
    participantRevenue,
    paidParticipants,
    participantTips,
    participantCollected,
    groupProductTotal,
    groupProducts,
  };
}

export function computeGroupOutstandingBalance(
  participants: GroupBookingParticipant[],
  booking: GroupBooking,
): number {
  if (participants.length === 0) {
    return Math.max(0, Number(booking.total_price) || 0);
  }
  return participants.reduce((sum, p) => {
    const balanceDue = (p as { balance_due?: number }).balance_due;
    if (typeof balanceDue === "number" && Number.isFinite(balanceDue)) {
      return sum + Math.max(0, balanceDue);
    }
    const price = Number(p.price) || 0;
    const paid = Number((p as { total_paid?: number }).total_paid) || 0;
    return sum + Math.max(0, price - paid);
  }, 0);
}
