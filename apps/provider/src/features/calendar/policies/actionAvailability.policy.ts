import {
  dbTargetToPatchStatusField,
  getAllowedTransitionTargets,
  filterInProgressWhenAtHomeVerificationPending,
} from "@/lib/provider-booking-status-transitions";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

export interface CalendarActionDef {
  id: string;
  dbTarget: string;
  patchField: string;
  destructive: boolean;
}

function bookingDbStatus(booking: Booking | CalendarBooking): string {
  if (typeof booking.db_status === "string" && booking.db_status.trim()) return booking.db_status;
  const s = booking.status;
  if (s === "booked") return "confirmed";
  if (s === "started") return "in_progress";
  return s;
}

export function bookingActionTargets(booking: Booking | CalendarBooking): string[] {
  const targets = getAllowedTransitionTargets(bookingDbStatus(booking));
  const rawLoc = booking.location_type;
  const atHome =
    rawLoc === "at_home" ||
    (rawLoc == null && !booking.location_id && !!booking.address?.line1?.trim());
  return filterInProgressWhenAtHomeVerificationPending({
    targets,
    atHome,
    arrivalVerified: booking.arrival_otp_verified === true || booking.qr_code_verified === true,
    arrivalOtpPending: booking.arrival_otp_pending === true,
    qrArrivalPending: booking.qr_arrival_pending === true,
    currentStage: booking.current_stage,
  });
}

export function contextualActionsFromBooking(booking: Booking | CalendarBooking): CalendarActionDef[] {
  return bookingActionTargets(booking).map((dbTarget) => ({
    id: dbTarget,
    dbTarget,
    patchField: dbTargetToPatchStatusField(dbTarget),
    destructive: dbTarget === "cancelled" || dbTarget === "no_show",
  }));
}
