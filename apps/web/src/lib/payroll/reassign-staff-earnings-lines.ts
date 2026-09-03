import type { SupabaseClient } from "@supabase/supabase-js";

export type EarningsLineRow = {
  id: string;
  booking_id: string | null;
  booking_service_id: string | null;
  staff_id: string;
  provider_id: string;
  tenant_id: string | null;
  source_finance_transaction_id: string;
  kind: string;
  base_amount: number;
  rate: number;
  amount: number;
  rate_source: string;
};

export type ReassignEarningsResult = {
  reversed: number;
  created: number;
  skipped: number;
  netMoved: number;
};

export type ReassignEarningsParams = {
  providerId: string;
  bookingId: string;
  /** Limit to one line item; omit to move every line on the booking. */
  bookingServiceId?: string | null;
  fromStaffId: string;
  toStaffId: string;
  actorUserId?: string | null;
  reason?: string | null;
};

/**
 * Pure planner (unit-tested): given the old staff's positive lines for the
 * booking, produce the reversal rows (kind = 'reversal', negative amount, same
 * source FT) and the new staff's rows (same kind/rate/amount, rate_source =
 * 'reassign'). Lines already reversed (net <= 0 for that FT/kind) are skipped.
 */
export function planEarningsReassignment(
  lines: EarningsLineRow[],
  params: Pick<ReassignEarningsParams, "fromStaffId" | "toStaffId" | "actorUserId" | "reason" | "bookingServiceId">,
): { reversals: Record<string, unknown>[]; newLines: Record<string, unknown>[]; skipped: number } {
  const reversals: Record<string, unknown>[] = [];
  const newLines: Record<string, unknown>[] = [];
  let skipped = 0;

  // Net per (ft, kind) for the old staff — only move what is still outstanding.
  const netByKey = new Map<string, { net: number; sample: EarningsLineRow; base: number }>();
  for (const l of lines) {
    if (l.staff_id !== params.fromStaffId) continue;
    if (params.bookingServiceId && l.booking_service_id && l.booking_service_id !== params.bookingServiceId) continue;
    const key = `${l.source_finance_transaction_id}:${l.kind === "reversal" ? String((l as any).metadata?.reversed_kind ?? "commission") : l.kind}`;
    const cur = netByKey.get(key) ?? { net: 0, sample: l, base: 0 };
    cur.net += Number(l.amount ?? 0);
    if (l.kind !== "reversal") {
      cur.sample = l;
      cur.base += Number(l.base_amount ?? 0);
    }
    netByKey.set(key, cur);
  }

  for (const [, entry] of netByKey) {
    const amount = Math.round(entry.net * 100) / 100;
    if (amount <= 0) {
      skipped++;
      continue;
    }
    const s = entry.sample;
    const reason = params.reason ?? "Reassigned to another team member";
    reversals.push({
      booking_id: s.booking_id,
      booking_service_id: s.booking_service_id,
      staff_id: params.fromStaffId,
      provider_id: s.provider_id,
      tenant_id: s.tenant_id,
      source_finance_transaction_id: s.source_finance_transaction_id,
      kind: "reversal",
      base_amount: 0,
      rate: s.rate,
      amount: -amount,
      rate_source: "reassign",
      reason,
      created_by: params.actorUserId ?? null,
      metadata: {
        reversed_kind: s.kind,
        reassigned_to_staff_id: params.toStaffId,
      },
    });
    newLines.push({
      booking_id: s.booking_id,
      booking_service_id: s.booking_service_id,
      staff_id: params.toStaffId,
      provider_id: s.provider_id,
      tenant_id: s.tenant_id,
      source_finance_transaction_id: s.source_finance_transaction_id,
      kind: s.kind,
      base_amount: entry.base,
      rate: s.rate,
      amount,
      rate_source: "reassign",
      reason: "Reassigned from another team member",
      created_by: params.actorUserId ?? null,
      metadata: {
        reassigned_from_staff_id: params.fromStaffId,
      },
    });
  }

  return { reversals, newLines, skipped };
}

/**
 * Reassignment after payment: post reversal + new lines (audit trail) instead
 * of rewriting history. Idempotent via UNIQUE(source_finance_transaction_id,
 * staff_id, kind) — re-running produces no duplicate rows.
 */
export async function reassignStaffEarningsLines(
  admin: SupabaseClient,
  params: ReassignEarningsParams,
): Promise<ReassignEarningsResult> {
  if (params.fromStaffId === params.toStaffId) {
    return { reversed: 0, created: 0, skipped: 0, netMoved: 0 };
  }

  let query = admin
    .from("staff_earnings_lines")
    .select(
      "id, booking_id, booking_service_id, staff_id, provider_id, tenant_id, source_finance_transaction_id, kind, base_amount, rate, amount, rate_source, metadata",
    )
    .eq("provider_id", params.providerId)
    .eq("booking_id", params.bookingId)
    .eq("staff_id", params.fromStaffId);
  if (params.bookingServiceId) {
    query = query.or(`booking_service_id.eq.${params.bookingServiceId},booking_service_id.is.null`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const plan = planEarningsReassignment((data ?? []) as EarningsLineRow[], params);
  if (plan.reversals.length === 0) {
    return { reversed: 0, created: 0, skipped: plan.skipped, netMoved: 0 };
  }

  const { data: revRows, error: revErr } = await admin
    .from("staff_earnings_lines")
    .upsert(plan.reversals, {
      onConflict: "source_finance_transaction_id,staff_id,kind",
      ignoreDuplicates: true,
    })
    .select("id");
  if (revErr) throw revErr;

  const { data: newRows, error: newErr } = await admin
    .from("staff_earnings_lines")
    .upsert(plan.newLines, {
      onConflict: "source_finance_transaction_id,staff_id,kind",
      ignoreDuplicates: true,
    })
    .select("id");
  if (newErr) throw newErr;

  const netMoved = plan.newLines.reduce((s, l) => s + Number((l as { amount: number }).amount), 0);
  return {
    reversed: (revRows ?? []).length,
    created: (newRows ?? []).length,
    skipped: plan.skipped,
    netMoved: Math.round(netMoved * 100) / 100,
  };
}
