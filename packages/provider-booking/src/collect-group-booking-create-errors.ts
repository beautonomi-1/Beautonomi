import type {
  GroupBookingCreateValidationError,
  GroupBookingCreateValidationField,
  GroupBookingCreateValidationInput,
} from "./validateGroupBookingCreate";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

/** All blocking validation errors for group booking create (not first-error-only). */
export function collectGroupBookingCreateValidationErrors(
  input: GroupBookingCreateValidationInput,
): GroupBookingCreateValidationError[] {
  const errors: GroupBookingCreateValidationError[] = [];

  const push = (message: string, field: GroupBookingCreateValidationField) => {
    errors.push({ message, field });
  };

  if (!YMD_RE.test(input.date)) {
    push("Date must be in YYYY-MM-DD format.", "date");
  }
  if (!HHMM_RE.test(input.time)) {
    push("Time must be in HH:MM format.", "time");
  }
  const duration = Number(input.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    push("Duration must be greater than 0 minutes.", "duration");
  }
  if (!input.serviceId) {
    push(
      "Select a service so participant bookings can be created for calendar + accounting.",
      "serviceId",
    );
  }
  if (!input.staffId) {
    push("Select a team member to schedule this group booking correctly.", "staffId");
  }
  if (input.locationType === "at_home") {
    if (!input.addressLine1.trim()) {
      push(
        "Search and select the client address so the map pin and travel fee are accurate.",
        "address",
      );
    } else if (input.addressLatitude == null || input.addressLongitude == null) {
      push(
        "Drop a map pin or choose an address suggestion so exact coordinates are saved.",
        "address",
      );
    }
  }

  const participants = input.participants.filter(
    (p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0,
  );
  if (participants.length === 0) {
    push("Add at least one participant so the group creates booking records.", "participants");
  } else {
    for (const [idx, p] of participants.entries()) {
      if (!p.name) {
        push(`Participant ${idx + 1} needs a name.`, `participant:${idx}`);
      }
      const phoneErr = input.validatePhone(p.phone);
      if (phoneErr) {
        push(`Participant ${idx + 1}: ${phoneErr}`, `participant:${idx}`);
      }
      if (!p.serviceId) {
        push(`Select what participant ${idx + 1} wants.`, `participant:${idx}`);
      }
    }
  }

  return errors;
}
