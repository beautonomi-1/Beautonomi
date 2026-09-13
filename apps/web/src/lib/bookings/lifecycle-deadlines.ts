import type { BookingStatus } from "@/lib/utils/booking-status";
import {
  DEFAULT_CONFIRMATION_SLA_HOURS,
  DEFAULT_UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT,
  MIN_CONFIRM_WINDOW_MS,
  addBusinessMinutes,
  computePendingExpireAt as computePendingExpireAtCore,
  resolvePendingExpireDecision as resolvePendingExpireDecisionCore,
  resolveWorkingHoursDay,
  type LifecycleProviderSettings,
  type PendingExpireBound,
  type PendingExpireDecision,
  type PendingExpireInput,
  type WorkingHoursDay,
  type WorkingHoursJson,
} from "@beautonomi/utils";

export {
  MIN_CONFIRM_WINDOW_MS,
  DEFAULT_CONFIRMATION_SLA_HOURS,
  DEFAULT_UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT,
  addBusinessMinutes,
  resolveWorkingHoursDay,
  type WorkingHoursDay,
  type WorkingHoursJson,
  type LifecycleProviderSettings,
  type PendingExpireInput,
  type PendingExpireBound,
  type PendingExpireDecision,
};

/** Grace after service end before close-out queue (salon). */
export const DEFAULT_CLOSEOUT_GRACE_MINUTES_SALON = 20;

/** Grace after service end before close-out queue (at-home). */
export const DEFAULT_CLOSEOUT_GRACE_MINUTES_AT_HOME = 30;

export type BookingEndInput = {
  scheduledAt: Date | string;
  scheduledEndAt?: Date | string | null;
  durationMinutes?: number | null;
};

export type CloseOutInput = {
  endAt: Date;
  locationType?: string | null;
  settings?: LifecycleProviderSettings;
};

export type CloseOutStateInput = {
  now?: Date;
  scheduledAt: Date | string;
  endAt: Date;
  graceMinutes: number;
  status: BookingStatus | string;
  currentStage?: string | null;
};

export type CustomerLifecycleHint =
  | "upcoming"
  | "late_window"
  | "awaiting_close_out"
  | "past"
  | null;

const OPEN_CLOSEOUT_STATUSES = new Set<BookingStatus>([
  "confirmed",
  "checked_in",
  "waiting",
  "in_progress",
]);

const AT_HOME_COMPLETED_STAGES = new Set(["service_completed"]);

export function readLifecycleDefaultsFromEnv(): Required<
  Pick<
    LifecycleProviderSettings,
    | "confirmationSlaHours"
    | "unconfirmedExpireHoursBeforeSlot"
    | "closeoutGraceMinutesSalon"
    | "closeoutGraceMinutesAtHome"
  >
