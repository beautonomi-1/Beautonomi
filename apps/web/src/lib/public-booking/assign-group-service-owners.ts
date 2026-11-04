import { randomUUID } from "crypto";

export type GroupParticipantDraft = {
  id?: string;
  name?: string;
  participant_name?: string;
  service_ids?: string[];
  serviceIds?: string[];
};

export type ServiceLineDraft = {
  offering_id: string;
  staff_id?: string | null;
};

export type AssignedGroupServiceLine = ServiceLineDraft & {
  group_participant_id: string;
  guest_name: string | null;
};

export type AssignedGroupParticipant = {
  id: string;
  name: string;
  serviceIds: string[];
  isPrimary: boolean;
};

/**
 * Detect whether web included the primary booker as group_participants[0].
 * Clients should send `includesPrimary` explicitly: guest lines are flattened into
 * draft.services, so the subset heuristic also matches a guest-only list.
 */
export function detectPrimaryInGroupParticipants(
  draftServiceOfferingIds: string[],
  groupParticipants: GroupParticipantDraft[],
  includesPrimary?: boolean | null,
): boolean {
  if (groupParticipants.length === 0) return false;
  if (typeof includesPrimary === "boolean") return includesPrimary;
  const primaryOfferingIds = new Set(draftServiceOfferingIds);
  const firstPServiceIds: string[] =
    groupParticipants[0]?.service_ids ?? groupParticipants[0]?.serviceIds ?? [];
  return (
    firstPServiceIds.length > 0 &&
    firstPServiceIds.every((id) => primaryOfferingIds.has(id))
  );
}

/**
 * Assign each draft.services line to a group participant (stable UUIDs for DB rows).
 */
export function assignGroupServiceOwners(params: {
  draftServices: ServiceLineDraft[];
  groupParticipants: GroupParticipantDraft[];
  primaryContactName: string;
  includesPrimary?: boolean | null;
}): {
  participants: AssignedGroupParticipant[];
  assignedLines: AssignedGroupServiceLine[];
} {
  const { draftServices, groupParticipants, primaryContactName } = params;
  const offeringIdsInDraft = draftServices.map((s) => s.offering_id);
  const primaryInParticipants = detectPrimaryInGroupParticipants(
    offeringIdsInDraft,
    groupParticipants,
    params.includesPrimary,
  );

  const guestParticipants = primaryInParticipants
    ? groupParticipants.slice(1)
    : groupParticipants;

  const primaryServiceIdsFromDraft = primaryInParticipants
    ? (groupParticipants[0]?.service_ids ?? groupParticipants[0]?.serviceIds ?? [])
    : offeringIdsInDraft.filter((oid) => {
        const guestIds = new Set(
          guestParticipants.flatMap((p) => p.service_ids ?? p.serviceIds ?? []),
        );
        return !guestIds.has(oid);
      });

  // When mobile sends primary lines first then guests, primary services are draft minus guest offerings (order preserved).
  const primaryServiceIds =
    primaryInParticipants || guestParticipants.length === 0
      ? [...primaryServiceIdsFromDraft]
      : (() => {
          const guestIdSet = new Set(
            guestParticipants.flatMap((p) => p.service_ids ?? p.serviceIds ?? []),
          );
          const counts = new Map<string, number>();
          for (const g of guestParticipants) {
            for (const id of g.service_ids ?? g.serviceIds ?? []) {
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
          }
          const primaryIds: string[] = [];
          for (const line of draftServices) {
            const gCount = counts.get(line.offering_id) ?? 0;
            if (gCount > 0) {
              counts.set(line.offering_id, gCount - 1);
            } else if (!guestIdSet.has(line.offering_id) || primaryIds.length < offeringIdsInDraft.length) {
              primaryIds.push(line.offering_id);
            }
          }
          if (primaryIds.length === 0) {
            return offeringIdsInDraft.filter((id) => !guestIdSet.has(id));
          }
          return primaryIds;
        })();

  const primaryId = randomUUID();
  const primaryName =
    (primaryInParticipants
      ? groupParticipants[0]?.name ?? groupParticipants[0]?.participant_name
      : null) ?? primaryContactName;

  const participants: AssignedGroupParticipant[] = [
    {
      id: primaryId,
      name: primaryName || "Primary Contact",
      serviceIds: primaryServiceIds,
      isPrimary: true,
    },
    ...guestParticipants.map((p) => ({
      id: p.id && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : randomUUID(),
      name: (p.name ?? p.participant_name ?? "Guest") as string,
      serviceIds: (p.service_ids ?? p.serviceIds ?? []) as string[],
      isPrimary: false,
    })),
  ];

  const remaining = new Map<string, number>();
  for (const p of participants) {
    for (const sid of p.serviceIds) {
      remaining.set(sid, (remaining.get(sid) ?? 0) + 1);
    }
  }

  const participantById = new Map(participants.map((p) => [p.id, p]));
  const assignedLines: AssignedGroupServiceLine[] = [];

  for (const line of draftServices) {
    let ownerId: string | null = null;
    for (const p of participants) {
      const left = remaining.get(line.offering_id) ?? 0;
      if (left <= 0) continue;
      if (!p.serviceIds.includes(line.offering_id)) continue;
      ownerId = p.id;
      remaining.set(line.offering_id, left - 1);
      break;
    }
    if (!ownerId) {
      ownerId = primaryId;
    }
    const owner = participantById.get(ownerId)!;
    assignedLines.push({
      ...line,
      group_participant_id: ownerId,
      guest_name: owner.isPrimary ? null : owner.name,
    });
  }

  return { participants, assignedLines };
}
