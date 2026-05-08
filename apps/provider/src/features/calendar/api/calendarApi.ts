/**
 * Thin URL builders + helpers for provider calendar routes (same contracts as legacy calendar).
 */
export function providerBookingsRangePath(startDate: string, endDate: string, locationId?: string | null): string {
  const loc = locationId && locationId !== "all" ? `&location_id=${encodeURIComponent(locationId)}` : "";
  return `/api/provider/bookings?start_date=${startDate}&end_date=${endDate}${loc}`;
}

export function providerBookingsAtHomePath(startDate: string, endDate: string): string {
  return `/api/provider/bookings?start_date=${startDate}&end_date=${endDate}&location_type=at_home`;
}

export function shiftsPath(weekStartYmd: string): string {
  return `/api/provider/shifts?week_start=${encodeURIComponent(weekStartYmd)}`;
}

export function timeBlocksPath(dateFrom: string, dateTo: string, locationId?: string | null): string {
  const loc = locationId && locationId !== "all" ? `&location_id=${encodeURIComponent(locationId)}` : "";
  return `/api/provider/time-blocks?date_from=${dateFrom}&date_to=${dateTo}${loc}`;
}

export function bookingHoldsPath(dateFrom: string, dateTo: string): string {
  return `/api/provider/calendar/booking-holds?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
}

export function staffUnavailabilityPath(dateFrom: string, dateTo: string): string {
  return `/api/provider/calendar/staff-unavailability?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
}
