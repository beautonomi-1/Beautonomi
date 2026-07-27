import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Silently revalidate a cached-first screen every time it regains focus.
 *
 * Money surfaces (finance, transactions, payouts, sales history) have no
 * realtime channel, so re-entering them after a payout or sale must refetch —
 * `useApi`'s app-foreground listener does not fire for in-app navigation.
 *
 * This lives outside `useApi` on purpose: `useApi` is also called from
 * app-level providers that render above the navigator, where navigation focus
 * hooks have no route context and would throw.
 */
export function useFocusRevalidate(silentRefresh: () => void, enabled = true): void {
  const skipInitialFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      // The mount fetch already covers the first focus; only re-entry refetches.
      if (skipInitialFocusRef.current) {
        skipInitialFocusRef.current = false;
        return;
      }
      silentRefresh();
    }, [enabled, silentRefresh]),
  );
}
