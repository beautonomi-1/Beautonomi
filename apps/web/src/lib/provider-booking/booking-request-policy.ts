export function providerBookingHasServiceInput(body: Record<string, unknown>): boolean {
  const services = body.services;
  return (
    (Array.isArray(services) &&
      services.some((svc) => {
        if (!svc || typeof svc !== "object") return false;
        const row = svc as Record<string, unknown>;
        return Boolean(row.serviceId || row.service_id || row.offering_id);
      })) ||
    Boolean(body.offering_id || body.service_id)
  );
}

export function shouldRejectProductOnlyProviderBooking(body: Record<string, unknown>): boolean {
  const products = body.products;
  return !providerBookingHasServiceInput(body) && Array.isArray(products) && products.length > 0;
}
