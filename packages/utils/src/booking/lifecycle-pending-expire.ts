import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Minimum confirm window for last-minute online requests. */
export const MIN_CONFIRM_WINDOW_MS = 15 * 60 * 1000;

/** Default confirmation SLA (business hours). */
export const DEFAULT_CONFIRMATION_SLA_HOURS = 2;

/** Default hours before slot to release unconfirmed requests. */
export const DEFAULT_UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT = 2;

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type DayKey = (typeof DAY_KEYS)[number];

const ALL_DAY_KEYS_SET = new Set<string>(DAY_KEYS);

export type WorkingHoursDay = {
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  open?: string;
  close?: string;
  closed?: boolean;
};

export type WorkingHoursJson = Record<string, WorkingHoursDay>;

export type LifecycleProviderSettings = {
  confirmationSlaHours?: number;
  unconfirmedExpireHoursBeforeSlot?: number;
  closeoutGraceMinutesSalon?: number;
  closeoutGraceMinutesAtHome?: number;
  lateArrivalGraceMinutes?: number;
};

export type PendingExpireInput = {
  createdAt: Date | string;
  scheduledAt: Date | string;
  workingHours?: WorkingHoursJson | null;
  timezone?: string | null;
  settings?: LifecycleProviderSettings;
};

export type PendingExpireBound = "sla" | "pre_slot";

export type PendingExpireDecision = {
  expireAt: Date;
  reason: PendingExpireBound;
  lastMinute: boolean;
  timezone: string;
  /** Next open instant when the request was created outside working hours. */
  overnightOpenAt: Date | null;
  /** Confirm-by time shown to customers (never before the next open). */
  displayConfirmAt: Date;
};

export type PendingExpireDefaults = Pick<
  LifecycleProviderSettings,
  "confirmationSlaHours" | "unconfirmedExpireHoursBeforeSlot"
>;

export function resolveWorkingHoursDay(
  wh: WorkingHoursJson,
  dayKey: DayKey,
): { open: boolean; openTime: string; closeTime: string } | null {
  const hasAnyKeys = Object.keys(wh).length > 0;
  const day = wh[dayKey];
  const isKnownDay = ALL_DAY_KEYS_SET.has(dayKey);

  if (!hasAnyKeys) {
    if (!isKnownDay) return null;
    return { open: true, openTime: "00:00", closeTime: "23:59" };
  }

  if (day === undefined) {
    return null;
  }

  const isClosed = day.is_open === false || day.closed === true;
  if (isClosed) {
    return null;
  }

  const openTime = (day.open_time || day.open || "00:00").trim();
  const closeTime = (day.close_time || day.close || "23:59").trim();
  return { open: true, openTime, closeTime };
}

function dayKeyForDateInTimezone(date: Date, timezone: string): DayKey {
  const weekday = formatInTimeZone(date, timezone, "EEEE").toLowerCase();
  return (DAY_KEYS.find((k) => k === weekday) ?? "sunday") as DayKey;
}

function localDateKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function localInstant(dateKey: string, hm: string, timezone: string): Date {
  const normalized = hm.length === 5 ? `${hm}:00` : hm;
  return fromZonedTime(`${dateKey}T${normalized}`, timezone);
}

function addLocalDays(dateKey: string, delta: number): string {
  const base = fromZonedTime(`${dateKey}T12:00:00`, "UTC");
  return formatInTimeZone(addDays(base, delta), "UTC", "yyyy-MM-dd");
}

function openCloseForLocalDay(
  dateKey: string,
  workingHours: WorkingHoursJson,
  timezone: string,
): { openAt: Date; closeAt: Date } | null {
  const probe = fromZonedTime(`${dateKey}T12:00:00`, timezone);
  const dayKey = dayKeyForDateInTimezone(probe, timezone);
  const day = resolveWorkingHoursDay(workingHours, dayKey);
  if (!day) return null;
  const openAt = localInstant(dateKey, day.openTime, timezone);
  const closeAt = localInstant(dateKey, day.closeTime, timezone);
  if (closeAt <= openAt) return null;
  return { openAt, closeAt };
}

function nextOpenInstant(
  from: Date,
  workingHours: WorkingHoursJson | null | undefined,
  timezone: string,
): Date | null {
  if (!workingHours || Object.keys(workingHours).length === 0) {
    return from;
  }

  const dateKey = localDateKey(from, timezone);
  for (let offset = 0; offset < 14; offset += 1) {
    const key = offset === 0 ? dateKey : addLocalDays(dateKey, offset);
    const window = openCloseForLocalDay(key, workingHours, timezone);
    if (!window) continue;
    if (from <= window.closeAt) {
      return from < window.openAt ? window.openAt : from;
    }
  }
  return null;
}

