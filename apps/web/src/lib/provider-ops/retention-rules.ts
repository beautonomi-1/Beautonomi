/** Booking statuses that count toward first booking, inactivity, and qualifying count. */
export const QUALIFYING_BOOKING_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "in_progress",
  "completed",
  "waiting",
  "checked_in",
] as const;

export type QualifyingBookingStatus = (typeof QUALIFYING_BOOKING_STATUSES)[number];

export const ACTIVATION_SLA_DAYS_7 = 7;
export const ACTIVATION_SLA_DAYS_14 = 14;
export const ACTIVATION_STALLED_DAYS = 30;
export const RAMP_DAYS = 14;
export const COOLING_DAYS = 14;
export const DORMANT_DAYS = 30;
export const DEEP_DORMANT_DAYS = 60;
export const AT_RISK_REFLAG_COOLDOWN_DAYS = 30;
export const AT_RISK_TREND_WINDOW_DAYS = 60;
export const DEFAULT_SNOOZE_DAYS = 7;
export const ACTIVATION_STALLED_SNOOZE_DAYS = 14;
export const DEEP_DORMANT_SNOOZE_DAYS = 30;
export const BROADCAST_TOUCH_SUPPRESS_DAYS = 7;
export const RETURNED_STAGE_DAYS = 7;
export const WINBACK_INVOLUNTARY_DUE_DAYS = 2;
export const WINBACK_VOLUNTARY_DUE_DAYS = 7;
export const WINBACK_SNOOZE_INVOLUNTARY_DAYS = 7;
export const WINBACK_SNOOZE_VOLUNTARY_DAYS = 14;
export const WINBACK_PARK_DAYS = 30;

export const WINBACK_TASK_TITLE = "Win-back";

export type ChurnReason = "cancelled_expired" | "dunning_exhausted" | "chargeback";

export function daysBetween(fromIso: string | null | undefined, toMs = Date.now()): number {
  if (!fromIso) return 9999;
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return 9999;
  return Math.floor((toMs - t) / 86400000);
}

export function addDaysIso(fromMs: number, days: number): string {
  return new Date(fromMs + days * 86400000).toISOString();
}

export function isInvoluntaryChurn(reason: ChurnReason | null | undefined): boolean {
  return reason === "chargeback" || reason === "dunning_exhausted";
}
