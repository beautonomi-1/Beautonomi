/** Shared validation for provider group booking create → review step. */
export type GroupBookingCreateValidationInput = {
  date: string;
  time: string;
  duration: string;
  serviceId: string;
  staffId: string;
  locationType: "at_salon" | "at_home";
  addressLine1: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
  participants: {
    name: string;
    phone: string;
    email: string;
    serviceId: string;
  }[];
  validatePhone: (phone: string) => string | null;
};

export type GroupBookingCreateValidationField =
  | "date"
  | "time"
  | "duration"
  | "serviceId"
  | "staffId"
  | "address"
  | "participants"
  | `participant:${number}`;

export type GroupBookingCreateValidationError = {
  message: string;
  field: GroupBookingCreateValidationField;
};

import { collectGroupBookingCreateValidationErrors } from "./collect-group-booking-create-errors";

export function validateGroupBookingCreateStepDetailed(
  input: GroupBookingCreateValidationInput
): GroupBookingCreateValidationError | null {
  const errors = collectGroupBookingCreateValidationErrors(input);
  return errors[0] ?? null;
}

export function validateGroupBookingCreateStep(input: GroupBookingCreateValidationInput): string | null {
  const err = validateGroupBookingCreateStepDetailed(input);
  return err?.message ?? null;
}
