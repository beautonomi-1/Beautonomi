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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

export function validateGroupBookingCreateStep(input: GroupBookingCreateValidationInput): string | null {
  if (!YMD_RE.test(input.date)) return "Date must be in YYYY-MM-DD format.";
  if (!HHMM_RE.test(input.time)) return "Time must be in HH:MM format.";
  const duration = Number(input.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return "Duration must be greater than 0 minutes.";
  }
  if (!input.serviceId) {
    return "Select a service so participant bookings can be created for calendar + accounting.";
  }
  if (!input.staffId) {
    return "Select a team member to schedule this group booking correctly.";
  }
  if (input.locationType === "at_home") {
    if (!input.addressLine1.trim()) {
      return "Search and select the client address so the map pin and travel fee are accurate.";
    }
    if (input.addressLatitude == null || input.addressLongitude == null) {
      return "Drop a map pin or choose an address suggestion so exact coordinates are saved.";
    }
  }
  const participants = input.participants.filter(
    (p) => p.name.length > 0 || p.phone.length > 0 || p.email.length > 0,
  );
  if (participants.length === 0) {
    return "Add at least one participant so the group creates booking records.";
  }
  for (const [idx, p] of participants.entries()) {
    if (!p.name) return `Participant ${idx + 1} needs a name.`;
    const phoneErr = input.validatePhone(p.phone);
    if (phoneErr) return `Participant ${idx + 1}: ${phoneErr}`;
    if (!p.serviceId) return `Select what participant ${idx + 1} wants.`;
  }
  return null;
}
