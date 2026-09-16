export interface ActivationGates {
  has_location: boolean;
  has_coordinates: boolean;
  has_business_name: boolean;
  is_verified: boolean;
}

export function activationGateLabels(gates: ActivationGates): string[] {
  const missing: string[] = [];
  if (!gates.has_business_name) missing.push("business name");
  if (!gates.has_location) missing.push("location");
  if (!gates.is_verified) missing.push("verification");
  return missing;
}

export function isReadyToActivate(gates: ActivationGates): boolean {
  return gates.has_location && gates.has_business_name && gates.is_verified;
}
