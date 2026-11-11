import type { GroupBooking, GroupBookingParticipant } from "@/lib/provider-portal/types";
import { addMoney, LAST_RESORT_CURRENCY, multiplyMoney, subtractMoney } from "@beautonomi/utils";

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
  const participantRevenue = participants.reduce((sum, p) => addMoney(sum, Number(p.price) || 0), 0);
  const paidParticipants = participants.filter(
    (p) => (p as { payment_status?: string }).payment_status === "paid",
  ).length;
  const participantTips = participants.reduce(
    (sum, p) => addMoney(sum, Number((p as { tip_amount?: number }).tip_amount) || 0),
    0,
  );
  const participantCollected = participants.reduce(
    (sum, p) =>
      addMoney(
        sum,
        Math.max(
          0,
          subtractMoney(
            Number((p as { total_paid?: number }).total_paid) || 0,
            Number((p as { total_refunded?: number }).total_refunded) || 0,
          ),
        ),
      ),
    0,
  );
  const raw = booking as unknown as Record<string, unknown>;
  const groupProducts = Array.isArray(raw.products) ? (raw.products as Array<Record<string, unknown>>) : [];
  const groupProductTotal = groupProducts.reduce((sum, product) => {
    const quantity = Number(product?.quantity ?? 1) || 1;
    const unitPrice = Number(product?.unit_price ?? product?.unitPrice ?? 0) || 0;
    return addMoney(
      sum,
      Number(product?.total_price ?? product?.totalPrice) || multiplyMoney(unitPrice, quantity),
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
      return addMoney(sum, Math.max(0, balanceDue), LAST_RESORT_CURRENCY);
    }
    const price = Number(p.price) || 0;
    const paid = Number((p as { total_paid?: number }).total_paid) || 0;
    return addMoney(sum, Math.max(0, subtractMoney(price, paid, LAST_RESORT_CURRENCY)), LAST_RESORT_CURRENCY);
  }, 0);
}

/** Amount a guest still owes on their own split share (0 when there is no share). */
export function participantShareOwed(p: {
  share_amount_due?: number | null;
  share_amount_paid?: number | null;
}): number {
  if (p.share_amount_due == null) return 0;
  return Math.max(
    0,
    subtractMoney(Number(p.share_amount_due), Number(p.share_amount_paid ?? 0), LAST_RESORT_CURRENCY),
  );
}

/** Mirrors resendGroupGuestInvite: any open split share with money still owed. */
export function canResendGuestPayLink(p: {
  is_primary_contact?: boolean;
  share_amount_due?: number | null;
  share_amount_paid?: number | null;
  share_status?: string | null;
}): boolean {
  if (p.is_primary_contact || p.share_amount_due == null) return false;
  const status = String(p.share_status ?? "").toLowerCase();
  if (status === "paid" || status === "cancelled" || status === "waived") return false;
  return participantShareOwed(p) > 0.005;
}
