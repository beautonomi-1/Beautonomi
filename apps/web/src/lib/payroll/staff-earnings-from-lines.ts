import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDayInTimezone } from "./period-bounds";
import { addMoney, roundCurrency, subtractMoney, sumMoney } from "@beautonomi/utils";

export type StaffEarningsSummary = {
  commission: number;
  tips: number;
  adjustments: number;
  total: number;
  /** How `adjustments` splits between commission-type and tip-type lines (pay-run engine). */
  adjustment_breakdown?: { commission: number; tips: number };
  /** Cancellation or no-show fee share. Paid on top of salary, hourly, and commission. */
  cancellationFeeShare?: number;
  /** Service commission reversed for an appointment already reduced in this period's sales. */
  samePeriodServiceClawback?: number;
  /** Stored service commission on visits that included a product or add-on. */
  positiveCommissionOnAdjustedBookings?: number;
  /** Same-period service reversal on those visits. Already inside the recalculated service amount. */
  samePeriodServiceClawbackOnAdjustedBookings?: number;
  /** Saved service commission on each of those visits. */
  positiveCommissionByBooking?: Record<string, number>;
  /** Same-period service reversal on each of those visits. */
  serviceClawbackByBooking?: Record<string, number>;
};

/** My earnings uses the payslip commission. Adjustments stay visible and are not added twice. */
export function liveEarningsFromPayRun(input: {
  commissionAmount: number;
  tipsAmount: number;
  commissionAdjustments: number;
}): StaffEarningsSummary {
  const adjustments = input.commissionAdjustments;
  const commission = subtractMoney(input.commissionAmount, adjustments);
  const tips = input.tipsAmount;
  return {
    commission,
    tips,
    adjustments,
    total: sumMoney(commission, tips, adjustments),
    cancellationFeeShare: 0,
    adjustment_breakdown: { commission: adjustments, tips: 0 },
  };
}

/** The commission line includes a cancellation share so it adds up to the total. */
export function displayStaffEarnings(row: StaffEarningsSummary): StaffEarningsSummary {
  const fee = row.cancellationFeeShare ?? 0;
  if (!fee) return row;
  const commission = addMoney(row.commission, fee);
  return {
    ...row,
    commission,
    cancellationFeeShare: 0,
    total: sumMoney(commission, row.tips, row.adjustments),
  };
}

/** Live earnings use the pay-run commission (service and product split), not the figure stored at payment. */
export function liveEarningsTotals(
  lines: StaffEarningsSummary,
  calculatedCommission?: number | null,
  calculatedTips?: number | null,
): StaffEarningsSummary {
  const tipAdjustments = lines.adjustment_breakdown?.tips ?? 0;
  const useCalculatedTips =
    calculatedTips != null &&
    Number.isFinite(calculatedTips) &&
    lines.tips === 0 &&
    tipAdjustments === 0;
  const commission =
    calculatedCommission != null && Number.isFinite(calculatedCommission)
      ? roundCurrency(calculatedCommission)
      : lines.commission;
  const tips = useCalculatedTips ? roundCurrency(calculatedTips as number) : lines.tips;
  if (
    (calculatedCommission == null || !Number.isFinite(calculatedCommission)) &&
    !useCalculatedTips
  ) {
    return lines;
  }
  return {
    ...lines,
    commission,
    tips,
    total: sumMoney(commission, tips, lines.adjustments, lines.cancellationFeeShare ?? 0),
  };
}

/**
 * Till tips sit on top of appointment tips.
 * When tips are turned off, neither the appointment tip nor a returned tip changes pay.
 */
export function applyTillTips(
  row: StaffEarningsSummary,
  tillTip: number,
  tipsEnabled: boolean,
): StaffEarningsSummary {
  const tipAdjustment = row.adjustment_breakdown?.tips ?? 0;
  if (!tipsEnabled) {
    const adjustments = addMoney(row.adjustments, -tipAdjustment);
    return {
      ...row,
      tips: 0,
      adjustments,
      total: sumMoney(row.commission, adjustments, row.cancellationFeeShare ?? 0),
    };
  }
  if (!tillTip) return row;
  const tips = addMoney(row.tips, tillTip);
  return {
    ...row,
    tips,
    total: sumMoney(row.commission, tips, row.adjustments, row.cancellationFeeShare ?? 0),
  };
}

export type StaffEarningsLineLite = {
  id?: string;
  kind: string;
  amount: number;
  created_at?: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  booking_id?: string | null;
  rate_source?: string | null;
};

