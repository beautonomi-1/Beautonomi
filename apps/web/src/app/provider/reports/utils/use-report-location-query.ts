import { useCallback } from "react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

/**
 * Appends the portal’s selected `location_id` to report `URLSearchParams` when set.
 * Use on every provider report page that calls `/api/provider/reports/...` for parity with the app.
 */
export function useReportLocationQuery() {
  const { selectedLocationId } = useProviderPortal();
  const appendLocation = useCallback(
    (params: URLSearchParams) => {
      if (selectedLocationId) {
        params.append("location_id", selectedLocationId);
      }
    },
    [selectedLocationId]
  );
  return { selectedLocationId, appendLocation };
}
