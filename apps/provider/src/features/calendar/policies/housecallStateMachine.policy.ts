import type { Booking } from "@/components/calendar/calendar-booking-types";

export type HousecallStage =
  | "not_mobile"
  | "needs_verification"
  | "ready_for_service"
  | "in_service"
  | "completed";

export interface HousecallNextAction {
  stage: HousecallStage;
  labelKey: "verify" | "start_service" | "complete" | "none";
  blockedReason?: string;
}

export function getHousecallStage(booking: Booking & { location_type?: string | null }): HousecallStage {
  const atHome =
    booking.location_type === "at_home" ||
    (booking.location_type == null &&
      !booking.location_id &&
      !!(booking as { address?: { line1?: string } }).address?.line1?.trim());

  if (!atHome) return "not_mobile";

  const verified = booking.arrival_otp_verified === true || booking.qr_code_verified === true;
  const needsVerification =
    !verified && (booking.arrival_otp_pending === true || booking.qr_arrival_pending === true);

  if (needsVerification) return "needs_verification";

  const db = typeof booking.db_status === "string" ? booking.db_status : "";
  if (db === "completed") return "completed";
  if (db === "in_progress") return "in_service";
  if (verified || booking.current_stage === "provider_arrived") return "ready_for_service";

  return "needs_verification";
}

export function getHousecallNextAction(booking: Booking): HousecallNextAction {
  const stage = getHousecallStage(booking);
  if (stage === "not_mobile") return { stage, labelKey: "none" };
  if (stage === "completed") return { stage, labelKey: "none" };
  if (stage === "needs_verification") {
    return {
      stage,
      labelKey: "verify",
      blockedReason: "verification_required",
    };
  }
  if (stage === "in_service") {
    return { stage, labelKey: "complete" };
  }
  return { stage, labelKey: "start_service" };
}
