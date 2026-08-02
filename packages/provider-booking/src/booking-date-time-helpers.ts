import { addDays, format, isSameDay, startOfDay } from "date-fns";

export type BookingSlotRow = {
  time: string;
  available: boolean;
  reason?: string;
};

export type BookingSlotPeriod = "morning" | "afternoon" | "evening";

export const DEFAULT_BOOKING_DATE_RANGE_DAYS = 90;

export function buildDateOptions(rangeDays: number, anchor: Date = new Date()): Date[] {
  const today = startOfDay(anchor);
  return Array.from({ length: rangeDays }, (_, i) => addDays(today, i));
}

export function formatRelativeDateLabel(date: Date, today: Date = new Date()): string {
  const t = startOfDay(today);
  const d = startOfDay(date);
  if (isSameDay(d, t)) return "Today";
  if (isSameDay(d, addDays(t, 1))) return "Tomorrow";
  return format(d, "EEE");
}

export function parseSlotHour(time: string): number {
  const [h = "0"] = time.split(":");
  const hour = Number(h);
  return Number.isFinite(hour) ? hour : 0;
}

export function getSlotPeriod(time: string): BookingSlotPeriod {
  const hour = parseSlotHour(time);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export const SLOT_PERIOD_LABELS: Record<BookingSlotPeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function groupSlotsByPeriod(rows: BookingSlotRow[]): Array<{ period: BookingSlotPeriod; label: string; rows: BookingSlotRow[] }> {
  const buckets: Record<BookingSlotPeriod, BookingSlotRow[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const row of rows) {
    buckets[getSlotPeriod(row.time)].push(row);
  }
  return (["morning", "afternoon", "evening"] as const)
    .map((period) => ({ period, label: SLOT_PERIOD_LABELS[period], rows: buckets[period] }))
    .filter((g) => g.rows.length > 0);
}

export function findNextAvailableSlot(rows: BookingSlotRow[], afterTime?: string | null): BookingSlotRow | null {
  const available = rows.filter((r) => r.available);
  if (available.length === 0) return null;
  if (!afterTime) return available[0] ?? null;
  const idx = available.findIndex((r) => r.time >= afterTime);
  return idx >= 0 ? available[idx]! : available[0]!;
}

export function normalizeSlotRows(data: {
  slot_grid?: BookingSlotRow[];
  slots?: string[];
} | null | undefined): BookingSlotRow[] {
  const grid = data?.slot_grid;
  if (grid && grid.length > 0) return grid;
  const legacy = data?.slots;
  if (legacy && legacy.length > 0) {
    return legacy.map((time) => ({ time, available: true }));
  }
  return [];
}

export function buildAvailableSlotsUrl(params: {
  date: string;
  duration_minutes: number;
  staff_ids?: string;
  location_id?: string;
  service_ids?: string;
  mode?: string;
  travel_buffer?: number;
  exclude_booking_id?: string;
  exclude_group_booking_id?: string;
}): string {
  if (!params.date) return "";
  let q = `/api/provider/bookings/available-slots?date=${encodeURIComponent(params.date)}&duration_minutes=${encodeURIComponent(String(params.duration_minutes))}`;
  if (params.staff_ids) q += `&staff_ids=${encodeURIComponent(params.staff_ids)}`;
  if (params.location_id) q += `&location_id=${encodeURIComponent(params.location_id)}`;
  if (params.service_ids) q += `&service_ids=${encodeURIComponent(params.service_ids)}`;
  if (params.mode) q += `&mode=${encodeURIComponent(params.mode)}`;
  if (params.travel_buffer != null) q += `&travel_buffer=${encodeURIComponent(String(params.travel_buffer))}`;
  if (params.exclude_booking_id) q += `&exclude_booking_id=${encodeURIComponent(params.exclude_booking_id)}`;
  if (params.exclude_group_booking_id) q += `&exclude_group_booking_id=${encodeURIComponent(params.exclude_group_booking_id)}`;
  return q;
}