> {
  const readPositive = (key: string, fallback: number) => {
    const raw = Number(process.env[key]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };
  return {
    confirmationSlaHours: readPositive("CONFIRMATION_SLA_HOURS", DEFAULT_CONFIRMATION_SLA_HOURS),
    unconfirmedExpireHoursBeforeSlot: readPositive(
      "UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT",
      DEFAULT_UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT,
    ),
    closeoutGraceMinutesSalon: readPositive(
      "CLOSEOUT_GRACE_MINUTES_SALON",
      DEFAULT_CLOSEOUT_GRACE_MINUTES_SALON,
    ),
    closeoutGraceMinutesAtHome: readPositive(
      "CLOSEOUT_GRACE_MINUTES_AT_HOME",
      DEFAULT_CLOSEOUT_GRACE_MINUTES_AT_HOME,
    ),
  };
}

export function resolveLifecycleProviderSettings(
  providerRow?: Partial<{
    confirmation_sla_hours: number | null;
    unconfirmed_expire_hours_before_slot: number | null;
    closeout_grace_minutes_salon: number | null;
    closeout_grace_minutes_at_home: number | null;
    late_arrival_grace_minutes: number | null;
  }> | null,
): LifecycleProviderSettings {
  const env = readLifecycleDefaultsFromEnv();
  const positive = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && value > 0 ? value : fallback;
  return {
    confirmationSlaHours: positive(providerRow?.confirmation_sla_hours, env.confirmationSlaHours),
    unconfirmedExpireHoursBeforeSlot: positive(
      providerRow?.unconfirmed_expire_hours_before_slot,
      env.unconfirmedExpireHoursBeforeSlot,
    ),
    closeoutGraceMinutesSalon: positive(
      providerRow?.closeout_grace_minutes_salon,
      env.closeoutGraceMinutesSalon,
    ),
    closeoutGraceMinutesAtHome: positive(
      providerRow?.closeout_grace_minutes_at_home,
      env.closeoutGraceMinutesAtHome,
    ),
    lateArrivalGraceMinutes: positive(providerRow?.late_arrival_grace_minutes, 0),
  };
}

export function isCustomerInitiatedOnlinePending(input: {
  status: string;
  bookingSource?: string | null;
  /** `bookings.recurring_series_id` — series visits are confirmed on materialise, not request-SLA. */
  recurringSeriesId?: string | null;
}): boolean {
  if (input.status !== "pending") return false;
  if (input.bookingSource !== "online") return false;
  if (input.recurringSeriesId) return false;
  return true;
}

export function resolvePendingExpireDecision(input: PendingExpireInput): PendingExpireDecision {
  return resolvePendingExpireDecisionCore(input, readLifecycleDefaultsFromEnv());
}

export function computePendingExpireAt(input: PendingExpireInput): Date {
  return computePendingExpireAtCore(input, readLifecycleDefaultsFromEnv());
}

export function computeBookingEndAt(input: BookingEndInput): Date {
  const scheduledAt = new Date(input.scheduledAt);
  if (input.scheduledEndAt) {
    const end = new Date(input.scheduledEndAt);
    if (Number.isFinite(end.getTime())) return end;
  }
  const duration =
    typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? input.durationMinutes
      : 60;
  return new Date(scheduledAt.getTime() + duration * 60 * 1000);
}

export function resolveCloseoutGraceMinutes(
  locationType?: string | null,
  settings?: LifecycleProviderSettings,
): number {
  const env = readLifecycleDefaultsFromEnv();
  if (locationType === "at_home") {
    return settings?.closeoutGraceMinutesAtHome ?? env.closeoutGraceMinutesAtHome;
  }
  return settings?.closeoutGraceMinutesSalon ?? env.closeoutGraceMinutesSalon;
}

export function computeCloseOutAt(input: CloseOutInput): Date {
  const graceMinutes = resolveCloseoutGraceMinutes(input.locationType, input.settings);
  return new Date(input.endAt.getTime() + graceMinutes * 60 * 1000);
}

export function isOpenBookingStatus(status: string): boolean {
  return OPEN_CLOSEOUT_STATUSES.has(status as BookingStatus);
}

export function isAtHomeBookingOpen(currentStage?: string | null): boolean {
  if (!currentStage) return true;
  return !AT_HOME_COMPLETED_STAGES.has(currentStage);
}

export function computeNeedsCloseOut(input: CloseOutStateInput): boolean {
  const now = input.now ?? new Date();
  if (!isOpenBookingStatus(input.status)) return false;
  if (input.currentStage && !isAtHomeBookingOpen(input.currentStage)) return false;
  const closeOutAt = new Date(input.endAt.getTime() + input.graceMinutes * 60 * 1000);
  return now >= closeOutAt;
}

export function computeInLateWindow(input: CloseOutStateInput): boolean {
  const now = input.now ?? new Date();
  if (!isOpenBookingStatus(input.status)) return false;
  if (input.currentStage && !isAtHomeBookingOpen(input.currentStage)) return false;
  const scheduledAt = new Date(input.scheduledAt);
  const closeOutAt = new Date(input.endAt.getTime() + input.graceMinutes * 60 * 1000);
  return now >= scheduledAt && now < closeOutAt;
}

export function isPendingExpireDue(input: {
  now?: Date;
  expireAt: Date;
  scheduledAt: Date | string;
}): boolean {
  const now = input.now ?? new Date();
  const scheduledAt = new Date(input.scheduledAt);
  return now >= input.expireAt && now < new Date(scheduledAt.getTime() + 60 * 60 * 1000);
}

export function isExpiringSoonPending(input: {
  now?: Date;
  expireAt: Date;
  withinHours?: number;
}): boolean {
  const now = input.now ?? new Date();
  const withinMs = (input.withinHours ?? 2) * 60 * 60 * 1000;
  return input.expireAt.getTime() - now.getTime() <= withinMs && input.expireAt > now;
}

const NUDGE_AFTER_CREATE_MS = 30 * 60 * 1000;
const NUDGE_BEFORE_EXPIRE_MS = 30 * 60 * 1000;

export type PendingNudgeKind = "after_create" | "before_expire";

/**
 * Which confirmation nudge is due: +30m after create, then 30m before expireAt.
 */
export function resolvePendingNudgeKind(input: {
  now: Date;
  createdAt: Date;
  expireAt: Date;
}): PendingNudgeKind | null {
  const { now, createdAt, expireAt } = input;
  const nudgeAfterCreate = new Date(createdAt.getTime() + NUDGE_AFTER_CREATE_MS);
  const nudgeBeforeExpire = new Date(expireAt.getTime() - NUDGE_BEFORE_EXPIRE_MS);

  if (now >= nudgeBeforeExpire && now < expireAt) {
    return isExpiringSoonPending({ now, expireAt, withinHours: 2 }) ? "before_expire" : null;
  }
  if (now >= nudgeAfterCreate && now < nudgeBeforeExpire) {
    return "after_create";
  }
  return null;
}

export type CloseOutSuggestedAction = "complete" | "review" | "provider_cancel";

export function getSuggestedCloseOutAction(input: {
  status: string;
  locationType?: string | null;
  currentStage?: string | null;
}): CloseOutSuggestedAction {
  if (input.status === "in_progress" || input.status === "checked_in") {
    return "complete";
  }
  if (
    input.locationType === "at_home" &&
    (!input.currentStage || input.currentStage === "confirmed")
  ) {
    return "provider_cancel";
  }
  return "review";
}

export function resolveCustomerLifecycleHint(input: {
  now?: Date;
  status: BookingStatus | string;
  scheduledAt: Date | string;
  endAt: Date;
  graceMinutes: number;
  currentStage?: string | null;
}): CustomerLifecycleHint {
  const now = input.now ?? new Date();
  if (["cancelled", "completed", "no_show"].includes(input.status)) {
    return input.status === "completed" || input.status === "no_show" ? "past" : null;
  }

  const closeOutAt = new Date(input.endAt.getTime() + input.graceMinutes * 60 * 1000);
  const scheduledAt = new Date(input.scheduledAt);

  if (isOpenBookingStatus(input.status)) {
    if (now >= closeOutAt) return "awaiting_close_out";
    if (now >= scheduledAt) return "late_window";
    return "upcoming";
  }

  if (input.status === "pending" || input.status === "pending_payment") {
    return now >= scheduledAt ? "past" : "upcoming";
  }

  return "past";
}

export function buildPendingExpiryRefundCopy(paymentStatus?: string | null): string {
  if (paymentStatus === "pending" || paymentStatus === "unpaid") {
    return "You have not been charged.";
  }
  return "You have been fully refunded — no cancellation fee applies.";
}

export const PRE_SLOT_EXPIRY_REASON =
  "This request was not confirmed in time, so the appointment time was released.";

export const SLA_EXPIRY_REASON =
  "The salon did not confirm this request within their reply window, so the appointment time was released.";

export const JANITOR_EXPIRY_REASON =
  "Expired — the provider did not confirm this request before the appointment time";

export function pendingExpiryCancellationReason(
  reason: "sla" | "pre_slot" | "janitor",
): string {
  if (reason === "janitor") return JANITOR_EXPIRY_REASON;
  if (reason === "sla") return SLA_EXPIRY_REASON;
  return PRE_SLOT_EXPIRY_REASON;
}
