/**
 * Mirrors `apps/web/src/lib/bookings/booking-status-transitions.ts` so the
 * native app exposes the same legal PATCH transitions as the provider API.
 */

export const PROVIDER_BOOKING_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["confirmed", "checked_in", "cancelled"],
  pending_payment: ["cancelled"],
  /** Salon check-in: `checked_in` is physical arrival (waiting room); `in_progress` is chair time. */
  confirmed: ["checked_in", "in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
  waiting: ["checked_in", "in_progress", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
};

/**
 * Statuses that only make semantic sense for in-salon bookings. `checked_in` is
 * the salon waiting-room state; `waiting` is the chair-side queue. House-call
 * bookings progress via `current_stage` (`provider_on_way` → `provider_arrived`)
 * and should NEVER be moved into either of these statuses — doing so dead-ends
 * the journey flow because the journey buttons require `confirmed`.
 */
const SALON_ONLY_STATUSES: ReadonlySet<string> = new Set(["checked_in", "waiting"]);

export function isSalonOnlyBookingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return SALON_ONLY_STATUSES.has(status);
}

const LABELS: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
  waiting: "Waiting",
  checked_in: "Checked in",
};

/** Legal next DB statuses from `bookings.status` for PATCH (same as web). */
export function getAllowedTransitionTargets(currentDb: string): string[] {
  const row = PROVIDER_BOOKING_STATUS_TRANSITIONS[currentDb];
  if (!row?.length) return [];
  return [...row].filter((t) => t !== currentDb);
}

/**
 * Maps a target DB status to the `status` field sent to PATCH /api/provider/bookings/[id]
 * (provider-portal vocabulary expected by `mapStatusFromProvider` on the server).
 */
export function dbTargetToPatchStatusField(dbTarget: string): string {
  const m: Record<string, string> = {
    pending: "pending",
    pending_payment: "pending",
    confirmed: "booked",
    in_progress: "started",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
    waiting: "waiting",
    checked_in: "checked_in",
  };
  return m[dbTarget] ?? dbTarget;
}

export function labelForDbStatus(db: string): string {
  return LABELS[db] ?? db.replace(/_/g, " ");
}

/** Local optimistic overlay fields after the user triggers a transition (before refresh completes). */
export function optimisticBookingFieldsForDbTarget(dbTarget: string): { db_status: string; status: string } {
  return {
    db_status: dbTarget,
    status: dbTargetToPatchStatusField(dbTarget),
  };
}

/**
 * At-home bookings may require arrival verification before starting service.
 * Remove `in_progress` from the generic status picker when OTP/QR is still pending.
 */
export function filterInProgressWhenAtHomeVerificationPending(args: {
  targets: readonly string[];
  atHome: boolean;
  arrivalVerified: boolean;
  arrivalOtpPending: boolean;
  qrArrivalPending: boolean;
  currentStage?: string | null;
}): string[] {
  const { targets, atHome, arrivalVerified, arrivalOtpPending, qrArrivalPending, currentStage } = args;
  if (atHome) {
    const needsVerification = !arrivalVerified && (arrivalOtpPending || qrArrivalPending);
    if (needsVerification || currentStage !== "provider_arrived") {
      return targets.filter((t) => t !== "in_progress");
    }
  }
  return [...targets];
}

/**
 * Filter raw transition targets to those that make sense for the booking's
 * location type. Single source of truth for the status picker UI.
 *
 * - **At-home**: hides salon-only states (`checked_in`, `waiting`) so the
 *   provider cannot accidentally short-circuit the house-call journey
 *   (`Start journey` → `Mark arrived` → verify → `Start service`). Keeps the
 *   existing `in_progress` verification gate.
 * - **At-home recovery**: if a legacy at-home booking is already stuck in a
 *   salon-only status, expose `confirmed` as a recovery target so the provider
 *   can reset and start the proper journey.
 * - **At-salon**: full transition graph (no house-call states are present in
 *   the table, so no filtering is required).
 */
export function filterStatusTargetsForBookingType(args: {
  targets: readonly string[];
  atHome: boolean;
  arrivalVerified: boolean;
  arrivalOtpPending: boolean;
  qrArrivalPending: boolean;
  currentStage?: string | null;
  currentDbStatus?: string | null;
}): string[] {
  const baseFiltered = filterInProgressWhenAtHomeVerificationPending(args);
  if (!args.atHome) return baseFiltered;

  let result = baseFiltered.filter((t) => !SALON_ONLY_STATUSES.has(t));

  if (
    args.currentDbStatus &&
    SALON_ONLY_STATUSES.has(args.currentDbStatus) &&
    !result.includes("confirmed")
  ) {
    result = ["confirmed", ...result];
  }
  return result;
}
