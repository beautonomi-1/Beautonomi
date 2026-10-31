import { ALL_BOOKING_STATUS_VALUES } from "@/lib/utils/booking-status";

export type BookingStatusBreakdown = Record<(typeof ALL_BOOKING_STATUS_VALUES)[number] | "other", number> & {
  scheduled_total: number;
};

export function buildBookingStatusBreakdown(
  rows: { status?: string | null }[],
): BookingStatusBreakdown {
  const counts = Object.fromEntries(
    ALL_BOOKING_STATUS_VALUES.map((s) => [s, 0]),
  ) as Record<(typeof ALL_BOOKING_STATUS_VALUES)[number], number>;
  let other = 0;

  for (const row of rows) {
    const status = row.status ?? "";
    if ((ALL_BOOKING_STATUS_VALUES as readonly string[]).includes(status)) {
      counts[status as (typeof ALL_BOOKING_STATUS_VALUES)[number]] += 1;
    } else if (status) {
      other += 1;
    } else {
      other += 1;
    }
  }

  const scheduled_total =
    other + ALL_BOOKING_STATUS_VALUES.reduce((sum, key) => sum + counts[key], 0);

  return { ...counts, other, scheduled_total };
}
