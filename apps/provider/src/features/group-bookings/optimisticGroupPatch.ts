/** Pure helpers for optimistic group booking detail updates on the provider app. */

export type GroupParticipantPatch = {
  id: string;
  booking_id?: string | null;
  checked_in?: boolean;
  checked_in_time?: string | null;
  checked_in_at?: string | null;
  checked_out?: boolean;
  checked_out_time?: string | null;
  checked_out_at?: string | null;
  payment_status?: string | null;
  balance_due?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  price?: number;
  paid?: boolean;
};

export type GroupBookingPatch = {
  id: string;
  status?: string;
  updated_at?: string;
  participants?: GroupParticipantPatch[];
};

function mapParticipant<T extends GroupParticipantPatch>(
  group: GroupBookingPatch,
  participantId: string,
  patch: Partial<T>
): GroupBookingPatch {
  return {
    ...group,
    participants: (group.participants ?? []).map((p) =>
      p.id === participantId ? { ...p, ...patch } : p
    ),
  };
}

function isParticipantCheckedOut(p: GroupParticipantPatch): boolean {
  return p.checked_out === true || !!p.checked_out_time || !!p.checked_out_at;
}

export function patchParticipantCheckIn(
  group: GroupBookingPatch,
  participantId: string,
  now: string
): GroupBookingPatch {
  const next = mapParticipant(group, participantId, {
    checked_in: true,
    checked_in_time: now,
    checked_in_at: now,
  });
  const status = group.status;
  if (status !== "completed" && status !== "cancelled") {
    next.status = "started";
  }
  next.updated_at = now;
  return next;
}

export function patchParticipantCheckOut(
  group: GroupBookingPatch,
  participantId: string,
  now: string
): GroupBookingPatch {
  const next = mapParticipant(group, participantId, {
    checked_out: true,
    checked_out_time: now,
    checked_out_at: now,
  });
  const allOut = (next.participants ?? []).every(isParticipantCheckedOut);
  if (allOut && next.status !== "cancelled") {
    next.status = "completed";
  }
  next.updated_at = now;
  return next;
}

export function patchGroupMarkPaid(group: GroupBookingPatch, now: string): GroupBookingPatch {
  return {
    ...group,
    updated_at: now,
    participants: (group.participants ?? []).map((p) => {
      if (!p.booking_id) return p;
      const price = Number(p.price ?? 0);
      const alreadyPaid =
        p.payment_status === "paid" ||
        (Number(p.balance_due ?? 0) <= 0 && Number(p.total_paid ?? 0) > 0);
      if (alreadyPaid) return p;
      return {
        ...p,
        payment_status: "paid",
        total_paid: price > 0 ? price : Number(p.total_paid ?? 0),
        balance_due: 0,
        paid: true,
      };
    }),
  };
}

export function patchParticipantRefund(
  group: GroupBookingPatch,
  participantId: string,
  refundAmount: number,
  now: string
): GroupBookingPatch {
  return {
    ...mapParticipant(group, participantId, (() => {
      const p = (group.participants ?? []).find((row) => row.id === participantId);
      if (!p) return {};
      const totalPaid = Number(p.total_paid ?? 0);
      const prevRefunded = Number(p.total_refunded ?? 0);
      const totalRefunded = prevRefunded + refundAmount;
      const netPaid = Math.max(0, totalPaid - totalRefunded);
      const price = Number(p.price ?? 0);
      const balanceDue = Math.max(0, price - netPaid);
      let paymentStatus = p.payment_status ?? "pending";
      if (totalRefunded >= totalPaid - 0.01 && totalPaid > 0) {
        paymentStatus = "refunded";
      } else if (totalRefunded > 0) {
        paymentStatus = "partially_refunded";
      }
      return {
        total_refunded: totalRefunded,
        balance_due: balanceDue,
        payment_status: paymentStatus,
        paid: netPaid > 0 && balanceDue <= 0,
      };
    })()),
    updated_at: now,
  };
}

function participantSnapshotEqual(
  lp: GroupParticipantPatch,
  rp: GroupParticipantPatch
): boolean {
  if (lp.id !== rp.id) return false;
  if (!!lp.checked_in_at !== !!rp.checked_in_at) return false;
  if (!!lp.checked_in_time !== !!rp.checked_in_time) return false;
  if (!!lp.checked_out_at !== !!rp.checked_out_at) return false;
  if (!!lp.checked_out_time !== !!rp.checked_out_time) return false;
  if ((lp.payment_status ?? "") !== (rp.payment_status ?? "")) return false;
  if (Number(lp.total_paid ?? 0) !== Number(rp.total_paid ?? 0)) return false;
  if (Number(lp.total_refunded ?? 0) !== Number(rp.total_refunded ?? 0)) return false;
  if (Number(lp.balance_due ?? 0) !== Number(rp.balance_due ?? 0)) return false;
  return true;
}

export function participantsEqual(
  a: GroupParticipantPatch[] | undefined,
  b: GroupParticipantPatch[] | undefined
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((p) => [p.id, p]));
  for (const lp of left) {
    const rp = rightById.get(lp.id);
    if (!rp || !participantSnapshotEqual(lp, rp)) return false;
  }
  return true;
}
