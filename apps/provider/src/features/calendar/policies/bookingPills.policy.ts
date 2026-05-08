import type { TFunction } from "@beautonomi/i18n";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";
import { getCalendarPaymentLabel, paymentNeedsAttention } from "@/lib/calendar-payment-label";

export interface BookingPillFlags {
  showPayment: boolean;
  paymentLabel: string | null;
  paymentAttention: boolean;
  showModeAtHome: boolean;
  showModeGroup: boolean;
  showRecurring: boolean;
  showPackage: boolean;
}

// ─── Structured pill config (plan spec: getBookingPillConfig) ─────────────────

export interface BookingPillConfig {
  status: { label: string; color: string };
  mode?: { label: string; icon: string };
  payment?: { label: string; attention: boolean };
  source?: { label: string };
  recurring?: boolean;
  package?: boolean;
}

type BookingPillFields = Booking | CalendarBooking;

const SOURCE_LABELS: Record<string, string> = {
  beautonomi: "Beautonomi",
  direct: "Direct",
  express: "Express Booking",
  walkin: "Walk-in",
  walk_in: "Walk-in",
};

export function getBookingPillConfig(
  booking: BookingPillFields,
  t: TFunction,
): BookingPillConfig {
  const paymentLabel = getCalendarPaymentLabel(booking, t);
  const paymentAttention = paymentNeedsAttention(booking);

  const atHome =
    booking.location_type === "at_home" ||
    (booking.location_type == null &&
      !booking.location_id &&
      !!(booking as { address?: { line1?: string } }).address?.line1?.trim());

  const group =
    !!(booking as { is_group_booking?: boolean }).is_group_booking ||
    !!(booking as { group_booking_id?: string }).group_booking_id;

  const recurring = !!(booking as { recurrence_rule?: unknown }).recurrence_rule;
  const pkg = !!(booking as { package_id?: string }).package_id;

  const bookingSource = (booking as { booking_source?: string }).booking_source;

  let modeConfig: BookingPillConfig["mode"] | undefined;
  if (atHome) {
    modeConfig = { label: "At Home", icon: "car-outline" };
  } else if (group) {
    modeConfig = { label: "Group", icon: "people-outline" };
  }

  return {
    status: { label: String(booking.status ?? ""), color: booking.status ?? "" },
    mode: modeConfig,
    payment:
      paymentLabel != null || paymentAttention
        ? { label: paymentLabel ?? "", attention: paymentAttention }
        : undefined,
    source: bookingSource ? { label: SOURCE_LABELS[bookingSource] ?? bookingSource } : undefined,
    recurring: recurring || undefined,
    package: pkg || undefined,
  };
}

// ─── Legacy flags helper ───────────────────────────────────────────────────────

export function resolveBookingPills(
  booking: Booking | CalendarBooking,
  t: TFunction,
  offersMobileServices?: boolean,
): BookingPillFlags {
  const paymentLabel = getCalendarPaymentLabel(booking, t);
  const paymentAttention = paymentNeedsAttention(booking);

  const atHome =
    booking.location_type === "at_home" ||
    (booking.location_type == null &&
      !booking.location_id &&
      !!(booking as { address?: { line1?: string } }).address?.line1?.trim());

  const group =
    !!(booking as { is_group_booking?: boolean }).is_group_booking ||
    !!(booking as { group_booking_id?: string }).group_booking_id;

  const recurring = !!(booking as { recurrence_rule?: unknown }).recurrence_rule;
  const pkg = !!(booking as { package_id?: string }).package_id;

  return {
    showPayment: paymentLabel != null || paymentAttention,
    paymentLabel,
    paymentAttention,
    showModeAtHome: Boolean(offersMobileServices !== false && atHome),
    showModeGroup: group,
    showRecurring: recurring,
    showPackage: pkg,
  };
}
