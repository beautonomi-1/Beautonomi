export type OfferingResourceRequirement = {
  resource_id: string;
  name: string;
  required?: boolean;
  is_active?: boolean;
  location_id?: string | null;
};

export type AggregatedOfferingResource = {
  resource_id: string;
  name: string;
  required: boolean;
  serviceTitles: string[];
  inactive: boolean;
  locationMismatch: boolean;
};

export function aggregateOfferingResources(
  lines: Array<{ serviceTitle: string; requirements: OfferingResourceRequirement[] }>,
  selectedLocationId: string | null | undefined,
): AggregatedOfferingResource[] {
  const byId = new Map<string, AggregatedOfferingResource>();
  for (const line of lines) {
    for (const r of line.requirements ?? []) {
      const prev = byId.get(r.resource_id);
      if (!prev) {
        byId.set(r.resource_id, {
          resource_id: r.resource_id,
          name: r.name,
          required: Boolean(r.required),
          serviceTitles: [line.serviceTitle],
          inactive: r.is_active === false,
          locationMismatch:
            Boolean(selectedLocationId) &&
            Boolean(r.location_id) &&
            r.location_id !== selectedLocationId,
        });
      } else {
        prev.required = prev.required || Boolean(r.required);
        if (!prev.serviceTitles.includes(line.serviceTitle)) {
          prev.serviceTitles.push(line.serviceTitle);
        }
        if (r.is_active === false) prev.inactive = true;
        if (
          Boolean(selectedLocationId) &&
          Boolean(r.location_id) &&
          r.location_id !== selectedLocationId
        ) {
          prev.locationMismatch = true;
        }
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
