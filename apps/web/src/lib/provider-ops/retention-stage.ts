import {
  ACTIVATION_SLA_DAYS_7,
  ACTIVATION_SLA_DAYS_14,
  ACTIVATION_STALLED_DAYS,
  ACTIVATION_STALLED_SNOOZE_DAYS,
  COOLING_DAYS,
  DEEP_DORMANT_DAYS,
  DEEP_DORMANT_SNOOZE_DAYS,
  DEFAULT_SNOOZE_DAYS,
  DORMANT_DAYS,
  RAMP_DAYS,
  RETURNED_STAGE_DAYS,
  daysBetween,
} from "@/lib/provider-ops/retention-rules";

export type RetentionStage =
  | "churned"
  | "returned"
  | "activation_ok"
  | "activation_7d"
  | "activation_14d"
  | "activation_stalled"
  | "ramp"
  | "one_and_done"
  | "healthy"
  | "cooling"
  | "dormant"
  | "deep_dormant";

export type RetentionCaseInput = {
  status: string;
  activated_at: string | null;
  first_booking_at: string | null;
  last_qualifying_booking_at: string | null;
  qualifying_booking_count: number | null;
  returned_at: string | null;
  churn_reason?: string | null;
};

export type RetentionStageResult = {
  stage: RetentionStage;
  activation_badge: "ok" | "7d" | "14d" | "stalled" | null;
  inactive_badge: "30d" | "60d" | null;
};

export function retentionStage(
  row: RetentionCaseInput,
  nowMs = Date.now(),
): RetentionStageResult {
  if (row.status === "churned") {
    return { stage: "churned", activation_badge: null, inactive_badge: null };
  }

  if (
    row.status === "activated" &&
    row.returned_at &&
    daysBetween(row.returned_at, nowMs) < RETURNED_STAGE_DAYS
  ) {
    return { stage: "returned", activation_badge: null, inactive_badge: null };
  }

  const count = row.qualifying_booking_count ?? 0;
  const daysSinceActivation = daysBetween(row.activated_at, nowMs);
  const daysSinceLast =
    row.last_qualifying_booking_at != null
      ? daysBetween(row.last_qualifying_booking_at, nowMs)
      : row.first_booking_at != null
        ? daysBetween(row.first_booking_at, nowMs)
        : 9999;

  if (count === 0 || row.first_booking_at == null) {
    if (daysSinceActivation >= ACTIVATION_STALLED_DAYS) {
      return { stage: "activation_stalled", activation_badge: "stalled", inactive_badge: null };
    }
    if (daysSinceActivation >= ACTIVATION_SLA_DAYS_14) {
      return { stage: "activation_14d", activation_badge: "14d", inactive_badge: null };
    }
    if (daysSinceActivation >= ACTIVATION_SLA_DAYS_7) {
      return { stage: "activation_7d", activation_badge: "7d", inactive_badge: null };
    }
    return { stage: "activation_ok", activation_badge: "ok", inactive_badge: null };
  }

  if (count === 1) {
    const daysSinceFirst = daysBetween(row.first_booking_at, nowMs);
    if (daysSinceFirst < RAMP_DAYS) {
      return { stage: "ramp", activation_badge: null, inactive_badge: null };
    }
    return { stage: "one_and_done", activation_badge: null, inactive_badge: null };
  }

  if (daysSinceLast >= DEEP_DORMANT_DAYS) {
    return { stage: "deep_dormant", activation_badge: null, inactive_badge: "60d" };
  }
  if (daysSinceLast >= DORMANT_DAYS) {
    return { stage: "dormant", activation_badge: null, inactive_badge: "30d" };
  }
  if (daysSinceLast >= COOLING_DAYS) {
    return { stage: "cooling", activation_badge: null, inactive_badge: null };
  }

  return { stage: "healthy", activation_badge: null, inactive_badge: null };
}

export type WorkingListPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 99;

/** Lower number = higher priority on working list. 99 = not on working list. */
export function workingListPriority(params: {
  stage: RetentionStage;
  status: string;
  churn_reason: string | null;
  next_follow_up_at: string | null;
  at_risk_flagged_at: string | null;
  at_risk_saved_at?: string | null;
  last_touch_at: string | null;
  winback_step: number;
  nowMs?: number;
}): WorkingListPriority {
  const nowMs = params.nowMs ?? Date.now();
  const now = nowMs;

  if (params.next_follow_up_at) {
    const due = new Date(params.next_follow_up_at).getTime();
    if (!Number.isNaN(due) && due <= now) return 1;
    if (due > now) return 99;
  }

  if (params.status === "churned" && params.winback_step < 2) {
    if (
      params.churn_reason === "chargeback" ||
      params.churn_reason === "dunning_exhausted"
    ) {
      return 2;
    }
    if (params.churn_reason === "cancelled_expired") {
      return 9;
    }
  }

  if (
    params.at_risk_flagged_at &&
    !params.at_risk_saved_at &&
    (!params.last_touch_at ||
      new Date(params.last_touch_at).getTime() <
        new Date(params.at_risk_flagged_at).getTime())
  ) {
    return 3;
  }

  switch (params.stage) {
    case "one_and_done":
      return 4;
    case "activation_14d":
      return 5;
    case "cooling":
      return 6;
    case "activation_7d":
      return 7;
    case "dormant":
      return 8;
    case "deep_dormant":
      if (
        !params.last_touch_at ||
        daysBetween(params.last_touch_at, nowMs) >= DEEP_DORMANT_DAYS
      ) {
        return 10;
      }
      return 99;
    case "activation_stalled":
      if (!params.last_touch_at) return 11;
      return 99;
    default:
      return 99;
  }
}

export function isOnWorkingList(priority: WorkingListPriority): boolean {
  return priority < 99;
}

export function defaultSnoozeDaysForStage(stage: RetentionStage): number {
  if (stage === "activation_stalled") return ACTIVATION_STALLED_SNOOZE_DAYS;
  if (stage === "deep_dormant") return DEEP_DORMANT_SNOOZE_DAYS;
  return DEFAULT_SNOOZE_DAYS;
}