/**
 * Add business minutes using location working hours. Falls back to wall-clock when hours are empty.
 */
export function addBusinessMinutes(
  start: Date,
  minutesToAdd: number,
  workingHours?: WorkingHoursJson | null,
  timezone = "Africa/Johannesburg",
): Date {
  if (minutesToAdd <= 0) return start;
  if (!workingHours || Object.keys(workingHours).length === 0) {
    return new Date(start.getTime() + minutesToAdd * 60 * 1000);
  }

  let cursor = start;
  let remaining = minutesToAdd;
  let guard = 0;

  while (remaining > 0 && guard < 500) {
    guard += 1;
    const openAt = nextOpenInstant(cursor, workingHours, timezone);
    if (!openAt) {
      return addMinutes(start, minutesToAdd);
    }
    if (openAt > cursor) cursor = openAt;

    const window = openCloseForLocalDay(localDateKey(cursor, timezone), workingHours, timezone);
    if (!window || cursor >= window.closeAt) {
      cursor = addMinutes(cursor, 1);
      continue;
    }

    const availableMinutes = Math.max(
      0,
      Math.floor((window.closeAt.getTime() - cursor.getTime()) / 60000),
    );
    if (availableMinutes === 0) {
      cursor = addMinutes(cursor, 1);
      continue;
    }

    const consume = Math.min(remaining, availableMinutes);
    cursor = addMinutes(cursor, consume);
    remaining -= consume;
  }

  return cursor;
}

export function resolvePendingExpireDecision(
  input: PendingExpireInput,
  defaults?: PendingExpireDefaults,
): PendingExpireDecision {
  const settings = input.settings ?? {};
  const slaHours =
    settings.confirmationSlaHours ??
    defaults?.confirmationSlaHours ??
    DEFAULT_CONFIRMATION_SLA_HOURS;
  const expireHoursBeforeSlot =
    settings.unconfirmedExpireHoursBeforeSlot ??
    defaults?.unconfirmedExpireHoursBeforeSlot ??
    DEFAULT_UNCONFIRMED_EXPIRE_HOURS_BEFORE_SLOT;

  const createdAt = new Date(input.createdAt);
  const scheduledAt = new Date(input.scheduledAt);
  const timezone = input.timezone?.trim() || "Africa/Johannesburg";

  const minExpireAt = new Date(createdAt.getTime() + MIN_CONFIRM_WINDOW_MS);
  const slaAt = addBusinessMinutes(createdAt, slaHours * 60, input.workingHours, timezone);
  const preSlotAt = new Date(scheduledAt.getTime() - expireHoursBeforeSlot * 60 * 60 * 1000);
  const slaWins = slaAt.getTime() <= preSlotAt.getTime();

  let expireAt = new Date(
    Math.max(minExpireAt.getTime(), Math.min(slaAt.getTime(), preSlotAt.getTime())),
  );
  let reason: PendingExpireBound = slaWins ? "sla" : "pre_slot";
  let lastMinute = false;

  const lastChance = new Date(scheduledAt.getTime() - MIN_CONFIRM_WINDOW_MS);
  if (expireAt >= scheduledAt) {
    expireAt = lastChance;
    lastMinute = true;
    reason = "pre_slot";
  }

  const hours = input.workingHours;
  const nextOpen =
    hours && Object.keys(hours).length > 0 ? nextOpenInstant(createdAt, hours, timezone) : null;
  const overnightOpenAt =
    nextOpen && nextOpen.getTime() > createdAt.getTime() ? nextOpen : null;

  let displayConfirmAt = expireAt;
  if (overnightOpenAt && displayConfirmAt.getTime() < overnightOpenAt.getTime()) {
    displayConfirmAt =
      lastChance.getTime() >= overnightOpenAt.getTime() ? lastChance : overnightOpenAt;
  }

  return {
    expireAt,
    reason,
    lastMinute,
    timezone,
    overnightOpenAt,
    displayConfirmAt,
  };
}

export function computePendingExpireAt(
  input: PendingExpireInput,
  defaults?: PendingExpireDefaults,
): Date {
  return resolvePendingExpireDecision(input, defaults).expireAt;
}
