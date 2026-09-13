import {
  computeBookingEndAt,
  computeCloseOutAt,
  computeInLateWindow,
  computeNeedsCloseOut,
  getSuggestedCloseOutAction,
  resolveCloseoutGraceMinutes,
  resolveCustomerLifecycleHint,
  resolveLifecycleProviderSettings,
  type LifecycleProviderSettings,
} from "@/lib/bookings/lifecycle-deadlines";

export type BookingLifecycleRow = {
  status: string;
  scheduled_at: string;
  location_type?: string | null;
  current_stage?: string | null;
  booking_services?: Array<{
    scheduled_end_at?: string | null;
    duration_minutes?: number | null;
    offerings?: { duration_minutes?: number | null } | null;
  }> | null;
};

export type BookingLifecycleFields = {
  end_at: string;
  close_out_at: string;
  grace_minutes: number;
  needs_close_out: boolean;
  in_late_window: boolean;
  lifecycle_hint: ReturnType<typeof resolveCustomerLifecycleHint>;
  suggested_close_out_action: ReturnType<typeof getSuggestedCloseOutAction>;
};

function resolveDurationMinutes(row: BookingLifecycleRow): number {
  const services = row.booking_services ?? [];
  if (services.length === 0) return 60;

  let maxEnd: Date | null = null;
  let totalDuration = 0;
  for (const service of services) {
    if (service.scheduled_end_at) {
      const end = new Date(service.scheduled_end_at);
      if (Number.isFinite(end.getTime()) && (!maxEnd || end > maxEnd)) {
        maxEnd = end;
      }
    }
    const dur =
      typeof service.duration_minutes === "number" && service.duration_minutes > 0
        ? service.duration_minutes
        : typeof service.offerings?.duration_minutes === "number" &&
            service.offerings.duration_minutes > 0
          ? service.offerings.duration_minutes
          : 60;
    totalDuration += dur;
  }

  if (maxEnd) {
    const scheduled = new Date(row.scheduled_at);
    return Math.max(1, Math.round((maxEnd.getTime() - scheduled.getTime()) / 60000));
  }
  return totalDuration > 0 ? totalDuration : 60;
}

export function enrichBookingLifecycleFields(
  row: BookingLifecycleRow,
  settings?: LifecycleProviderSettings,
  now = new Date(),
): BookingLifecycleFields {
  const scheduledEndAt = (() => {
    const services = row.booking_services ?? [];
    let max: string | null = null;
    for (const service of services) {
      if (!service.scheduled_end_at) continue;
      if (!max || service.scheduled_end_at > max) max = service.scheduled_end_at;
    }
    return max;
  })();

  const endAt = computeBookingEndAt({
    scheduledAt: row.scheduled_at,
    scheduledEndAt,
    durationMinutes: resolveDurationMinutes(row),
  });
  const graceMinutes = resolveCloseoutGraceMinutes(row.location_type, settings);
  const closeOutAt = computeCloseOutAt({ endAt, locationType: row.location_type, settings });

  const stateInput = {
    now,
    scheduledAt: row.scheduled_at,
    endAt,
    graceMinutes,
    status: row.status,
    currentStage: row.current_stage,
  };

  return {
    end_at: endAt.toISOString(),
    close_out_at: closeOutAt.toISOString(),
    grace_minutes: graceMinutes,
    needs_close_out: computeNeedsCloseOut(stateInput),
    in_late_window: computeInLateWindow(stateInput),
    lifecycle_hint: resolveCustomerLifecycleHint(stateInput),
    suggested_close_out_action: getSuggestedCloseOutAction({
      status: row.status,
      locationType: row.location_type,
      currentStage: row.current_stage,
    }),
  };
}

export function mapProviderSettingsFromRow(
  row?: Partial<{
    confirmation_sla_hours: number | null;
    unconfirmed_expire_hours_before_slot: number | null;
    closeout_grace_minutes_salon: number | null;
    closeout_grace_minutes_at_home: number | null;
    late_arrival_grace_minutes: number | null;
  }> | null,
): LifecycleProviderSettings {
  return resolveLifecycleProviderSettings(row);
}
