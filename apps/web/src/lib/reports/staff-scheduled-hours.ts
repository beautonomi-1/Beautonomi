/**
 * Staff hours from catalogue service duration (offerings.duration_minutes), not clock-in.
 */

export type StaffHoursBookingLine = {
  staff_id?: string | null;
  offerings?: { duration_minutes?: number | null } | Array<{ duration_minutes?: number | null }> | null;
};

export type StaffHoursBooking = {
  id: string;
  status?: string | null;
  booking_services?: StaffHoursBookingLine[] | null;
};

export type StaffMemberLite = {
  id: string;
  users?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

export type StaffHoursRow = {
  staffId: string;
  staffName: string;
  deliveredHours: number;
  missedHours: number;
  notYetCompletedHours: number;
  cancelledHours: number;
  deliveredBookings: number;
  missedBookings: number;
  notYetCompletedBookings: number;
  cancelledBookings: number;
  completionRate: number;
};

export type StaffHoursReportPayload = {
  reportBasis: string;
  totalDeliveredHours: number;
  totalMissedHours: number;
  totalNotYetCompletedHours: number;
  totalCancelledHours: number;
  totalDeliveredBookings: number;
  totalMissedBookings: number;
  completionRate: number;
  staffHours: StaffHoursRow[];
  bookingsTruncated?: boolean;
};

function lineDurationMinutes(line: StaffHoursBookingLine): number {
  const off = line.offerings;
  const offering = Array.isArray(off) ? off[0] : off;
  const mins = Number(offering?.duration_minutes ?? 0);
  return Number.isFinite(mins) && mins > 0 ? mins : 0;
}

function staffDisplayName(staff: StaffMemberLite): string {
  const u = staff.users;
  const fullName = Array.isArray(u) ? u[0]?.full_name : u?.full_name;
  return fullName || "Unknown";
}

function bookingBucket(status: string | null | undefined): "delivered" | "missed" | "cancelled" | "notYet" {
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return "delivered";
  if (s === "no_show") return "missed";
  if (s === "cancelled") return "cancelled";
  return "notYet";
}

export function computeStaffScheduledHoursReport(
  staffMembers: StaffMemberLite[],
  bookings: StaffHoursBooking[],
  options?: { bookingsTruncated?: boolean },
): StaffHoursReportPayload {
  const truncated = options?.bookingsTruncated === true;
  let basis =
    "Minutes come from each service’s catalogue duration on the appointment, not clock-in times. " +
    "Delivered is completed visits; missed is no-shows; still on the book is everything else that was not cancelled.";
  if (truncated) {
    basis += " Older appointments may be missing from this list.";
  }

  const staffHours: StaffHoursRow[] = staffMembers.map((staff) => {
    const row: StaffHoursRow = {
      staffId: staff.id,
      staffName: staffDisplayName(staff),
      deliveredHours: 0,
      missedHours: 0,
      notYetCompletedHours: 0,
      cancelledHours: 0,
      deliveredBookings: 0,
      missedBookings: 0,
      notYetCompletedBookings: 0,
      cancelledBookings: 0,
      completionRate: 0,
    };

    for (const booking of bookings) {
      const lines = booking.booking_services?.filter((bs) => bs.staff_id === staff.id) ?? [];
      if (lines.length === 0) continue;

      const bucket = bookingBucket(booking.status);
      let hoursOnBooking = 0;
      for (const line of lines) {
        hoursOnBooking += lineDurationMinutes(line) / 60;
      }

      switch (bucket) {
        case "delivered":
          row.deliveredHours += hoursOnBooking;
          row.deliveredBookings += 1;
          break;
        case "missed":
          row.missedHours += hoursOnBooking;
          row.missedBookings += 1;
          break;
        case "cancelled":
          row.cancelledHours += hoursOnBooking;
          row.cancelledBookings += 1;
          break;
        default:
          row.notYetCompletedHours += hoursOnBooking;
          row.notYetCompletedBookings += 1;
          break;
      }
    }

    const denom = row.deliveredBookings + row.missedBookings;
    row.completionRate = denom > 0 ? (row.deliveredBookings / denom) * 100 : 0;
    return row;
  });

  staffHours.sort((a, b) => b.deliveredHours - a.deliveredHours);

  const totalDeliveredHours = staffHours.reduce((s, r) => s + r.deliveredHours, 0);
  const totalMissedHours = staffHours.reduce((s, r) => s + r.missedHours, 0);
  const totalNotYetCompletedHours = staffHours.reduce((s, r) => s + r.notYetCompletedHours, 0);
  const totalCancelledHours = staffHours.reduce((s, r) => s + r.cancelledHours, 0);
  const totalDeliveredBookings = staffHours.reduce((s, r) => s + r.deliveredBookings, 0);
  const totalMissedBookings = staffHours.reduce((s, r) => s + r.missedBookings, 0);
  const completionDenom = totalDeliveredBookings + totalMissedBookings;
  const completionRate =
    completionDenom > 0 ? (totalDeliveredBookings / completionDenom) * 100 : 0;

  return {
    reportBasis: basis,
    totalDeliveredHours,
    totalMissedHours,
    totalNotYetCompletedHours,
    totalCancelledHours,
    totalDeliveredBookings,
    totalMissedBookings,
    completionRate,
    staffHours,
    ...(truncated ? { bookingsTruncated: true } : {}),
  };
}

/** Delivered catalogue hours for one staff member (performance report line). */
export function deliveredHoursForStaff(staffId: string, bookings: StaffHoursBooking[]): number {
  let hours = 0;
  for (const booking of bookings) {
    if (bookingBucket(booking.status) !== "delivered") continue;
    for (const line of booking.booking_services ?? []) {
      if (line.staff_id !== staffId) continue;
      hours += lineDurationMinutes(line) / 60;
    }
  }
  return hours;
}
