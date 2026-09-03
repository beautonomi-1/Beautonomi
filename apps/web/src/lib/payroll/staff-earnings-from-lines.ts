import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffEarningsSummary = {
  commission: number;
  tips: number;
  adjustments: number;
  total: number;
  /** How `adjustments` splits between commission-type and tip-type lines (pay-run engine). */
  adjustment_breakdown?: { commission: number; tips: number };
};

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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: bucket lines into commission / tips / adjustments. Reversals and manual adjustments are adjustments. */
export function summarizeStaffEarningsLines(lines: StaffEarningsLineLite[]): StaffEarningsSummary {
  let commission = 0;
  let tips = 0;
  let adjCommission = 0;
  let adjTips = 0;

  for (const row of lines) {
    const amount = Number(row.amount ?? 0);
    const kind = row.kind;
    if (kind === "commission" || kind === "cancellation_fee_share") {
      // Refund clawbacks post negative lines of the original kind — they are
      // surfaced as adjustments so My earnings can show the reason.
      if (amount < 0) adjCommission += amount;
      else commission += amount;
    } else if (kind === "tip") {
      if (amount < 0) adjTips += amount;
      else tips += amount;
    } else if (kind === "reversal") {
      const reversed = String((row.metadata as { reversed_kind?: string } | null)?.reversed_kind ?? "commission");
      if (reversed === "tip") adjTips += amount;
      else adjCommission += amount;
    } else {
      adjCommission += amount;
    }
  }

  const adjustments = adjCommission + adjTips;
  return {
    commission: round2(commission),
    tips: round2(tips),
    adjustments: round2(adjustments),
    total: round2(commission + tips + adjustments),
    adjustment_breakdown: { commission: round2(adjCommission), tips: round2(adjTips) },
  };
}

export async function sumStaffEarningsLines(
  supabase: SupabaseClient,
  staffId: string,
  fromDate: Date,
  toDate: Date,
): Promise<StaffEarningsSummary> {
  const { data, error } = await supabase
    .from("staff_earnings_lines")
    .select("kind, amount, metadata")
    .eq("staff_id", staffId)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", toDate.toISOString());

  if (error) throw error;
  return summarizeStaffEarningsLines((data ?? []) as StaffEarningsLineLite[]);
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
): LineSettlementState {
  if (!line.created_at) return "pending";
  const day = line.created_at.slice(0, 10);
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
): Record<LineSettlementState, StaffEarningsSummary> {
  const buckets: Record<LineSettlementState, StaffEarningsLineLite[]> = { pending: [], approved: [], paid: [] };
  for (const line of lines) {
    buckets[classifyLineSettlement(line, payRuns)].push(line);
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
