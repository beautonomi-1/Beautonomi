export interface ValidateCreateBookingInput {
  clientName: string;
  staffId: string;
  date: string;
  startTime: string;
  serviceCount: number;
  intakeValid?: boolean;
  appointmentKind?: "in_salon" | "walk_in" | "at_home";
  atHomeAddressReady?: boolean;
}

/** Returns first blocking validation message, or null when ready for review/submit. */
export function validateCreateBooking(input: ValidateCreateBookingInput): string | null {
  if (!input.clientName.trim()) return "Client name is required";
  if (!input.staffId) return "Staff is required";
  if (!input.date) return "Date is required";
  if (!input.startTime) return "Start time is required";
  if (input.serviceCount <= 0) return "Add at least one service";
  if (input.intakeValid === false) return "Complete required intake forms";
  if (input.appointmentKind === "at_home" && input.atHomeAddressReady === false) {
    return "Complete the at-home address";
  }
  return null;
}
