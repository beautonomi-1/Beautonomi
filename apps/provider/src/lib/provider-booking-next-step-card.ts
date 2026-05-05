import type { Ionicons } from "@expo/vector-icons";

/** Minimal fields for next-step card copy (house-call stages must match DB). */
export type BookingNextStepCardInput = {
  status?: string | null;
  current_stage?: string | null;
  arrival_otp_verified?: boolean | null;
  qr_code_verified?: boolean | null;
};

export function getBookingNextStepCard(
  booking: BookingNextStepCardInput,
  options: { outstanding: number; isAtHome: boolean; isAtSalon: boolean },
): { title: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string } {
  const status = (booking.status || "").toLowerCase();
  if (status === "pending" || status === "pending_payment") {
    return {
      title: "Review and confirm",
      description: "Confirm the appointment, collect any required payment, or reschedule before the visit.",
      icon: "alert-circle-outline",
      color: "#d97706",
    };
  }
  if (options.isAtHome && booking.current_stage === "provider_on_way") {
    return {
      title: "Mark arrival next",
      description: "You are en route. Mark arrived when you reach the client, then verify their PIN or QR.",
      icon: "navigate-outline",
      color: "#7c3aed",
    };
  }
  if (
    options.isAtHome &&
    booking.current_stage === "provider_arrived" &&
    !booking.arrival_otp_verified &&
    !booking.qr_code_verified
  ) {
    return {
      title: "Verify arrival",
      description: "Ask the client for their arrival PIN or QR before starting the service.",
      icon: "qr-code-outline",
      color: "#7c3aed",
    };
  }
  if (status === "waiting") {
    return {
      title: "Client is waiting",
      description: "The client has arrived and is in the waiting area. Check them in when you are ready.",
      icon: "time-outline",
      color: "#d97706",
    };
  }
  if (status === "checked_in") {
    return {
      title: "Client checked in",
      description: options.isAtHome
        ? "Client arrival confirmed. Start the service when ready."
        : "Client is at your station. Start the service when ready.",
      icon: "person-circle-outline",
      color: "#2563eb",
    };
  }
  if (status === "confirmed" || status === "booked") {
    return {
      title: options.isAtHome ? "Ready for journey" : options.isAtSalon ? "Ready for check-in" : "Ready for service",
      description: options.isAtHome
        ? "Start journey when you leave for the client."
        : "Use Change Status to check in the client or start service.",
      icon: options.isAtHome ? "car-outline" : "play-circle-outline",
      color: "#2563eb",
    };
  }
  if (status === "started" || status === "in_progress") {
    return {
      title: "Service in progress",
      description: "Complete the service when finished, then settle any outstanding balance.",
      icon: "timer-outline",
      color: "#d97706",
    };
  }
  if (status === "completed" && options.outstanding > 0) {
    return {
      title: "Payment still due",
      description: "Send a payment link, take Yoco, or mark the remaining amount as paid.",
      icon: "card-outline",
      color: "#d97706",
    };
  }
  if (status === "completed") {
    return {
      title: "Completed",
      description: "Receipt, payment, products, forms, and history remain available below.",
      icon: "checkmark-circle-outline",
      color: "#16a34a",
    };
  }
  if (status === "cancelled" || status === "no_show") {
    return {
      title: status === "no_show" ? "Marked no-show" : "Cancelled",
      description: "You can still review history, notify the customer, or handle refunds if payment exists.",
      icon: "close-circle-outline",
      color: "#dc2626",
    };
  }
  return {
    title: "Manage booking",
    description: "Review appointment details and use the available actions for this booking.",
    icon: "calendar-outline",
    color: "#4b5563",
  };
}
