/**
 * Single source of truth for whether a provider accepts PayCloud in-person card payments.
 * Prefers provider_paycloud_settings when a row exists; falls back to providers.accept_paycloud.
 */
export function resolveAcceptPaycloud(
  provider: { accept_paycloud?: boolean | null } | null | undefined,
  settings: { accept_paycloud?: boolean | null } | null | undefined,
): boolean {
  if (settings != null && typeof settings.accept_paycloud === "boolean") {
    return settings.accept_paycloud;
  }
  return provider?.accept_paycloud === true;
}
