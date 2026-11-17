/**
 * Split each booking's ledger net across staff using line-item catalogue price share
 * (same approach as sales/services and staff performance).
 */
import { addMoney, multiplyMoney } from "@beautonomi/utils";
import { pooledShare } from "@/lib/payroll/commission-calculator";

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
    const shares = bookingLineShares(bookingRevenue, lines);
    lines.forEach((line, index) => {
      const sid = line.staff_id;
      const add = shares[index] ?? 0;
      if (!sid || add === 0) return;
      byStaff.set(sid, addMoney(byStaff.get(sid) || 0, add));
    });
  }

  return byStaff;
}

/** One share per line. The shares add up to the booking, including a refund. */
export function bookingLineShares(
  amount: number,
  lines: ReadonlyArray<{ price?: number | null }>,
): number[] {
  if (lines.length === 0 || amount === 0) return lines.map(() => 0);
  const total = lines.reduce((sum, line) => addMoney(sum, Number(line.price || 0)), 0);
  const parts = lines.map((line, index) => ({
    id: `line:${index}`,
    weight: total > 0 ? Number(line.price || 0) : 1,
  }));
  return lines.map((_, index) => pooledShare({ amount, parts, id: `line:${index}` }));
}

/** Mean ledger net per booking that has a ledger row. A refund counts. */
export function averageOfLedgerNets(nets: Iterable<number>): number {
  let count = 0;
  let total = 0;
  for (const net of nets) {
    count += 1;
    total = addMoney(total, net);
  }
  return count > 0 ? multiplyMoney(total, 1 / count) : 0;
}
