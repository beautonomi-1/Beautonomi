import type { SupabaseClient } from "@supabase/supabase-js";
import { findOpenTerminalPayments } from "@/lib/payments/open-terminal-payments";
import { computeWalletGiftCoverageOutstanding } from "@/lib/bookings/provider-booking-finance";
import { sumPendingWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";

export type CompletionBlockerCode =
  | "TERMINAL_IN_FLIGHT"
  | "FULLY_REFUNDED"
  | "BALANCE_DUE";

export type CompletionEvaluation = {
  allowed: boolean;
  blockers: Array<{ code: CompletionBlockerCode; message: string; amount?: number }>;
  balanceDue: number;
};

export type ChildBookingRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  additional_charges?: Array<{ amount?: number | null; status?: string | null }> | null;
};

const CHILD_SELECT =
  "id, status, payment_status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, additional_charges(amount, status)";

/** Pure decision used by group completion; exported for tests. */
export function decideCompletionBlockers(input: {
  children: ChildBookingRow[];
  openTerminalCount: number;
  openTerminalAmount?: number;
  pendingWalletGiftByChild?: Map<string, number>;
  allowUnpaid?: boolean;
}): CompletionEvaluation {
  const blockers: CompletionEvaluation["blockers"] = [];

  if (input.openTerminalCount > 0) {
    blockers.push({
      code: "TERMINAL_IN_FLIGHT",
      message: "A card machine charge is still open for this group.",
      amount: input.openTerminalAmount,
    });
  }

  const active = input.children.filter((c) => {
    const st = String(c.status ?? "").toLowerCase();
    return st !== "cancelled" && st !== "no_show";
  });

  const totalRefunded = active.reduce((s, b) => s + Number(b.total_refunded ?? 0), 0);
  const netKept = active.reduce(
    (s, b) => s + Math.max(0, Number(b.total_paid ?? 0) - Number(b.total_refunded ?? 0)),
    0,
  );
  const everyChildRefunded =
    active.length > 0 &&
    active.every((b) => {
      const pay = String(b.payment_status ?? "").toLowerCase();
      const refunded = Number(b.total_refunded ?? 0);
      const paid = Number(b.total_paid ?? 0);
      return pay === "refunded" || (refunded > 0.01 && refunded + 0.01 >= paid);
    });
  if (totalRefunded > 0.01 && netKept <= 0.01 && everyChildRefunded) {
    blockers.push({
      code: "FULLY_REFUNDED",
      message: "Every participant was refunded. Cancel the group instead of completing it.",
    });
  }

  let balanceDue = 0;
  for (const b of active) {
    if (!childBookingEligibleForCompletionComplete(b)) continue;
    const unpaidAdditionalCharges = (b.additional_charges ?? [])
      .filter((c) => c?.status !== "paid" && c?.status !== "rejected")
      .reduce((s, c) => s + Number(c?.amount ?? 0), 0);
    balanceDue += computeWalletGiftCoverageOutstanding({
      totalAmount: Number(b.total_amount ?? 0),
      totalPaid: Number(b.total_paid ?? 0),
      totalRefunded: Number(b.total_refunded ?? 0),
      walletAmount: Number(b.wallet_amount ?? 0),
      giftCardAmount: Number(b.gift_card_amount ?? 0),
      unpaidAdditionalCharges,
      pendingWalletGiftAmount: input.pendingWalletGiftByChild?.get(b.id) ?? 0,
    });
  }
  balanceDue = Math.round(balanceDue * 100) / 100;

  if (balanceDue > 0.01 && !input.allowUnpaid) {
    blockers.push({
      code: "BALANCE_DUE",
      message: "Outstanding balance must be paid before completing.",
      amount: balanceDue,
    });
  }

  return { allowed: blockers.length === 0, blockers, balanceDue };
}