/** Pure: bucket lines into commission / tips / adjustments. Reversals and manual adjustments are adjustments. */
export function summarizeStaffEarningsLines(lines: StaffEarningsLineLite[]): StaffEarningsSummary {
  let commission = 0;
  let tips = 0;
  let cancellationFeeShare = 0;
  let adjCommission = 0;
  let adjTips = 0;

  for (const row of lines) {
    const amount = Number(row.amount ?? 0);
    const kind = row.kind;
    if (kind === "cancellation_fee_share") {
      cancellationFeeShare = addMoney(cancellationFeeShare, amount);
    } else if (kind === "commission") {
      // Refund clawbacks post negative lines of the original kind — they are
      // surfaced as adjustments so My earnings can show the reason.
      if (amount < 0) adjCommission = addMoney(adjCommission, amount);
      else commission = addMoney(commission, amount);
    } else if (kind === "tip") {
      if (amount < 0) adjTips = addMoney(adjTips, amount);
      else tips = addMoney(tips, amount);
    } else if (kind === "product_commission") {
      // The pay run adds product commission from the calculator. A positive line
      // is only there so a refund can claw it back. A negative line is that clawback.
      if (amount < 0) adjCommission = addMoney(adjCommission, amount);
    } else if (kind === "reversal") {
      const reversed = String((row.metadata as { reversed_kind?: string } | null)?.reversed_kind ?? "commission");
      if (reversed === "tip") adjTips = addMoney(adjTips, amount);
      else adjCommission = addMoney(adjCommission, amount);
    } else {
      adjCommission = addMoney(adjCommission, amount);
    }
  }

  const adjustments = addMoney(adjCommission, adjTips);
  return {
    commission: roundCurrency(commission),
    tips: roundCurrency(tips),
    adjustments: roundCurrency(adjustments),
    cancellationFeeShare: roundCurrency(cancellationFeeShare),
    total: sumMoney(commission, tips, adjustments, cancellationFeeShare),
    adjustment_breakdown: { commission: roundCurrency(adjCommission), tips: roundCurrency(adjTips) },
  };
}

/**
 * Drop a refund clawback when that refund was already taken off the commission base.
 * A clawback for a different appointment, and a tip clawback, stay.
 */
/** Service commission saved at payment for the appointments in this set. */
export function positiveServiceCommissionForBookings(
  lines: readonly StaffEarningsLineLite[],
  bookingIds: ReadonlySet<string>,
): number {
  let total = 0;
  for (const line of lines) {
    const bookingId = line.booking_id ?? "";
    if (!bookingId || !bookingIds.has(bookingId)) continue;
    if (line.kind !== "commission" || Number(line.amount) <= 0) continue;
    total = addMoney(total, Number(line.amount));
  }
  return total;
}

export function serviceCommissionByBooking(
  lines: readonly StaffEarningsLineLite[],
  bookingIds: ReadonlySet<string>,
  sign: "positive" | "negative",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) {
    const bookingId = line.booking_id ?? "";
    if (!bookingId || !bookingIds.has(bookingId) || line.kind !== "commission") continue;
    const amount = Number(line.amount);
    if (sign === "positive" ? amount <= 0 : amount >= 0) continue;
    out[bookingId] = addMoney(out[bookingId] ?? 0, amount);
  }
  return out;
}

export function samePeriodServiceClawback(
  lines: StaffEarningsLineLite[],
  bookingIds: ReadonlySet<string>,
): number {
  let total = 0;
  for (const line of lines) {
    const bookingId = line.booking_id ?? "";
    if (!bookingId || !bookingIds.has(bookingId)) continue;
    if (Number(line.amount) >= 0 || line.kind !== "commission") continue;
    total = addMoney(total, Number(line.amount));
  }
  return total;
}

export function withoutCommissionRefundClawbacks(
  lines: StaffEarningsLineLite[],
  bookingIds: ReadonlySet<string>,
  options?: { keepServiceClawbacks?: boolean },
): StaffEarningsLineLite[] {
  if (bookingIds.size === 0) return lines;
  return lines.filter((line) => {
    const bookingId = line.booking_id ?? "";
    if (!bookingId || !bookingIds.has(bookingId)) return true;
    if (Number(line.amount) >= 0) return true;
    if (options?.keepServiceClawbacks && line.kind === "commission") return true;
    return line.kind !== "commission" && line.kind !== "product_commission";
  });
}

