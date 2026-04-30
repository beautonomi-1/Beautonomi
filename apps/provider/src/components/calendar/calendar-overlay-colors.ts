import { Colors } from "@/constants/colors";
import { capitalizeFirst } from "@/lib/format";

/** Legend + overlay coloring (exported for calendar color-legend UI). */
export const BLOCK_TYPE_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  break: { bg: "#fefce8", border: "#facc15", text: "#854d0e", icon: "cafe-outline" },
  lunch: { bg: "#fefce8", border: "#facc15", text: "#854d0e", icon: "cafe-outline" },
  meeting: { bg: "#eff6ff", border: "#60a5fa", text: "#1e40af", icon: "people-outline" },
  maintenance: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", icon: "build-outline" },
  unavailable: { bg: Colors.gray[100], border: Colors.gray[500], text: Colors.gray[700], icon: "ban-outline" },
  other: { bg: Colors.gray[50], border: Colors.gray[400], text: Colors.gray[600], icon: "ban-outline" },
};

export const STAFF_TIMEOFF_OVERLAY_COLORS = {
  bg: "#EDE9FE",
  border: "#8B5CF6",
  text: "#5B21B6",
  icon: "calendar-outline",
};

export const BOOKING_HOLD_OVERLAY_COLORS = {
  bg: "#FFF7ED",
  border: "#FB923C",
  text: "#9A3412",
  icon: "hourglass-outline",
};

/** Minimal overlay row shape for coloring (calendar screen uses a fuller `TimeBlock`). */
export interface CalendarOverlayColorSource {
  block_type: string;
  calendar_overlay_kind?: "availability" | "staff_off" | "time_block" | "booking_hold";
  overlay_source?: "staff_unavailability" | "availability_block";
}

function getTimeBlockColors(type: string) {
  const lower = type.toLowerCase();
  if (lower === "unavailable" || lower.includes("unavailable")) return BLOCK_TYPE_COLORS.unavailable;
  if (lower === "maintenance" || lower.includes("maintenance")) return BLOCK_TYPE_COLORS.maintenance;
  if (lower.includes("break") || lower.includes("lunch")) return BLOCK_TYPE_COLORS.break;
  if (lower.includes("meeting")) return BLOCK_TYPE_COLORS.meeting;
  return BLOCK_TYPE_COLORS.other;
}

export function getCalendarOverlayColors(block: CalendarOverlayColorSource) {
  if (block.calendar_overlay_kind === "booking_hold") return BOOKING_HOLD_OVERLAY_COLORS;
  if (block.overlay_source === "staff_unavailability") return STAFF_TIMEOFF_OVERLAY_COLORS;
  return getTimeBlockColors(block.block_type);
}

export function formatOverlayTitle(block: { title?: string; block_type: string }): string {
  const t = block.title?.trim();
  if (t) return t;
  return capitalizeFirst(block.block_type);
}
