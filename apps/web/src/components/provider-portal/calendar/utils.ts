import { differenceInHours } from "date-fns";
import {
  mapStatus,
  AppointmentStatus,
} from "@/lib/scheduling/mangomintAdapter";
import {
  getStatusColors as getStatusColorsVm,
  getAppointmentVisualStyle,
} from "@/lib/scheduling/visualMapping";
import type { Appointment, AvailabilityBlockDisplay, TimeBlock } from "@/lib/provider-portal/types";
import {
  hourIsOutsideWeekly,
  mergeStaffWorkingHours as sharedMergeStaffWorkingHours,
  resolveDayHours as sharedResolveDayHours,
  timeStringToMinutes as sharedTimeStringToMinutes,
  type MergedDayHours,
  type WeeklyHours,
} from "@beautonomi/utils";
import { SERVICE_COLORS, HOUR_HEIGHT } from "./constants";

// Re-export for external consumers that used these from the old monolith
export { getStatusColorsVm as getStatusColors };

export type CalendarBlock =
  | (TimeBlock & { _source?: "time_block" })
  | (AvailabilityBlockDisplay & { name?: string });

export type AppointmentColor = {
  bg: string;
  border: string;
  text: string;
  opacity?: number;
  hidden?: boolean;
};

export const getServiceColor = (serviceName: string) => {
  const lowerName = serviceName.toLowerCase();
  for (const [keyword, colors] of Object.entries(SERVICE_COLORS)) {
    if (lowerName.includes(keyword)) return colors;
  }
  return SERVICE_COLORS.default;
};

export const getAppointmentColors = (
  apt: Appointment,
  useMangomintMode: boolean,
  colorBy: "status" | "service" | "team_member" = "status",
  showCanceled = true,
): AppointmentColor => {
  if (!useMangomintMode) {
    const colors = getServiceColor(apt.service_name);
    if (apt.status === "completed") return { bg: "#d1fae5", border: "#10b981", text: "#065f46" };
    if (apt.status === "started") return { bg: "#fce7f3", border: "#ec4899", text: "#831843" };
    if (apt.status === "cancelled") return { bg: "#f3f4f6", border: "#9ca3af", text: "#4b5563", opacity: 0.6 };
    if (apt.status === "pending" || apt.db_status === "pending") return { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" };
    return colors;
  }

  const mangomintStatus = mapStatus(apt);
  if (mangomintStatus === AppointmentStatus.CANCELED && !showCanceled) {
    return { bg: "transparent", border: "transparent", text: "transparent", hidden: true };
  }

  const visualStyle = getAppointmentVisualStyle(mangomintStatus, apt.service_name, {
    colorBy: colorBy === "team_member" ? "status" : colorBy,
    showCanceled,
  });

  return {
    bg: visualStyle.backgroundColor,
    border: visualStyle.borderColor,
    text: visualStyle.textColor,
    opacity: visualStyle.opacity,
    hidden: apt.status === "cancelled" && !showCanceled,
  };
};

export const generateTimeSlots = (startHour: number, endHour: number): string[] => {
  const slots: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
  }
  return slots;
};

export const parseScheduledTime = (time: string | undefined): { hour: number; minute: number } => {
  const fallback = { hour: 0, minute: 0 };
  if (!time || typeof time !== "string") return fallback;
  const parts = time.trim().split(":").map((p) => parseInt(p, 10));
  const hour = Number.isFinite(parts[0]) ? Math.max(0, Math.min(23, parts[0])) : fallback.hour;
  const minute = Number.isFinite(parts[1]) ? Math.max(0, Math.min(59, parts[1])) : fallback.minute;
  return { hour, minute };
};

export const parseTimeRange = (
  start?: string,
  end?: string,
): { startHour: number; startMinute: number; endHour: number; endMinute: number } | null => {
  const s = parseScheduledTime(start);
  const e = parseScheduledTime(end);
  if (s.hour === e.hour && s.minute === e.minute) return null;
  return { startHour: s.hour, startMinute: s.minute, endHour: e.hour, endMinute: e.minute };
};

export const parseHourRange = (
  open?: string,
  close?: string,
): { openHour: number; closeHour: number } | null => {
  const o = parseScheduledTime(open);
  const c = parseScheduledTime(close);
  if (!Number.isFinite(o.hour) || !Number.isFinite(c.hour)) return null;
  return { openHour: o.hour, closeHour: c.hour };
};

/** Convert "HH:MM" or "H:MM" to total minutes for reliable comparison. */
export const timeToMinutes = (t: string | undefined): number => {
  const parsed = sharedTimeStringToMinutes(t ?? null);
  return parsed ?? 0;
};

