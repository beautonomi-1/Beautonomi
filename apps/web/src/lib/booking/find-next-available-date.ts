import {
  formatBusinessDayYYYYMMDD,
  startOfBusinessDayLocalDate,
} from "@beautonomi/utils";

export type AvailabilitySlot = {
  start?: string;
  time?: string;
  end?: string;
  is_available?: boolean;
};

export type FindNextAvailableParams = {
  providerSlug: string;
  providerTimezone: string | null;
  serviceId: string;
  staffId: string;
  durationMinutes: number;
  bufferMinutes: number;
  locationId?: string | null;
  maxAdvanceDays: number;
  /** Skip the first N calendar days when searching (e.g. day after the currently selected date). */
  startDayOffset?: number;
  extraQuery?: string;
  fetchAvailability: (url: string) => Promise<{ slots: AvailabilitySlot[] }>;
};

export type FindNextAvailableResult = {
  date: Date;
  slots: AvailabilitySlot[];
} | null;

/**
 * Walk up to 14 business days (capped by maxAdvanceDays) for the first day with a future slot.
 */
export async function findNextAvailableDate(
  params: FindNextAvailableParams,
): Promise<FindNextAvailableResult> {
  const {
    providerSlug,
    providerTimezone,
    serviceId,
    staffId,
    durationMinutes,
    bufferMinutes,
    locationId,
    maxAdvanceDays,
    startDayOffset = 0,
    extraQuery = "",
    fetchAvailability,
  } = params;

  const tz = providerTimezone;
  const dateStr = (d: Date) => formatBusinessDayYYYYMMDD(d, tz);
  const maxDays = Math.min(14, Math.max(1, maxAdvanceDays));
  const start = Math.max(0, startDayOffset);
  const now = Date.now();

  for (let offset = start; offset < start + maxDays; offset++) {
    const d = startOfBusinessDayLocalDate(tz, offset);
    const base = `/api/public/providers/${encodeURIComponent(providerSlug)}/availability?date=${dateStr(d)}&service_id=${encodeURIComponent(serviceId)}&staff_id=${encodeURIComponent(staffId)}&duration_minutes=${durationMinutes}&buffer_minutes=${bufferMinutes}&location_id=${encodeURIComponent(locationId ?? "")}${extraQuery}`;
    const res = await fetchAvailability(base).catch(() => ({ slots: [] }));
    const list = res.slots ?? [];
    const isToday = offset === 0;
    const available = list.filter((s) => {
      if (s.is_available === false) return false;
      const start = s.start ?? s.time;
      if (!start) return false;
      if (isToday) return new Date(start).getTime() > now;
      return true;
    });
    if (available.length > 0) {
      return { date: d, slots: list };
    }
  }
  return null;
}
