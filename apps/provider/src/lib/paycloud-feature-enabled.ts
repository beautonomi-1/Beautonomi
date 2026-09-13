/**
 * PayCloud visibility gate: public flag OR authenticated settings response.
 * Collect/checkout still requires settings.ready (see usePaycloudCollectAvailability).
 */
export function resolvePaycloudFeatureEnabled(params: {
  flagEnabled: boolean;
  settingsAvailable: boolean;
  platformSessionDisabled: boolean;
}): boolean {
  if (params.platformSessionDisabled) return false;
  return params.flagEnabled || params.settingsAvailable;
}