/**
 * Legacy-shape wrapper around the shared `resolveDayHours`. Returns a
 * `{ open?, close?, closed }` object to keep the long-standing call-site
 * contract (callers read `.closed` and pass `.open` / `.close` through to
 * `timeToMinutes`).
 */
export const resolveDayHours = (
  dayHours: unknown,
): { open?: string; close?: string; closed: boolean } | null => {
  const normalized = sharedResolveDayHours(dayHours);
  if (normalized) {
    if (normalized.closed) {
      return { open: undefined, close: undefined, closed: true };
    }
    const pad = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { open: pad(normalized.openMin), close: pad(normalized.closeMin), closed: false };
  }
  // Preserve the historical "return {closed: …, open: undefined}" when the
  // shape has an explicit closed flag but no parseable open/close times —
  // some callers only read `.closed` to decide shading.
  if (dayHours && typeof dayHours === "object" && !Array.isArray(dayHours)) {
    const raw = dayHours as Record<string, unknown>;
    const hasClosed = raw.closed !== undefined;
    const hasIsOpen = raw.is_open !== undefined;
    if (hasClosed || hasIsOpen) {
      const closedFlag = hasClosed ? raw.closed === true : raw.is_open === false;
      return { open: undefined, close: undefined, closed: closedFlag };
    }
  }
  return null;
};

/**
 * §Calendar-hours: delegates to the shared `hourIsOutsideWeekly` so 09:30
 * opens no longer mark the 09:00 hour row as closed, and overnight shifts
 * (22:00 -> 02:00) are correctly honoured on the wrap-around day.
 */
export const isOutsideOperatingHours = (
  date: Date,
  hour: number,
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null,
): boolean => {
  if (!locationOperatingHours) return false;
  return hourIsOutsideWeekly(date, hour, locationOperatingHours as WeeklyHours);
};

export const isOutsideStaffHours = (
  date: Date,
  hour: number,
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null,
): boolean => {
  if (!staffWorkingHours || Object.keys(staffWorkingHours).length === 0) return false;
  return hourIsOutsideWeekly(date, hour, staffWorkingHours as WeeklyHours);
};

/** First grid hour where the location is open and at least one team member can work (falls back to startHour). */
export function getFirstHourAnyStaffAvailable(
  date: Date,
  startHour: number,
  endHour: number,
  members: Array<{ working_hours?: Record<string, { open: string; close: string; closed?: boolean }> | null }>,
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null,
): number {
  for (let hour = startHour; hour <= endHour; hour++) {
    if (isOutsideOperatingHours(date, hour, locationOperatingHours)) continue;
    if (members.length === 0) return hour;
    const anyStaff = members.some(
      (m) => !isOutsideStaffHours(date, hour, m.working_hours ?? undefined),
    );
    if (anyStaff) return hour;
  }
  return startHour;
}

export const formatTime12h = (time: string) => {
  const { hour, minute } = parseScheduledTime(time);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
};

export const isNewBooking = (createdDate: string, status?: string) => {
  const completedStatuses = ["completed", "cancelled", "no_show"];
  if (status && completedStatuses.includes(status)) return false;
  return differenceInHours(new Date(), new Date(createdDate)) < 24;
};

export const getEndTime = (startTime: string, durationMinutes: number) => {
  const { hour, minute } = parseScheduledTime(startTime);
  const total = hour * 60 + minute + durationMinutes;
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
};

export const toDateStr = (d: string) => (d && d.length >= 10 ? d.slice(0, 10) : d);

/** Compute absolute pixel position for a time within the grid. */
export const timeToPixels = (time: string, gridStartHour: number): number => {
  const { hour, minute } = parseScheduledTime(time);
  return (hour - gridStartHour) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
};

export const durationToPixels = (durationMinutes: number): number => {
  return (durationMinutes / 60) * HOUR_HEIGHT;
};

export type BlockColors = { bg: string; border: string; text: string };

/** Calendar overlay from `availability_blocks` or staff schedule (time off / day off). */
export const isAvailabilityOverlay = (block: CalendarBlock): boolean =>
  "_source" in block &&
  (block._source === "availability_block" || block._source === "staff_unavailability");

export const isStaffScheduleUnavailability = (block: CalendarBlock): boolean =>
  "_source" in block && block._source === "staff_unavailability";

/** @deprecated Use isAvailabilityOverlay */
export const isAvailabilityBlock = isAvailabilityOverlay;

