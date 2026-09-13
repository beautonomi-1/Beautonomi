import { useMemo } from "react";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { resolvePaycloudFeatureEnabled } from "@/lib/paycloud-feature-enabled";
import { usePayCloudSettings, usePaycloudPlatformSessionDisabled } from "@/hooks/usePayCloud";

/**
 * Whether Card machines surfaces should be visible in the Partner app.
 * Uses the public flag when available, or falls back to a successful settings fetch.
 */
export function usePaycloudFeatureEnabled(): boolean {
  const flagEnabled = useFeatureFlag("payment_paycloud");
  const platformSessionDisabled = usePaycloudPlatformSessionDisabled();
  const { settings, loading, error } = usePayCloudSettings();

  return useMemo(
    () =>
      resolvePaycloudFeatureEnabled({
        flagEnabled,
        settingsAvailable: !loading && !error && settings != null,
        platformSessionDisabled,
      }),
    [flagEnabled, loading, error, settings, platformSessionDisabled],
  );
}