export async function sumStaffEarningsLines(
  supabase: SupabaseClient,
  staffId: string,
  fromDate: Date,
  toDate: Date,
  options?: {
    omitCommissionClawbackBookingIds?: readonly string[];
    keepServiceClawbacks?: boolean;
    adjustedBookingIds?: readonly string[];
  },
): Promise<StaffEarningsSummary> {
  const { data, error } = await supabase
    .from("staff_earnings_lines")
    .select("kind, amount, metadata, booking_id")
    .eq("staff_id", staffId)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  if (error) throw error;
  const raw = (data ?? []) as StaffEarningsLineLite[];
  const nettedBookings = new Set(options?.omitCommissionClawbackBookingIds ?? []);
  const lines = withoutCommissionRefundClawbacks(raw, nettedBookings, {
    keepServiceClawbacks: options?.keepServiceClawbacks,
  });
  const adjustedBookings = new Set(options?.adjustedBookingIds ?? []);
  const summary: StaffEarningsSummary = {
    ...summarizeStaffEarningsLines(lines),
    samePeriodServiceClawback: samePeriodServiceClawback(raw, nettedBookings),
  };
  if (adjustedBookings.size > 0) {
    const nettedAdjusted = new Set([...nettedBookings].filter((id) => adjustedBookings.has(id)));
    summary.positiveCommissionOnAdjustedBookings = positiveServiceCommissionForBookings(
      raw,
      adjustedBookings,
    );
    summary.samePeriodServiceClawbackOnAdjustedBookings = samePeriodServiceClawback(raw, nettedAdjusted);
    summary.positiveCommissionByBooking = serviceCommissionByBooking(raw, adjustedBookings, "positive");
    summary.serviceClawbackByBooking = serviceCommissionByBooking(raw, nettedAdjusted, "negative");
  }
  return summary;
}

export type PayRunPeriod = {
  id: string;
  status: string; // draft | approved | paid
  pay_period_start: string; // YYYY-MM-DD
  pay_period_end: string; // YYYY-MM-DD
};

export type LineSettlementState = "pending" | "approved" | "paid";

/** Pure: a line is settled by the pay run whose period contains its created_at date. */
export function classifyLineSettlement(
  line: Pick<StaffEarningsLineLite, "created_at">,
  payRuns: PayRunPeriod[],
  timezone?: string | null,
): LineSettlementState {
  if (!line.created_at) return "pending";
  const day = timezone
    ? calendarDayInTimezone(line.created_at, timezone)
    : line.created_at.slice(0, 10);
  let state: LineSettlementState = "pending";
  for (const pr of payRuns) {
    if (day >= pr.pay_period_start && day <= pr.pay_period_end) {
      if (pr.status === "paid") return "paid";
      if (pr.status === "approved") state = "approved";
    }
  }
  return state;
}

export function splitStaffEarningsLinesBySettlement(
  lines: StaffEarningsLineLite[],
  payRuns: PayRunPeriod[],
  timezone?: string | null,
): Record<LineSettlementState, StaffEarningsSummary> {
  const buckets: Record<LineSettlementState, StaffEarningsLineLite[]> = { pending: [], approved: [], paid: [] };
  for (const line of lines) {
    buckets[classifyLineSettlement(line, payRuns, timezone)].push(line);
  }
  return {
    pending: summarizeStaffEarningsLines(buckets.pending),
    approved: summarizeStaffEarningsLines(buckets.approved),
    paid: summarizeStaffEarningsLines(buckets.paid),
  };
}

/** Pure: human-readable reason for an adjustment line (kind/metadata → copy). */
export function describeEarningsAdjustment(line: StaffEarningsLineLite): string {
  if (line.reason) return line.reason;
  const meta = line.metadata ?? {};
  if (line.kind === "reversal") {
    return meta.reassigned_to_staff_id ? "Reassigned to another team member" : "Reversed";
  }
  if (line.kind === "adjustment") return "Manual adjustment";
  if (Number(line.amount) < 0) {
    if (line.kind === "tip") return "Refund clawback (tip)";
    return "Refund clawback";
  }
  if (line.rate_source === "reassign") return "Reassigned from another team member";
  if (line.kind === "cancellation_fee_share") return "Cancellation / no-show fee share";
  return "Adjustment";
}

export function isAdjustmentLine(line: StaffEarningsLineLite): boolean {
  return line.kind === "reversal" || line.kind === "adjustment" || Number(line.amount) < 0 || line.rate_source === "reassign";
}
