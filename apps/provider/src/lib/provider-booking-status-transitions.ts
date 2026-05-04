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
}): string[] {
  const { targets, atHome, arrivalVerified, arrivalOtpPending, qrArrivalPending } = args;
  if (atHome && !arrivalVerified && (arrivalOtpPending || qrArrivalPending)) {
    return targets.filter((t) => t !== "in_progress");
  }
  return [...targets];
}
