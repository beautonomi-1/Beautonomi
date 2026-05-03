import type { BookingDraft } from "@/types/beautonomi";

export type HoldRowForSnapshot = {
  start_at: string;
  booking_services_snapshot: unknown;
  location_type: string | null;
  location_id: string | null;
  metadata: unknown;
};

/**
 * Mutates `draft` so server-side validation matches the slot locked at hold creation.
 * See validate-booking.ts contract comment.
 */
export function applyPublicBookingHoldSnapshotToDraft(
  draft: BookingDraft,
  holdRow: HoldRowForSnapshot,
): { preferredStaffIds: string[] | null } {
  const snapshot = holdRow.booking_services_snapshot as
    | Array<{ offering_id: string; staff_id?: string | null }>
    | null;

  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    throw new Error("HOLD_NO_SERVICES");
  }

  draft.selected_datetime = holdRow.start_at;
  draft.services = snapshot.map((s) => ({
    offering_id: s.offering_id,
    staff_id: s.staff_id ?? null,
  }));

  const lt = String(holdRow.location_type || "");
  draft.location_type = lt === "at_salon" ? "at_salon" : "at_home";
  if (lt === "at_salon") {
    draft.location_id = holdRow.location_id as string | null;
  }

  const meta = holdRow.metadata as Record<string, unknown> | null;
  const pref = meta?.preferred_staff_ids;
  let preferredStaffIds: string[] | null = null;
  if (Array.isArray(pref) && pref.every((id) => typeof id === "string")) {
    preferredStaffIds = pref as string[];
  }

  return { preferredStaffIds };
}
