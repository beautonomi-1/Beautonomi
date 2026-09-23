import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween } from "@/lib/provider-ops/retention-rules";
import {
  isOnWorkingList,
  retentionStage,
  workingListPriority,
  type RetentionStage,
} from "@/lib/provider-ops/retention-stage";

export type EnrichedRetentionCase = Record<string, unknown> & {
  stage: RetentionStage;
  activation_badge: string | null;
  inactive_badge: string | null;
  days_since_activation: number | null;
  days_since_last_booking: number | null;
  last_touch_at: string | null;
  working_priority: number;
  on_working_list: boolean;
  weekly_bookings_falling?: boolean;
  providers?: {
    id: string;
    business_name: string | null;
    status: string | null;
    user_id?: string | null;
  } | null;
};

export async function fetchLastTouchByCaseIds(
  supabase: SupabaseClient,
  caseIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (caseIds.length === 0) return map;
  const { data } = await supabase
    .from("provider_ops_case_touches")
    .select("case_id, created_at")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
  for (const row of data ?? []) {
    const cid = row.case_id as string;
    if (!map.has(cid)) map.set(cid, row.created_at as string);
  }
  return map;
}

export function enrichRetentionCaseRow(
  row: Record<string, unknown>,
  lastTouchAt: string | null,
  nowMs = Date.now(),
): EnrichedRetentionCase {
  const { stage, activation_badge, inactive_badge } = retentionStage(
    {
      status: String(row.status ?? ""),
      activated_at: (row.activated_at as string | null) ?? null,
      first_booking_at: (row.first_booking_at as string | null) ?? null,
      last_qualifying_booking_at: (row.last_qualifying_booking_at as string | null) ?? null,
      qualifying_booking_count: (row.qualifying_booking_count as number | null) ?? 0,
      returned_at: (row.returned_at as string | null) ?? null,
      churn_reason: (row.churn_reason as string | null) ?? null,
    },
    nowMs,
  );

  const priority = workingListPriority({
    stage,
    status: String(row.status ?? ""),
    churn_reason: (row.churn_reason as string | null) ?? null,
    next_follow_up_at: (row.next_follow_up_at as string | null) ?? null,
    at_risk_flagged_at: (row.at_risk_flagged_at as string | null) ?? null,
    at_risk_saved_at: (row.at_risk_saved_at as string | null) ?? null,
    last_touch_at: lastTouchAt,
    winback_step: Number(row.winback_step ?? 0),
    nowMs,
  });

  return {
    ...row,
    stage,
    activation_badge,
    inactive_badge,
    days_since_activation: row.activated_at
      ? daysBetween(row.activated_at as string, nowMs)
      : null,
    days_since_last_booking:
      row.last_qualifying_booking_at != null
        ? daysBetween(row.last_qualifying_booking_at as string, nowMs)
        : row.first_booking_at != null
          ? daysBetween(row.first_booking_at as string, nowMs)
          : null,
    last_touch_at: lastTouchAt,
    working_priority: priority,
    on_working_list: isOnWorkingList(priority),
  };
}

export function filterByTab(
  enriched: EnrichedRetentionCase,
  tab: string,
): boolean {
  if (tab === "no_booking") {
    return (
      enriched.status === "activated" &&
      (enriched.first_booking_at as string | null) == null
    );
  }
  if (tab === "one_and_done") return enriched.stage === "one_and_done";
  if (tab === "inactive") {
    return (
      enriched.stage === "cooling" ||
      enriched.stage === "dormant" ||
      enriched.stage === "deep_dormant"
    );
  }
  return true;
}

/** Lower = higher on the working list. Falling weekly frequency ranks before logo-churn winback (9). */
export function workingListSortKey(c: EnrichedRetentionCase): number {
  const p = c.working_priority as number;
  if (p < 99) return p;
  if (
    c.weekly_bookings_falling &&
    String(c.status) === "activated" &&
    Number(c.qualifying_booking_count ?? 0) > 0
  ) {
    return 8.5;
  }
  return 99;
}

export function isOnWorkingListExtended(c: EnrichedRetentionCase): boolean {
  if (c.on_working_list) return true;
  return (
    Boolean(c.weekly_bookings_falling) &&
    String(c.status) === "activated" &&
    Number(c.qualifying_booking_count ?? 0) > 0
  );
}

export function sortWorkingList(a: EnrichedRetentionCase, b: EnrichedRetentionCase): number {
  const ka = workingListSortKey(a);
  const kb = workingListSortKey(b);
  if (ka !== kb) return ka - kb;
  const da = a.days_since_last_booking ?? 0;
  const db = b.days_since_last_booking ?? 0;
  return db - da;
}
