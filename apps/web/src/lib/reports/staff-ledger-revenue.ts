/**
 * Split each booking's ledger net across staff using line-item catalogue price share
 * (same approach as sales/services and staff performance).
 */
export type BookingRowForStaffSplit = {
  id: string;
  booking_services?: Array<{ staff_id?: string | null; price?: number }> | null;
};

/**
 * Returns allocated ledger net per staff id for the given bookings.
 */
export function allocateLedgerNetByStaff(
  revenueByBooking: Map<string, number>,
  bookings: BookingRowForStaffSplit[] | null | undefined,
): Map<string, number> {
  const byStaff = new Map<string, number>();

  for (const booking of bookings || []) {
    const bookingRevenue = revenueByBooking.get(booking.id) || 0;
    const lines = booking.booking_services;
    if (!lines?.length) continue;

    const totalServicePrice = lines.reduce((sum, s) => sum + Number(s.price || 0), 0);

    for (const line of lines) {
      const sid = line.staff_id;
      if (!sid) continue;
      const prop =
        totalServicePrice > 0
          ? Number(line.price || 0) / totalServicePrice
          : 1 / lines.length;
      const add = bookingRevenue * prop;
      byStaff.set(sid, (byStaff.get(sid) || 0) + add);
    }
  }

  return byStaff;
}
