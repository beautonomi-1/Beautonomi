export interface ProviderLocationGateInput {
  address_line1?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ActivationGatesInput {
  business_name?: string | null;
  is_verified?: boolean | null;
  provider_locations?: ProviderLocationGateInput[] | null;
}

export interface ActivationGates {
  has_location: boolean;
  has_coordinates: boolean;
  has_business_name: boolean;
  is_verified: boolean;
}

export function computeActivationGates(input: ActivationGatesInput): ActivationGates {
  const locations = input.provider_locations ?? [];
  const firstLocation = locations[0];
  const hasCoordinates =
    firstLocation?.latitude != null && firstLocation?.longitude != null;
  const hasAddressLine =
    typeof firstLocation?.address_line1 === "string" &&
    firstLocation.address_line1.trim().length > 0;

  return {
    has_location: locations.length > 0 && (hasAddressLine || hasCoordinates),
    has_coordinates: hasCoordinates,
    has_business_name: !!input.business_name,
    is_verified: !!input.is_verified,
  };
}

export function isReadyToActivate(gates: ActivationGates): boolean {
  return gates.has_location && gates.has_business_name && gates.is_verified;
}

export function activationGateLabels(gates: ActivationGates): string[] {
  const missing: string[] = [];
  if (!gates.has_business_name) missing.push("business name");
  if (!gates.has_location) missing.push("location");
  if (!gates.is_verified) missing.push("verification");
  return missing;
}