export async function evaluateGroupCompletion(
  admin: SupabaseClient,
  params: {
    providerId: string;
    groupId: string;
    allowUnpaid?: boolean;
  },
): Promise<CompletionEvaluation> {
  const { data: children, error } = await admin
    .from("bookings")
    .select(CHILD_SELECT)
    .eq("group_booking_id", params.groupId)
    .eq("provider_id", params.providerId);
  if (error) throw error;

  const childRows = (children ?? []) as ChildBookingRow[];
  const open = await findOpenTerminalPayments(admin, {
    providerId: params.providerId,
    groupBookingId: params.groupId,
    bookingIds: childRows.map((c) => c.id),
  });

  const pendingWalletGiftByChild = new Map<string, number>();
  for (const c of childRows) {
    pendingWalletGiftByChild.set(c.id, await sumPendingWalletGiftBookingPayments(admin, c.id));
  }

  return decideCompletionBlockers({
    children: childRows,
    openTerminalCount: open.length,
    openTerminalAmount: open[0]?.amount,
    pendingWalletGiftByChild,
    allowUnpaid: params.allowUnpaid,
  });
}

/**
 * Single-booking completion guard shared by complete-service, PATCH status=completed and bulk.
 * FULLY_REFUNDED → TERMINAL_IN_FLIGHT → BALANCE_DUE (overridable with allowUnpaid).
 */
export async function evaluateSingleBookingCompletion(
  admin: SupabaseClient,
  params: {
    providerId: string;
    booking: ChildBookingRow & { group_booking_id?: string | null };
    allowUnpaid?: boolean;
  },
): Promise<CompletionEvaluation> {
  const blockers: CompletionEvaluation["blockers"] = [];
  const b = params.booking;

  if (String(b.payment_status ?? "").toLowerCase() === "refunded") {
    blockers.push({
      code: "FULLY_REFUNDED",
      message: "This booking was fully refunded. Cancel the booking instead of marking it completed.",
    });
    return { allowed: false, blockers, balanceDue: 0 };
  }

  const open = await findOpenTerminalPayments(admin, {
    providerId: params.providerId,
    bookingIds: [b.id],
    groupBookingId: b.group_booking_id ?? null,
  });
  if (open.length > 0) {
    blockers.push({
      code: "TERMINAL_IN_FLIGHT",
      message: "A card machine charge is still open for this booking.",
      amount: open[0]?.amount,
    });
    return { allowed: false, blockers, balanceDue: 0 };
  }

  let charges = b.additional_charges;
  if (!charges) {
    const { data } = await admin.from("additional_charges").select("amount, status").eq("booking_id", b.id);
    charges = (data ?? []) as ChildBookingRow["additional_charges"];
  }
  const unpaidAdditionalCharges = (charges ?? [])
    .filter((c) => c?.status !== "paid" && c?.status !== "rejected")
    .reduce((s, c) => s + Number(c?.amount ?? 0), 0);
  const balanceDue =
    Math.round(
      computeWalletGiftCoverageOutstanding({
        totalAmount: Number(b.total_amount ?? 0),
        totalPaid: Number(b.total_paid ?? 0),
        totalRefunded: Number(b.total_refunded ?? 0),
        walletAmount: Number(b.wallet_amount ?? 0),
        giftCardAmount: Number(b.gift_card_amount ?? 0),
        unpaidAdditionalCharges,
        pendingWalletGiftAmount: await sumPendingWalletGiftBookingPayments(admin, b.id),
      }) * 100,
    ) / 100;

  if (balanceDue > 0.01 && !params.allowUnpaid) {
    blockers.push({
      code: "BALANCE_DUE",
      message: "Outstanding balance must be paid before completing.",
      amount: balanceDue,
    });
  }
  return { allowed: blockers.length === 0, blockers, balanceDue };
}

export function childBookingEligibleForCompletionComplete(child: ChildBookingRow): boolean {
  const st = String(child.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "no_show" || st === "refunded") return false;
  const pay = String(child.payment_status ?? "").toLowerCase();
  if (pay === "refunded") return false;
  return true;
}
