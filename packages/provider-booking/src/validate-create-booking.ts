import {
  mapLegacyValidateCreateBookingInput,
  validateProviderBookingCreateDetailed,
} from "./validate-provider-booking-create";

export interface ValidateCreateBookingInput {
  clientName: string;
  staffId: string;
  date: string;
  startTime: string;
  serviceCount: number;
  /** Products-only bookings (mobile parity). */
  productCount?: number;
  intakeValid?: boolean;
  appointmentKind?: "in_salon" | "walk_in" | "at_home";
  atHomeAddressReady?: boolean;
  /** When 0, staff assignment is not required. */
  staffListLength?: number;
  /** When staff exist, each service line must have staff (mobile parity). */
  allServicesHaveStaff?: boolean;
  isRecurring?: boolean;
  recurringHasSavedClient?: boolean;
  recurringOccurrences?: string;
}

/** Returns first blocking validation message, or null when ready for review/submit. */
export function validateCreateBooking(input: ValidateCreateBookingInput): string | null {
  if (input.intakeValid === false) return "Complete required intake forms";

  const staffListLength = input.staffListLength ?? 1;
  const needsStaff = staffListLength > 0 && input.serviceCount > 0;
  const staffOk = !needsStaff || (input.allServicesHaveStaff ?? Boolean(input.staffId?.trim()));

  const detailed = mapLegacyValidateCreateBookingInput({
    ...input,
    productCount: input.productCount ?? 0,
    staffListLength,
    allServicesHaveStaff: staffOk,
  });

  const err = validateProviderBookingCreateDetailed(detailed);
  return err?.message ?? null;
}
