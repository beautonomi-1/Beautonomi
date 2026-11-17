/**
 * F3-23: appointment SLA / expiry / grace values must be finite integers
 * inside operational ranges so auto-confirm and auto-expire cannot misfire.
 */
const HOURS_MAX = 24 * 7; // 168
const CLOSEOUT_MINUTES_MAX = 240;
const LATE_ARRIVAL_MINUTES_MAX = 120;

export function appointmentTimingIntError(
  field: string,
  raw: unknown,
  max: number,
  min = 0,
): string | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return `${field} must be an integer between ${min} and ${max}`;
  }
  return null;
}

export function appointmentSettingsTimingError(body: {
  confirmationSlaHours?: unknown;
  unconfirmedExpireHoursBeforeSlot?: unknown;
  closeoutGraceMinutesSalon?: unknown;
  closeoutGraceMinutesAtHome?: unknown;
  lateArrivalGraceMinutes?: unknown;
}): string | null {
  if (body.confirmationSlaHours !== undefined) {
    const err = appointmentTimingIntError("confirmationSlaHours", body.confirmationSlaHours, HOURS_MAX);
    if (err) return err;
  }
  if (body.unconfirmedExpireHoursBeforeSlot !== undefined) {
    const err = appointmentTimingIntError(
      "unconfirmedExpireHoursBeforeSlot",
      body.unconfirmedExpireHoursBeforeSlot,
      HOURS_MAX,
    );
    if (err) return err;
  }
  if (body.closeoutGraceMinutesSalon !== undefined) {
    const err = appointmentTimingIntError(
      "closeoutGraceMinutesSalon",
      body.closeoutGraceMinutesSalon,
      CLOSEOUT_MINUTES_MAX,
    );
    if (err) return err;
  }
  if (body.closeoutGraceMinutesAtHome !== undefined) {
    const err = appointmentTimingIntError(
      "closeoutGraceMinutesAtHome",
      body.closeoutGraceMinutesAtHome,
      CLOSEOUT_MINUTES_MAX,
    );
    if (err) return err;
  }
  if (body.lateArrivalGraceMinutes !== undefined) {
    const err = appointmentTimingIntError(
      "lateArrivalGraceMinutes",
      body.lateArrivalGraceMinutes,
      LATE_ARRIVAL_MINUTES_MAX,
    );
    if (err) return err;
  }
  return null;
}
