import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { AvailabilityBlockDisplay } from "@/lib/provider-portal/types";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type StaffTimeOffRow = {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  type?: string | null;
  status?: string | null;
};

export type StaffDayOffRow = {
  id: string;
  staff_id: string;
  date: string;
  reason?: string | null;
  is_approved?: boolean | null;
};

/**
 * Expand staff_time_off and staff_days_off into calendar segments (00:00–23:59 per day),
 * matching what GET /api/public/providers/.../availability treats as non-bookable for that staff.
 */
export function buildStaffUnavailabilityDisplay(
  dateFrom: string,
  dateTo: string,
  timeOffRows: StaffTimeOffRow[],
  daysOffRows: StaffDayOffRow[],
): AvailabilityBlockDisplay[] {
  if (!YMD.test(dateFrom) || !YMD.test(dateTo)) return [];

  const start = parseISO(`${dateFrom}T12:00:00`);
  const end = parseISO(`${dateTo}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const days = eachDayOfInterval({ start, end });
  const byStaffDate = new Map<string, AvailabilityBlockDisplay>();

  for (const day of days) {
    const ymd = format(day, "yyyy-MM-dd");

    for (const row of timeOffRows) {
      if (row.status === "denied") continue;
      if (ymd < row.start_date || ymd > row.end_date) continue;
      const key = `${row.staff_id}-${ymd}`;
      const label = row.reason?.trim() || row.type?.trim() || "Time off";
      const existing = byStaffDate.get(key);
      if (existing) {
        byStaffDate.set(key, {
          ...existing,
          id: `${existing.id}+${row.id}`,
          reason: [existing.reason, label].filter(Boolean).join(" · "),
        });
      } else {
        byStaffDate.set(key, {
          id: `timeoff-${row.id}-${ymd}`,
          date: ymd,
          start_time: "00:00",
          end_time: "23:59",
          team_member_id: row.staff_id,
          location_id: null,
          block_type: "unavailable",
          reason: label,
          _source: "staff_unavailability",
        });
      }
    }

    for (const row of daysOffRows) {
      if (row.is_approved === false) continue;
      if (row.date !== ymd) continue;
      const key = `${row.staff_id}-${ymd}`;
      const label = row.reason?.trim() || "Day off";
      const existing = byStaffDate.get(key);
      if (existing) {
        byStaffDate.set(key, {
          ...existing,
          id: `${existing.id}+dayoff-${row.id}`,
          reason: [existing.reason, label].filter(Boolean).join(" · "),
        });
      } else {
        byStaffDate.set(key, {
          id: `dayoff-${row.id}`,
          date: ymd,
          start_time: "00:00",
          end_time: "23:59",
          team_member_id: row.staff_id,
          location_id: null,
          block_type: "unavailable",
          reason: label,
          _source: "staff_unavailability",
        });
      }
    }
  }

  return Array.from(byStaffDate.values());
}
