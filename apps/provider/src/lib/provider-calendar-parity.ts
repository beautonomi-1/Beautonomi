export interface CalendarBookingServiceLike {
  name?: string | null;
  offering_name?: string | null;
  offering_id?: string | null;
  duration_minutes?: number | null;
  staff_name?: string | null;
  staff_id?: string | null;
  guest_name?: string | null;
  scheduled_start_at?: string | null;
  price?: number | null;
}

export interface CalendarBookingLike {
  id: string;
  scheduled_at: string;
  total_amount?: number | null;
  currency?: string | null;
  services?: CalendarBookingServiceLike[] | null;
}

export type CalendarDisplayBooking<T extends CalendarBookingLike> = Omit<T, "scheduled_at" | "total_amount" | "services"> & {
  scheduled_at: string;
  total_amount: number;
  services: CalendarBookingServiceLike[];
  calendar_item_id: string;
  calendar_parent_booking_id: string;
  calendar_service_index: number;
  calendar_service_name: string;
  calendar_staff_id: string | null;
  calendar_staff_name: string | null;
  calendar_price: number;
};

const STRICT_HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseCalendarTimeStrict(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = STRICT_HH_MM.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeCalendarTimeStrict(value: string): string | null {
  const minutes = parseCalendarTimeStrict(value);
  if (minutes == null) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function validateCalendarTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { ok: true; startTime: string; endTime: string; startMinutes: number; endMinutes: number } | { ok: false; reason: "format" | "order" } {
  const start = normalizeCalendarTimeStrict(startTime ?? "");
  const end = normalizeCalendarTimeStrict(endTime ?? "");
  if (!start || !end) return { ok: false, reason: "format" };

  const startMinutes = parseCalendarTimeStrict(start)!;
  const endMinutes = parseCalendarTimeStrict(end)!;
  if (endMinutes <= startMinutes) return { ok: false, reason: "order" };

  return { ok: true, startTime: start, endTime: end, startMinutes, endMinutes };
}

export function expandBookingsForCalendar<T extends CalendarBookingLike>(
  bookings: T[] | null | undefined,
): CalendarDisplayBooking<T>[] {
  if (!Array.isArray(bookings)) return [];

  const out: CalendarDisplayBooking<T>[] = [];
  for (const booking of bookings) {
    const services = Array.isArray(booking.services) ? booking.services : [];
    const rows = services.length > 0 ? services : [null];

    rows.forEach((service, index) => {
      const displayService: CalendarBookingServiceLike =
        service ?? {
          name: "Service",
          duration_minutes: 60,
          staff_id: null,
          staff_name: null,
        };
      const serviceName = displayService.name || displayService.offering_name || "Service";
      const scheduledAt = displayService.scheduled_start_at || booking.scheduled_at;
      const price = Number(booking.total_amount ?? displayService.price ?? 0);

      out.push({
        ...booking,
        scheduled_at: scheduledAt,
        total_amount: Number.isFinite(price) ? price : 0,
        calendar_item_id: `${booking.id}__svc_${index}`,
        calendar_parent_booking_id: booking.id,
        calendar_service_index: index,
        calendar_service_name: serviceName,
        calendar_staff_id: displayService.staff_id ?? null,
        calendar_staff_name: displayService.staff_name ?? null,
        calendar_price: Number.isFinite(price) ? price : 0,
        services: [displayService],
      } as CalendarDisplayBooking<T>);
    });
  }

  return out;
}
