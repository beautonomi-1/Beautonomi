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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

export function validateGroupBookingCreateStepDetailed(
  input: GroupBookingCreateValidationInput
): GroupBookingCreateValidationError | null {
  if (!YMD_RE.test(input.date)) {
    return { message: "Date must be in YYYY-MM-DD format.", field: "date" };
  }
  if (!HHMM_RE.test(input.time)) {
    return { message: "Time must be in HH:MM format.", field: "time" };
  }
  const duration = Number(input.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { message: "Duration must be greater than 0 minutes.", field: "duration" };
  }
  if (!input.serviceId) {
    return {
      message: "Select a service so participant bookings can be created for calendar + accounting.",
      field: "serviceId",
    };
  }
  if (!input.staffId) {
    return {
      message: "Select a team member to schedule this group booking correctly.",
      field: "staffId",
    };
  }
  if (input.locationType === "at_home") {
    if (!input.addressLine1.trim()) {
      return {
        message: "Search and select the client address so the map pin and travel fee are accurate.",
        field: "address",
      };
    }
    if (input.addressLatitude == null || input.addressLongitude == null) {
      return {
        message: "Drop a map pin or choose an address suggestion so exact coordinates are saved.",
        field: "address",
      };
    }
  }
  const participants = input.participants.filter(
    (p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0
  );
  if (participants.length === 0) {
    return {
      message: "Add at least one participant so the group creates booking records.",
      field: "participants",
    };
  }
  for (const [idx, p] of participants.entries()) {
    if (!p.name) {
      return { message: `Participant ${idx + 1} needs a name.`, field: `participant:${idx}` };
    }
    const phoneErr = input.validatePhone(p.phone);
    if (phoneErr) {
      return { message: `Participant ${idx + 1}: ${phoneErr}`, field: `participant:${idx}` };
    }
    if (!p.serviceId) {
      return {
        message: `Select what participant ${idx + 1} wants.`,
        field: `participant:${idx}`,
      };
    }
  }
  return null;
}

export function validateGroupBookingCreateStep(input: GroupBookingCreateValidationInput): string | null {
  const err = validateGroupBookingCreateStepDetailed(input);
  return err?.message ?? null;
}
