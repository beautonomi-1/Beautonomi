export type HoldServiceSnapshotLine = {
  offering_id: string;
  staff_id: string | null;
};

export type GroupParticipantServiceLine = {
  service_ids: string[];
};

/**
 * Mobile hold consume sends the primary booker's lines in the hold snapshot and
 * additional guests in `group_participants`. Pricing expects every service line
 * in `draft.services` (same contract as web group checkout flattening).
 */
export function flattenHoldServicesForGroupBooking(
  snapshot: HoldServiceSnapshotLine[],
  groupParticipants: GroupParticipantServiceLine[] | null | undefined,
): { offering_id: string; staff_id: string | null }[] {
  const staffByOffering = new Map(
    snapshot.map((line) => [line.offering_id, line.staff_id ?? null]),
  );
  const base = snapshot.map((line) => ({
    offering_id: line.offering_id,
    staff_id: line.staff_id ?? null,
  }));
  if (!groupParticipants?.length) return base;

  const guestLines = groupParticipants.flatMap((participant) =>
    (participant.service_ids ?? []).map((offeringId) => ({
      offering_id: offeringId,
      staff_id: staffByOffering.get(offeringId) ?? null,
    })),
  );
  return [...base, ...guestLines];
}
