import { differenceInHours, getDay } from "date-fns";
import {
  mapStatus,
  AppointmentStatus,
} from "@/lib/scheduling/mangomintAdapter";
import {
  getStatusColors as getStatusColorsVm,
  getAppointmentVisualStyle,
} from "@/lib/scheduling/visualMapping";
import type { Appointment, AvailabilityBlockDisplay, TimeBlock } from "@/lib/provider-portal/types";
import { SERVICE_COLORS, DAY_NAMES, HOUR_HEIGHT } from "./constants";

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
  const { hour, minute } = parseScheduledTime(t);
  return hour * 60 + minute;
};

export const resolveDayHours = (
  dayHours: unknown,
): { open?: string; close?: string; closed: boolean } | null => {
  if (!dayHours || typeof dayHours !== "object") return null;
  const raw = dayHours as Record<string, unknown>;
  const hasClosed = raw.closed !== undefined;
  const hasIsOpen = raw.is_open !== undefined;
  const closedFlag = hasClosed
    ? raw.closed === true
    : hasIsOpen
      ? raw.is_open === false
      : false;
  const open = typeof raw.open === "string" ? raw.open
    : typeof raw.open_time === "string" ? raw.open_time
    : typeof raw.start_time === "string" ? raw.start_time
    : typeof raw.start === "string" ? raw.start
    : undefined;
  const close = typeof raw.close === "string" ? raw.close
    : typeof raw.close_time === "string" ? raw.close_time
    : typeof raw.end_time === "string" ? raw.end_time
    : typeof raw.end === "string" ? raw.end
    : undefined;
  return { open, close, closed: closedFlag };
};

export const isOutsideOperatingHours = (
  date: Date,
  hour: number,
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null,
): boolean => {
  if (!locationOperatingHours) return false;
  const dayKey = DAY_NAMES[getDay(date)];
  const resolved = resolveDayHours(locationOperatingHours[dayKey]);
  if (!resolved) return false;
  if (resolved.closed) return true;
  const openMin = timeToMinutes(resolved.open);
  const closeMin = timeToMinutes(resolved.close);
  if (openMin === closeMin) return false;
  const slotMin = hour * 60;
  return slotMin < openMin || slotMin >= closeMin;
};

export const isOutsideStaffHours = (
  date: Date,
  hour: number,
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null,
): boolean => {
  if (!staffWorkingHours || Object.keys(staffWorkingHours).length === 0) return false;
  const dayKey = DAY_NAMES[getDay(date)];
  const resolved = resolveDayHours(staffWorkingHours[dayKey]);
  if (!resolved) return false;
  if (resolved.closed) return true;
  const openMin = timeToMinutes(resolved.open);
  const closeMin = timeToMinutes(resolved.close);
  if (openMin === closeMin) return false;
  const slotMin = hour * 60;
  return slotMin < openMin || slotMin >= closeMin;
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
  const isMeeting = lower.includes("meeting");

  if (!useMangomintMode) {
    return { bg: "#f0f0f0", border: "#9ca3af", text: "#6b7280" };
  }

  if (isUnavailable) return { bg: "#E5E7EB", border: "#9CA3AF", text: "#4B5563" };
  if (isBreak) return { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" };
  if (isMaintenance || isMeeting) return { bg: "#DBEAFE", border: "#3B82F6", text: "#1E40AF" };
  return { bg: "#E5E7EB", border: "#9CA3AF", text: "#4B5563" };
};

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
