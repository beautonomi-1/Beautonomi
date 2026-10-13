export type CheckoutGroupParticipant = {
  name: string;
  service_ids: string[];
};

/**
 * Service subtotal for group guests, aligned with hold consume payload rules:
 * drop unnamed guests; default empty service selection to the booker's services.
 */
export function groupGuestsServiceSubtotal(
  participants: CheckoutGroupParticipant[],
  snapshotOfferingIds: string[],
  priceByOfferingId: ReadonlyMap<string, number>,
): number {
  return participants
    .filter((p) => p.name.trim())
    .reduce((sum, p) => {
      const ids = p.service_ids.length > 0 ? p.service_ids : snapshotOfferingIds;
      return sum + ids.reduce((s, id) => s + (priceByOfferingId.get(id) ?? 0), 0);
    }, 0);
}

export type GroupParticipantServiceLine = {
  name: string;
  serviceIds: string[];
};

/** Web booking flow variant (`serviceIds` + inline price lookup). */
export function sumGroupParticipantServicesTotal(
  participants: GroupParticipantServiceLine[],
  bookerServiceIds: string[],
  priceForServiceId: (serviceId: string) => number,
): number {
  return participants
    .filter((p) => p.name.trim())
    .reduce((sum, p) => {
      const ids = p.serviceIds.length > 0 ? p.serviceIds : bookerServiceIds;
      return sum + ids.reduce((s, id) => s + priceForServiceId(id), 0);
    }, 0);
}
