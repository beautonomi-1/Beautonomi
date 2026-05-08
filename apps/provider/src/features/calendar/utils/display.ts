import { addDays, format } from "date-fns";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";
import type { ColorByMode } from "@/hooks/useCalendarPreferences";
import type { TFunction } from "@beautonomi/i18n";
import { STATUS_COLORS, SERVICE_COLOR_MAP, TEAM_COLORS, type StatusColorTriple } from "@/features/calendar/theme/tokens";
import { parseApiDateTime } from "@/components/calendar/calendar-layout";
import { formatTimeInZone } from "@/lib/format";
import { calendarDateKey } from "@/features/calendar/utils/timezone";

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getStatusColors(status: string): StatusColorTriple {
  return STATUS_COLORS[status] ?? STATUS_COLORS.booked;
}

export function resolveCalendarColorKey(booking: Booking | CalendarBooking): string {
  const db = booking.db_status;
  if (db === "pending") return "pending";
  if (db === "confirmed") return "confirmed";
  if (db === "waiting") return "waiting";
  if (db === "checked_in") return "checked_in";
  if (db === "in_progress") return "started";
  if (db === "completed") return "completed";
  if (db === "cancelled") return "cancelled";
  if (db === "no_show") return "no_show";
  return booking.status;
}

export function getServiceColors(booking: Booking | CalendarBooking): StatusColorTriple {
  const serviceName = booking.services?.[0]?.name?.toLowerCase() ?? "";
  for (const [keywords, colors] of SERVICE_COLOR_MAP) {
    if (keywords.some((kw) => serviceName.includes(kw))) return colors;
  }
  return { bg: "#f8fafc", border: "#94a3b8", text: "#1e293b" };
}

export function getTeamColors(booking: Booking | CalendarBooking, staffList: { id: string }[]): StatusColorTriple {
  const staffId = "calendar_staff_id" in booking ? booking.calendar_staff_id : booking.services?.[0]?.staff_id;
  if (!staffId) return TEAM_COLORS[0]!;
  const idx = staffList.findIndex((s) => s.id === staffId);
  return TEAM_COLORS[idx >= 0 ? idx % TEAM_COLORS.length : 0]!;
}

export function getBlockColors(
  booking: Booking | CalendarBooking,
  colorBy: ColorByMode,
  staffList: { id: string; name: string }[],
): StatusColorTriple {
  switch (colorBy) {
    case "service":
      return getServiceColors(booking);
    case "team_member":
      return getTeamColors(booking, staffList);
    default:
      return getStatusColors(resolveCalendarColorKey(booking));
  }
}

export function translateBookingStatusLabel(t: TFunction, status: string): string {
  const key = `provider.calendarScreen.bookingStatusLabels.${status}`;
  const v = t(key);
  return v === key ? capitalizeFirst(status.replace(/_/g, " ")) : v;
}

export function buildScheduleShareBody(
  viewMode: "day" | "3day" | "week",
  selectedDate: Date,
  weekStart: Date,
  bookings: Booking[],
  businessName: string,
  t: TFunction,
  timeZone?: string | null,
): string {
  const displayName = businessName.trim() || "Your business";
  const header = `Schedule — ${displayName}\n`;
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
  let days: Date[] = [];
  if (viewMode === "day") days = [selectedDate];
  else if (viewMode === "3day") days = Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i));
  else days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const parts: string[] = [header];
  for (const day of days) {
    const dayKey = calendarDateKey(day, timeZone);
    const dayBookings = sorted.filter((b) => {
      const d = parseApiDateTime(b.scheduled_at);
      return d != null && calendarDateKey(d, timeZone) === dayKey;
    });
    parts.push(`\n${format(day, "EEE, MMM d")}`);
    if (dayBookings.length === 0) {
      parts.push("  No appointments");
    } else {
      for (const b of dayBookings) {
        const timeStr = formatTimeInZone(b.scheduled_at, timeZone) || format(new Date(b.scheduled_at), "h:mm a");
        const name = b.customers?.full_name?.trim() || "Walk-in";
        const svcs = b.services?.map((s) => s.name).filter(Boolean).join(", ") || "Appointment";
        parts.push(`  ${timeStr} — ${name} — ${svcs} (${translateBookingStatusLabel(t, b.status)})`);
      }
    }
  }
  return parts.join("\n");
}
