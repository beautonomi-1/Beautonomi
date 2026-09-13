/**
 * Deep-link params to rebook the same provider with the same services prefilled.
 * Does not prefill a date or time — the customer picks a new slot.
 */
export type RebookServiceLine = {
  offering_id?: string | null;
  staff_id?: string | null;
};

export type RebookContext = {
  locationId?: string | null;
  locationType?: string | null;
};

export function buildRebookOfferingParams(services: RebookServiceLine[]): {
  service?: string;
  services?: string;
  service_ids?: string;
  service_id?: string;
  staff?: string;
  staff_id?: string;
} {
  const offeringIds = services
    .map((service) => service.offering_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const staffId = services.find((service) => service.staff_id)?.staff_id ?? undefined;

  const params: {
    service?: string;
    services?: string;
    service_ids?: string;
    service_id?: string;
    staff?: string;
    staff_id?: string;
  } = {};

  if (offeringIds.length === 1) {
    params.service = offeringIds[0];
    params.service_id = offeringIds[0];
  } else if (offeringIds.length > 1) {
    const joined = offeringIds.join(",");
    params.services = joined;
    params.service_ids = joined;
  }

  if (staffId) {
    params.staff = staffId;
    params.staff_id = staffId;
  }

  return params;
}

export function buildRebookContextParams(context?: RebookContext): {
  location_id?: string;
  location_type?: string;
} {
  if (!context) return {};
  const params: { location_id?: string; location_type?: string } = {};
  if (typeof context.locationId === "string" && context.locationId.length > 0) {
    params.location_id = context.locationId;
  }
  if (context.locationType === "at_home" || context.locationType === "at_salon") {
    params.location_type = context.locationType;
  }
  return params;
}

export function buildWebRebookHref(
  providerSlug: string,
  services: RebookServiceLine[],
  context?: RebookContext,
): string {
  const offering = buildRebookOfferingParams(services);
  const extras = buildRebookContextParams(context);
  const search = new URLSearchParams();
  if (offering.service) search.set("service", offering.service);
  else if (offering.services) search.set("services", offering.services);
  if (offering.staff) search.set("staff", offering.staff);
  if (extras.location_id) search.set("location", extras.location_id);
  if (extras.location_type) search.set("location_type", extras.location_type);
  const query = search.toString();
  return query ? `/book/${providerSlug}?${query}` : `/book/${providerSlug}`;
}

export function buildCustomerRebookParams(
  providerSlug: string,
  services: RebookServiceLine[],
  context?: RebookContext,
): Record<string, string> {
  const offering = buildRebookOfferingParams(services);
  const extras = buildRebookContextParams(context);
  const params: Record<string, string> = { slug: providerSlug };
  if (offering.service_id) params.service_id = offering.service_id;
  if (offering.service_ids) params.service_ids = offering.service_ids;
  if (offering.staff_id) params.staff_id = offering.staff_id;
  if (extras.location_id) params.location_id = extras.location_id;
  if (extras.location_type) params.location_type = extras.location_type;
  return params;
}
