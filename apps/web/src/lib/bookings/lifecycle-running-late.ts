import type { BookingStatus } from "@/lib/utils/booking-status";
import { computeBookingEndAt } from "@/lib/bookings/lifecycle-deadlines";

export const ALLOWED_RUNNING_LATE_MINUTES = [10, 15, 20, 30, 45] as const;
export const RUNNING_LATE_RATE_LIMIT_MS = 15 * 60 * 1000;
export const RUNNING_LATE_WINDOW_BEFORE_MS = 30 * 60 * 1000;

export type RunningLateBookingRow = {
  status: string;
  scheduled_at: string;
  location_type?: string | null;
  current_stage?: string | null;
  customer_running_late_at?: string | null;
  booking_services?: Array<{
    scheduled_end_at?: string | null;
    duration_minutes?: number | null;
  }> | null;
};

export function isAllowedRunningLateMinutes(value: number): boolean {
  return (ALLOWED_RUNNING_LATE_MINUTES as readonly number[]).includes(value);
}

export function canCustomerReportRunningLate(
  row: RunningLateBookingRow,
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  const status = row.status as BookingStatus;
  if (["checked_in", "in_progress", "completed", "cancelled", "no_show"].includes(status)) {
    return { ok: false, reason: "status_not_allowed" };
  }

  const locationType = row.location_type ?? "at_salon";
  if (locationType === "at_home") {
    const stage = row.current_stage ?? "confirmed";
    if (!["confirmed", "provider_on_way"].includes(stage)) {
      return { ok: false, reason: "journey_stage_not_allowed" };
    }
  } else if (status !== "confirmed") {
    return { ok: false, reason: "status_not_allowed" };
  }

  const scheduledAt = new Date(row.scheduled_at);
  const windowStart = new Date(scheduledAt.getTime() - RUNNING_LATE_WINDOW_BEFORE_MS);
  const scheduledEndAt = (row.booking_services ?? []).reduce<string | null>((max, service) => {
    if (!service.scheduled_end_at) return max;
    if (!max || service.scheduled_end_at > max) return service.scheduled_end_at;
    return max;
  }, null);
  const durationMinutes =
    (row.booking_services ?? []).reduce((sum, service) => {
      const minutes =
        typeof service.duration_minutes === "number" && service.duration_minutes > 0
          ? service.duration_minutes
          : 0;
      return sum + minutes;
    }, 0) || 60;
  const endAt = computeBookingEndAt({
    scheduledAt: row.scheduled_at,
    scheduledEndAt,
    durationMinutes,
  });

  if (now < windowStart) return { ok: false, reason: "too_early" };
  if (now > endAt) return { ok: false, reason: "too_late" };

  if (row.customer_running_late_at) {
    const last = new Date(row.customer_running_late_at);
    if (now.getTime() - last.getTime() < RUNNING_LATE_RATE_LIMIT_MS) {
      return { ok: false, reason: "rate_limited" };
    }
  }

  return { ok: true };
}

export function shouldSuppressNoShowAfterRunningLate(input: {
  scheduledAt: string;
  delayMinutes: number;
  customerRunningLateAt?: string | null;
  now?: Date;
}): boolean {
  if (!input.customerRunningLateAt) return false;
  const now = input.now ?? new Date();
  const scheduledAt = new Date(input.scheduledAt);
  const suppressUntil = new Date(
    scheduledAt.getTime() + input.delayMinutes * 60 * 1000 + 10 * 60 * 1000,
  );
  return now < suppressUntil;
}