export const getBlockColors = (
  block: CalendarBlock,
  useMangomintMode: boolean,
): BlockColors => {
  const isAvailability = isAvailabilityBlock(block);
  if (!isAvailability && !useMangomintMode) {
    return { bg: "#f0f0f0", border: "#9ca3af", text: "#6b7280" };
  }

  const blockTypeName = isAvailability
    ? ((block as AvailabilityBlockDisplay).block_type ?? "")
    : ((block as any).blocked_time_type_name ?? (block as any).blocked_time_type?.name ?? "");

  const lower = blockTypeName.toLowerCase();
  const isBreak = lower.includes("break") || lower.includes("lunch");
  const isUnavailable = isAvailability && (block as AvailabilityBlockDisplay).block_type === "unavailable";
  const isMaintenance = isAvailability && (block as AvailabilityBlockDisplay).block_type === "maintenance";
  const isHold =
    isAvailability && (block as AvailabilityBlockDisplay).block_type === "hold";
  const isMeeting = lower.includes("meeting");

  if (!useMangomintMode) {
    // B8: hold overlays still render in non-Mangomint mode so staff see
    // in-flight booking holds as greyed-out ghost slots.
    if (isHold) return { bg: "#F3F4F6", border: "#9CA3AF", text: "#6B7280" };
    return { bg: "#f0f0f0", border: "#9ca3af", text: "#6b7280" };
  }

  // B8: booking_hold ghost slot — amber dashed border to signal "pending /
  // reserved but not yet confirmed". The dashed border is applied in the
  // renderer based on `_source === "booking_hold"`.
  if (isHold) return { bg: "#FFFBEB", border: "#F59E0B", text: "#92400E" };
  if (isUnavailable) return { bg: "#E5E7EB", border: "#9CA3AF", text: "#4B5563" };
  if (isBreak) return { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" };
  if (isMaintenance || isMeeting) return { bg: "#DBEAFE", border: "#3B82F6", text: "#1E40AF" };
  return { bg: "#E5E7EB", border: "#9CA3AF", text: "#4B5563" };
};

/** B8: Booking-hold ghost slot check. Used by the renderer to apply a dashed
 * outline so hold blocks are visually distinct from staff time off / breaks.
 */
export const isBookingHoldOverlay = (block: CalendarBlock): boolean =>
  "_source" in block && block._source === "booking_hold";

/**
 * Union of all team members' weekly hours (same semantics as week-view `DateColumn`).
 * Used in day view when a staff row has no personal `working_hours` so weekend shifts
 * match week view instead of falling back to location-only hours.
 *
 * §Calendar-hours: delegates to the shared `mergeStaffWorkingHours` and
 * synthesises an all-day weekly schedule for members with no `working_hours`
 * so they keep the historical "always open" contribution to the merged window.
 */
export function mergeTeamWorkingHoursForCalendar(
  teamMembers: Array<{
    working_hours?: Record<string, { open: string; close: string; closed?: boolean }> | null;
  }>,
): Record<string, { open: string; close: string; closed?: boolean }> | undefined {
  const anyStaffHasHours = teamMembers.some(
    (m) => m.working_hours && Object.keys(m.working_hours).length > 0,
  );
  if (!anyStaffHasHours) return undefined;

  const allDay: Record<string, { open: string; close: string }> = {};
  for (const day of ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]) {
    allDay[day] = { open: "00:00", close: "24:00" };
  }

  const normalized = teamMembers.map((m) => ({
    working_hours:
      m.working_hours && Object.keys(m.working_hours).length > 0
        ? (m.working_hours as WeeklyHours)
        : (allDay as WeeklyHours),
  }));

  const merged = sharedMergeStaffWorkingHours(normalized);
  if (!merged) return undefined;

  const out: Record<string, { open: string; close: string; closed?: boolean }> = {};
  let anyOpenDay = false;
  for (const [day, rawEntry] of Object.entries(merged) as Array<[string, MergedDayHours]>) {
    if (rawEntry.closed) {
      out[day] = { open: "00:00", close: "00:00", closed: true };
    } else {
      anyOpenDay = true;
      out[day] = { open: rawEntry.open, close: rawEntry.close };
    }
  }
  return anyOpenDay ? out : undefined;
}

export const getBlockLabel = (block: CalendarBlock): string => {
  const isAvailability = isAvailabilityOverlay(block);
  const blockTypeName = isAvailability
    ? ((block as AvailabilityBlockDisplay).block_type ?? "")
    : ((block as any).blocked_time_type_name ?? (block as any).blocked_time_type?.name ?? "");
  const named = "name" in block ? (block as { name?: string }).name : undefined;
  if (named?.trim()) return named.trim();
  if (isStaffScheduleUnavailability(block)) return "Time off";
  return blockTypeName || "Blocked";
};
