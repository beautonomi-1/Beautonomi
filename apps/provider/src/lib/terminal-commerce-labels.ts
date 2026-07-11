/** Provider-facing labels for terminal commerce (mirrors web terminal/types.ts). */

export const TERMINAL_COMMERCIAL_MODEL_LABELS: Record<string, string> = {
  once_off_purchase: "Once-off purchase",
  rental: "Rental (legacy)",
  subscription_bundle: "Included with plan",
  lease_to_own: "Lease to own",
  financed: "Financed",
  promotional: "Promotional / free",
};

export const TERMINAL_ASSET_OWNERSHIP_LABELS: Record<string, string> = {
  provider_owned: "Owned",
  subscription_included: "Included with plan",
  platform_owned: "Platform-owned",
  leased: "Leased",
  rented: "Rented (legacy)",
};

export function formatTerminalCommercialModel(model: string): string {
  return TERMINAL_COMMERCIAL_MODEL_LABELS[model] ?? model.replace(/_/g, " ");
}

export function formatTerminalAssetOwnership(model: string): string {
  return TERMINAL_ASSET_OWNERSHIP_LABELS[model] ?? model.replace(/_/g, " ");
}
