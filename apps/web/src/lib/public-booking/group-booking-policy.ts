/**
 * Pure rules for online group bookings — used by validateBooking and unit tests.
 * Mirrors public GET /api/public/providers/[slug]/group-booking-settings semantics.
 */

export type GroupBookingPolicyInput = {
  /** `group_participants.length` (additional guests; primary booker counted separately). */
  additionalGuestCount: number;
  onlineGroupBookingEnabled: boolean;
  /** Provider max; callers should pass a sane default (e.g. 10) when null. */
  maxGroupSize: number;
  excludedServiceIds: string[];
  primaryOfferingIds: string[];
  participantOfferingIds: string[];
  locationType: "at_salon" | "at_home";
  locationId: string | null | undefined;
  /** When empty/null, all locations allowed for groups. */
  enabledLocationIds: string[] | null | undefined;
};

export type GroupBookingPolicyResult =
  | { ok: true }
  | { ok: false; message: string; code: string };

/**
 * Primary booker + each row in `group_participants` = head count for capacity.
 */
export function evaluateGroupBookingPolicy(input: GroupBookingPolicyInput): GroupBookingPolicyResult {
  if (!input.onlineGroupBookingEnabled) {
    return {
      ok: false,
      message: "Online group booking is not available for this provider.",
      code: "GROUP_BOOKING_DISABLED",
    };
  }

  const max = Math.max(1, Math.floor(Number(input.maxGroupSize) || 10));
  const additional = Math.max(0, input.additionalGuestCount);
  const headCount = additional + 1;

  if (additional < 1) {
    return {
      ok: false,
      message: "Add at least one group participant to book as a group.",
      code: "GROUP_PARTICIPANTS_REQUIRED",
    };
  }

  if (headCount > max) {
    return {
      ok: false,
      message: `This provider allows groups of up to ${max} people (including you).`,
      code: "GROUP_SIZE_EXCEEDED",
    };
  }

  const excluded = new Set((input.excludedServiceIds || []).filter(Boolean));
  for (const oid of input.primaryOfferingIds) {
    if (excluded.has(oid)) {
      return {
        ok: false,
        message: "One of your selected services cannot be booked as part of a group.",
        code: "GROUP_SERVICE_EXCLUDED",
      };
    }
  }
  for (const oid of input.participantOfferingIds) {
    if (excluded.has(oid)) {
      return {
        ok: false,
        message: "One of the group services is not allowed for group bookings.",
        code: "GROUP_SERVICE_EXCLUDED",
      };
    }
  }

  const locs = input.enabledLocationIds;
  if (input.locationType === "at_salon" && locs && locs.length > 0 && input.locationId) {
    if (!locs.includes(input.locationId)) {
      return {
        ok: false,
        message: "Group booking is not enabled for this location.",
        code: "GROUP_LOCATION_NOT_ALLOWED",
      };
    }
  }

  return { ok: true };
}
