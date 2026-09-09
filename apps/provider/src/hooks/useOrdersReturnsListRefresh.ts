import { useCallback } from "react";
import { invalidateOrdersAndReturnsCache } from "@/lib/api-response-cache";
import { useFocusRevalidate } from "@/hooks/useFocusRevalidate";
import { useCommerceListRealtimeRefresh } from "@/hooks/useCommerceListRealtimeRefresh";

type CommerceRealtimeTable = "product_orders" | "product_return_requests";

/**
 * Focus + realtime refresh for orders/returns lists. Clears every cached filter
 * URL first — otherwise only the active chip's entry refetches and the rest
 * keep stale status_counts until tapped.
 */
export function useOrdersReturnsListRefresh(
  silentRefresh: () => void,
  realtimeTables: readonly CommerceRealtimeTable[],
): void {
  const refreshAllCommerceLists = useCallback(() => {
    invalidateOrdersAndReturnsCache();
    silentRefresh();
  }, [silentRefresh]);

  useFocusRevalidate(refreshAllCommerceLists);
  useCommerceListRealtimeRefresh(refreshAllCommerceLists, [...realtimeTables]);
}
