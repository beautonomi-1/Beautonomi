import { differenceInHours, parseISO } from "date-fns";
import type { Booking } from "@/components/calendar/calendar-booking-types";

function parseCreatedAt(value: string | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function isNewBooking(booking: Booking): boolean {
  if (!booking.created_at) return false;
  if (booking.status === "completed" || booking.status === "cancelled") return false;
  const createdAt = parseCreatedAt(booking.created_at);
  if (!createdAt) return false;
  return differenceInHours(new Date(), createdAt) < 24;
}
