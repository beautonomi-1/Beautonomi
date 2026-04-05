import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Tracks whether the current screen is focused. Pass `isFocused` to `useApi` as
 * `enabled: isFocused` so unfocused tabs do not refetch or compete for bandwidth
 * (same pattern as dashboard/calendar).
 */
export function useFocusedApi(): { isFocused: boolean } {
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  return { isFocused };
}
